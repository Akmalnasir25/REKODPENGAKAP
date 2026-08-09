// Supabase Edge Function: check-payment-status
//
// Lapisan 1 dalam strategi cuba-semula (§6.4): dipanggil sebaik sekolah
// kembali dari ToyyibPay, TANPA menunggu webhook.
//
// Ini yang menangkap majoriti bayaran. Webhook ToyyibPay tiada jaminan retry
// yang kukuh — kalau ia gagal sampai, sekolah akan melihat "menunggu bayaran"
// selama-lamanya walaupun duit sudah keluar. Dengan menanya gateway sendiri
// pada saat sekolah kembali, kes itu hilang untuk hampir semua orang.
//
// Selamat dipanggil berulang kali: pengesahan sebenar dan penuntutan tempat
// berlaku dalam finalize_bill, yang idempoten.
//
// paymentId yang diterima ialah id BIL (§13). Satu bil merangkumi semua
// program dalam satu siri; finalize_bill menyelesaikan setiap satu.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Lihat nota dalam save-gateway-settings: getCategoryDetails memulangkan
// 'CategoryName' walaupun dokumentasi menunjukkan huruf kecil, jadi tiada
// medan ToyyibPay boleh dipercayai kekal seperti didokumenkan.
const medan = (objek: any, nama: string): any => {
  if (!objek || typeof objek !== 'object') return undefined;
  const kunci = Object.keys(objek).find((k) => k.toLowerCase() === nama.toLowerCase());
  return kunci ? objek[kunci] : undefined;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: 'error', message: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ status: 'error', message: 'Sesi tidak sah.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: 'error', message: 'Sesi tamat.' }, 401);

    const { paymentId } = await req.json();
    if (!paymentId) return json({ status: 'error', message: 'paymentId diperlukan.' }, 400);

    const { data: bayaran } = await admin
      .from('payment_bills')
      .select('id, school_id, status, method, total_amount, external_bill_code, gateway_settings_id, expires_at')
      .eq('id', paymentId)
      .maybeSingle();
    if (!bayaran) return json({ status: 'error', message: 'Bayaran tidak dijumpai.' }, 404);

    // Tempat dituntut per PROGRAM, jadi satu bil boleh berakhir sebahagian
    // berjaya. Bil dianggap bermasalah jika ada satu pun program tanpa tempat
    // — itulah yang perlu tindakan admin.
    const { data: itemBil } = await admin
      .from('payments').select('seat_status').eq('bill_id', paymentId);
    const seatStatus = (itemBil || []).some((i: any) => i.seat_status === 'no_seat') ? 'no_seat' : 'ok';

    // Sekolah hanya boleh menyemak bayaran sendiri. Admin boleh menyemak
    // mana-mana — mereka perlukannya untuk giliran "dibayar tanpa tempat".
    const { data: profile } = await admin
      .from('profiles').select('role, school_id').eq('id', user.id).single();
    const adminPenuh = ['developer', 'admin', 'negeri_admin', 'daerah_admin'].includes(profile?.role || '');
    if (!adminPenuh && profile?.school_id !== bayaran.school_id) {
      return json({ status: 'error', message: 'Tiada kebenaran.' }, 403);
    }

    // Sudah selesai — tiada apa perlu ditanya kepada gateway.
    if (['paid', 'rejected', 'cancelled', 'failed'].includes(bayaran.status)) {
      return json({
        status: 'success',
        paymentStatus: bayaran.status,
        seatStatus,
      });
    }

    // Kaedah manual tidak boleh disemak dengan gateway — statusnya berubah
    // hanya apabila admin mengesahkan bukti.
    if (bayaran.method !== 'toyyibpay' || !bayaran.external_bill_code) {
      return json({
        status: 'success',
        paymentStatus: bayaran.status,
        seatStatus,
      });
    }

    const { data: gw } = await admin
      .from('payment_gateway_settings')
      .select('secret_vault_id, is_sandbox')
      .eq('id', bayaran.gateway_settings_id)
      .maybeSingle();
    if (!gw?.secret_vault_id) {
      return json({ status: 'success', paymentStatus: bayaran.status, seatStatus });
    }

    const { data: rahsia } = await admin.rpc('read_gateway_secret', { p_id: gw.secret_vault_id });
    if (!rahsia) {
      return json({ status: 'success', paymentStatus: bayaran.status, seatStatus });
    }

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
    } catch (_) {
      return json({ status: 'success', paymentStatus: bayaran.status, seatStatus });
    }

    const berjaya = transaksi.find((t) => String(medan(t, 'billpaymentStatus') ?? '') === '1');
    if (!berjaya) {
      // Termasuk kes 'pending' (SBI BANK C boleh mengambil sehingga 30 minit).
      // Bil TIDAK ditandakan gagal di sini — lapisan cron yang memutuskan,
      // selepas menyemak semula. Menandakannya gagal sekarang akan memusnahkan
      // bayaran yang sedang dalam perjalanan.
      const statusGateway = transaksi.map((t) => String(medan(t, 'billpaymentStatus') ?? ''));
      return json({
        status: 'success',
        paymentStatus: bayaran.status,
        seatStatus,
        gatewayPending: statusGateway.includes('2') || statusGateway.includes('4'),
      });
    }

    // Pembayar membayar yuran DITAMBAH caj FPX (billChargeToCustomer=0), jadi
    // billpaymentAmount melaporkan jumlah yang keluar dari poket mereka - bukan
    // jumlah bil kita. Padanan tepat menolak setiap bayaran yang sah.
    //
    // Kurang daripada jumlah bil TIDAK mungkin berlaku: billPriceSetting=1
    // mengunci amaun di gateway. Jadi lebihan sentiasa caj gateway, dan hanya
    // kekurangan yang menandakan sesuatu yang salah.
    const dibayar = Number(String(medan(berjaya, 'billpaymentAmount') ?? '0').replace(/[^0-9.]/g, ''));
    const dijangka = Number(bayaran.total_amount);
    if (dibayar < dijangka - 0.01) {
      await admin.from('audit_logs').insert({
        action: 'semak_status_jumlah_tidak_sepadan',
        entity_type: 'payment_bills', entity_id: bayaran.id,
        details: { dibayar, dijangka },
      }).then(() => {}, () => {});
      return json({ status: 'error', message: 'Jumlah bayaran tidak sepadan. Hubungi admin.' }, 409);
    }

      // Rekod caj sebenar. Ini menjadikan baris bayaran mencerminkan apa yang
      // benar-benar berlaku, dan menjadikan semakan idempoten seterusnya padan
      // dengan tepat.
    if (dibayar > dijangka + 0.01) {
      await admin.from('payment_bills').update({
        transaction_fee: Number((dibayar - dijangka).toFixed(2)),
        total_amount: dibayar,
      }).eq('id', bayaran.id);
    }

    // Urutan selepas pengesahan dikongsi dengan webhook — lihat migrasi 040.
    const { data: hasil, error: finErr } = await admin.rpc('finalize_bill', {
      p_bill_id: bayaran.id,
      p_new_status: 'paid',
    });
    if (finErr) throw finErr;

    await admin.from('audit_logs').insert({
      action: hasil?.ok ? 'bayaran_disahkan_semasa_kembali' : 'bayaran_tanpa_tempat_semasa_kembali',
      entity_type: 'payment_bills', entity_id: bayaran.id,
      details: { dibayar, hasil },
    }).then(() => {}, () => {});

    return json({
      status: 'success',
      paymentStatus: 'paid',
      seatStatus: (hasil?.tiadaTempat ?? 0) > 0 ? 'no_seat' : 'ok',
      message: (hasil?.tiadaTempat ?? 0) === 0
        ? 'Bayaran diterima. Pendaftaran anda kini menunggu pengesahan admin.'
        : `Bayaran diterima, tetapi tempat bagi ${hasil.tiadaTempat} program sudah penuh. Admin akan menghubungi anda.`,
    });
  } catch (error: any) {
    console.error('check-payment-status error:', error?.message);
    return json({ status: 'error', message: 'Gagal menyemak status bayaran.' }, 500);
  }
});
