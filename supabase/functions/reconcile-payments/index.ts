// Supabase Edge Function: reconcile-payments
//
// Lapisan 3 dalam strategi cuba-semula (§6.4). Dipanggil oleh pg_cron setiap
// beberapa minit — bukan oleh pengguna.
//
// ⚠ DEPLOY DENGAN --no-verify-jwt
//     npx supabase functions deploy reconcile-payments --no-verify-jwt
//   pg_net tidak menghantar JWT Supabase. Sebaliknya fungsi ini dilindungi
//   oleh rahsia kongsi dalam header, yang disimpan dalam Vault di sebelah
//   pangkalan data supaya ia tidak muncul dalam jadual cron.job sebagai teks
//   biasa.
//
// APA YANG IA TANGKAP
//   Webhook gagal sampai DAN sekolah tidak kembali ke app. Kedua-dua lapisan
//   sebelumnya terlepas kes itu, dan tanpa lapisan ini duit sudah masuk tetapi
//   sistem terus menunggu selama-lamanya.
//
// PERATURAN PEMBATALAN YANG PALING PENTING
//   Bil yang lewat TIDAK dibatalkan secara membuta. FPX boleh mengambil
//   sehingga 30 minit memulangkan keputusan, dan tempoh itu bertindih dengan
//   tempoh luput bil kita. Membatalkan bil yang mempunyai transaksi tergantung
//   akan memusnahkan bayaran yang sedang dalam perjalanan.
//
//   Hanya bil yang gateway melaporkan TIADA percubaan transaksi langsung
//   dibatalkan.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Lihat nota dalam save-gateway-settings: ejaan medan ToyyibPay tidak boleh
// dipercayai sepadan dengan dokumentasinya.
const medan = (objek: any, nama: string): any => {
  if (!objek || typeof objek !== 'object') return undefined;
  const kunci = Object.keys(objek).find((k) => k.toLowerCase() === nama.toLowerCase());
  return kunci ? objek[kunci] : undefined;
};

const USIA_MINIMUM_MINIT = 5;   // beri webhook peluang dahulu
const HAD_SATU_LARIAN = 50;     // elak larian panjang menyekat pool sambungan

serve(async (req) => {
  const rahsiaDijangka = Deno.env.get('RECONCILE_SECRET');
  const rahsiaDiberi = req.headers.get('x-reconcile-secret');
  if (!rahsiaDijangka || rahsiaDiberi !== rahsiaDijangka) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ringkasan = { disemak: 0, disahkan: 0, dibatalkan: 0, gagal: 0, tergantung: 0 };

  try {
    const ambang = new Date(Date.now() - USIA_MINIMUM_MINIT * 60 * 1000).toISOString();

    const { data: senarai } = await admin
      .from('payments')
      .select('id, external_bill_code, gateway_settings_id, total_amount, expires_at, method')
      .eq('status', 'pending')
      .eq('method', 'toyyibpay')
      .not('external_bill_code', 'is', null)
      .lt('created_at', ambang)
      .limit(HAD_SATU_LARIAN);

    for (const bayaran of senarai || []) {
      ringkasan.disemak++;
      try {
        const { data: gw } = await admin
          .from('payment_gateway_settings')
          .select('secret_vault_id, is_sandbox')
          .eq('id', bayaran.gateway_settings_id)
          .maybeSingle();
        if (!gw?.secret_vault_id) continue;

        const { data: rahsia } = await admin.rpc('read_gateway_secret', { p_id: gw.secret_vault_id });
        if (!rahsia) continue;

        const hos = gw.is_sandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
        const borang = new URLSearchParams();
        borang.set('userSecretKey', rahsia as string);
        borang.set('billCode', bayaran.external_bill_code);

        const res = await fetch(`${hos}/index.php/api/getBillTransactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: borang.toString(),
        });
        const teks = await res.text();

        let transaksi: any[] = [];
        try {
          const parsed = JSON.parse(teks);
          transaksi = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) { continue; }   // respons pelik — cuba lagi larian berikutnya

        const statusSemua = transaksi
          .map((t) => String(medan(t, 'billpaymentStatus') ?? ''))
          .filter((x) => x.length > 0);

        const berjaya = transaksi.find((t) => String(medan(t, 'billpaymentStatus') ?? '') === '1');

        if (berjaya) {
          const dibayar = Number(String(medan(berjaya, 'billpaymentAmount') ?? '0').replace(/[^0-9.]/g, ''));
          if (Math.abs(dibayar - Number(bayaran.total_amount)) > 0.01) {
            await admin.from('payments').update({
              status: 'failed',
              notes: `Reconciliation: jumlah tidak sepadan (${dibayar} vs ${bayaran.total_amount})`,
            }).eq('id', bayaran.id);
            ringkasan.gagal++;
            continue;
          }

          // Urutan yang sama dengan webhook dan check-status (migrasi 033).
          const { data: hasil } = await admin.rpc('finalize_payment', {
            p_payment_id: bayaran.id, p_new_status: 'paid',
          });
          ringkasan.disahkan++;
          await admin.from('audit_logs').insert({
            action: 'bayaran_disahkan_oleh_reconciliation',
            entity_type: 'payments', entity_id: bayaran.id,
            details: { dibayar, hasil },
          }).then(() => {}, () => {});
          continue;
        }

        // Transaksi tergantung (2 atau 4): JANGAN sentuh. FPX boleh mengambil
        // sehingga 30 minit, dan membatalkan di sini memusnahkan bayaran yang
        // sedang dalam perjalanan.
        if (statusSemua.some((x) => x === '2' || x === '4')) {
          ringkasan.tergantung++;
          continue;
        }

        // Semua percubaan gagal (3): sekolah boleh menjana bil baharu.
        if (statusSemua.length > 0 && statusSemua.every((x) => x === '3')) {
          await admin.from('payments').update({
            status: 'failed',
            notes: 'Reconciliation: semua percubaan bayaran gagal di gateway',
          }).eq('id', bayaran.id);
          ringkasan.gagal++;
          continue;
        }

        // TIADA percubaan langsung, dan bil sudah lewat: sekolah mendapat
        // pautan tetapi tidak pernah cuba membayar. Selamat dibatalkan.
        const luput = bayaran.expires_at ? new Date(bayaran.expires_at).getTime() : 0;
        if (statusSemua.length === 0 && luput && Date.now() > luput) {
          await admin.from('payments').update({
            status: 'cancelled',
            notes: 'Reconciliation: bil luput tanpa sebarang percubaan bayaran',
          }).eq('id', bayaran.id);
          // school_badge_status.payment_status kekal 'pending' — sekolah
          // masih perlu membayar, dan bil yang dibatalkan tidak mengubah itu.
          // (Kemas kini di sini pernah ditulis tanpa penapis penuh, yang akan
          // menyentuh setiap program sekolah itu. Ia tidak diperlukan langsung.)
          ringkasan.dibatalkan++;
        }
      } catch (e: any) {
        console.error('reconcile item error', bayaran.id, e?.message);
      }
    }

    await admin.from('audit_logs').insert({
      action: 'reconciliation_dijalankan',
      entity_type: 'payments',
      details: ringkasan,
    }).then(() => {}, () => {});

    return json({ ok: true, ...ringkasan });
  } catch (error: any) {
    console.error('reconcile-payments error:', error?.message);
    return json({ ok: false, error: 'ralat dalaman', ...ringkasan }, 500);
  }
});
