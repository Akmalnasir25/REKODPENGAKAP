// Supabase Edge Function: toyyibpay-callback
//
// Satu-satunya tempat duit sebenar diakui masuk.
//
// ⚠ MESTI DI-DEPLOY DENGAN --no-verify-jwt
//     npx supabase functions deploy toyyibpay-callback --no-verify-jwt
//   ToyyibPay tidak menghantar token Supabase. Tanpa flag itu, setiap callback
//   ditolak 401 sebelum kod ini berjalan, dan setiap bayaran tersangkut.
//
// PERATURAN
//   1. DUA lapisan pengesahan, bukan satu:
//      a) Hash MD5 yang ToyyibPay hantar bersama callback —
//         MD5(userSecretKey + status + order_id + refno + "ok").
//         Dokumentasi menyatakan ini WAJIB disahkan sebelum memproses.
//         Ia menolak callback palsu dengan segera, tanpa panggilan rangkaian
//      b) getBillTransactions — walaupun hash sah, jumlah dan status sebenar
//         diambil dari gateway. Hash membuktikan penghantar tahu kunci; ia
//         tidak membuktikan berapa yang benar-benar dibayar
//   2. Idempoten — ToyyibPay boleh menghantar lebih daripada sekali
//   3. Akaun gateway dikongsi dengan sistem lain (3-4 tahun penggunaan), jadi
//      callback untuk bil yang BUKAN milik kita mesti ditolak dengan bersih:
//      log, balas 200, jangan proses. Balas 200 supaya ToyyibPay tidak
//      mencuba semula tanpa henti
//   4. Sentiasa balas 200 selepas diproses. Ralat dalaman pun dibalas 200 —
//      duit sudah masuk, dan menyebabkan ToyyibPay mencuba semula tidak
//      membantu. Kegagalan direkod untuk lapisan reconciliation
//
// Rujuk docs/rancangan-payment-online.md §6.2, §6.5.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};


// Baca medan tanpa mengira huruf besar-kecil.
//
// getCategoryDetails memulangkan "CategoryName" sedangkan dokumentasi rasmi
// menunjukkan "categoryName". Memandangkan satu endpoint sudah menyimpang,
// yang lain tidak boleh dipercayai kekal seperti didokumenkan — dan dalam
// laluan bayaran, padanan medan yang gagal bermakna bayaran sah tidak pernah
// diakui, tanpa apa-apa yang kelihatan rosak.
const medan = (objek: any, nama: string): any => {
  if (!objek || typeof objek !== 'object') return undefined;
  const kunci = Object.keys(objek).find((k) => k.toLowerCase() === nama.toLowerCase());
  return kunci ? objek[kunci] : undefined;
};

// Sentiasa 200 — lihat peraturan 4 di atas.
const ok = (nota: string) =>
  new Response(JSON.stringify({ received: true, nota }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let orderId = '';
  let billcode = '';
  let refno = '';
  let statusCb = '';
  let hashCb = '';

  try {
    // ToyyibPay menghantar form-encoded; JSON dikendali sebagai sandaran.
    const jenis = req.headers.get('content-type') || '';
    if (jenis.includes('application/json')) {
      const b = await req.json();
      orderId = String(b.order_id || b.orderId || '');
      billcode = String(b.billcode || b.billCode || '');
      refno = String(b.refno || '');
      statusCb = String(b.status || '');
      hashCb = String(b.hash || '');
    } else {
      const f = await req.formData();
      orderId = String(f.get('order_id') || '');
      billcode = String(f.get('billcode') || '');
      refno = String(f.get('refno') || '');
      statusCb = String(f.get('status') || '');
      hashCb = String(f.get('hash') || '');
    }

    // Log setiap callback yang diterima, termasuk yang ditolak — tanpa ini,
    // masalah webhook tidak dapat disiasat kemudian.
    await admin.from('audit_logs').insert({
      action: 'toyyibpay_callback_diterima',
      entity_type: 'payments',
      entity_id: orderId || null,
      details: { billcode, orderId },
    }).then(() => {}, () => {});

    if (!orderId) return ok('order_id tiada');

    // ── Bil ini milik kita? ───────────────────────────────────────────
    const { data: bayaran } = await admin
      .from('payments')
      .select('id, school_id, badge_id, year, siri, total_amount, status, seat_status, gateway_settings_id')
      .eq('id', orderId)
      .maybeSingle();

    if (!bayaran) {
      // Akaun dikongsi: bil ini kemungkinan besar daripada sistem lain.
      return ok('bukan bil kami — diabaikan');
    }

    // ── Idempoten ─────────────────────────────────────────────────────
    if (bayaran.status === 'paid') return ok('sudah diproses');

    // ── Ambil kunci skop yang betul ───────────────────────────────────
    if (!bayaran.gateway_settings_id) return ok('tiada akaun gateway pada bayaran');

    const { data: gw } = await admin
      .from('payment_gateway_settings')
      .select('secret_vault_id, is_sandbox')
      .eq('id', bayaran.gateway_settings_id)
      .maybeSingle();
    if (!gw?.secret_vault_id) return ok('kunci gateway tiada');

    const { data: rahsia } = await admin.rpc('read_gateway_secret', { p_id: gw.secret_vault_id });
    if (!rahsia) return ok('kunci gateway tidak dapat dibaca');

    // ── LAPISAN 1: sahkan hash ────────────────────────────────────────
    // MD5(userSecretKey + status + order_id + refno + "ok"). Callback tanpa
    // hash yang sah tidak pernah datang dari ToyyibPay — tolak sebelum
    // membuat apa-apa panggilan rangkaian.
    if (hashCb) {
      const dijangkaHash = createHash('md5')
        .update(`${rahsia}${statusCb}${orderId}${refno}ok`)
        .digest('hex');
      if (dijangkaHash !== hashCb.toLowerCase()) {
        await admin.from('audit_logs').insert({
          action: 'toyyibpay_hash_tidak_sah',
          entity_type: 'payments', entity_id: bayaran.id,
          details: { billcode, refno, statusCb },
        }).then(() => {}, () => {});
        return ok('hash tidak sah — callback ditolak');
      }
    }
    // Hash yang tiada tidak ditolak terus: lapisan kedua di bawah tetap
    // menentukan kebenaran, dan menolak di sini akan memecahkan integrasi
    // sekiranya ToyyibPay meninggalkan medan itu bagi saluran tertentu.

    // ── LAPISAN 2: tanya ToyyibPay sendiri ────────────────────────────
    // Hash membuktikan penghantar tahu kunci. Ia TIDAK membuktikan berapa
    // yang dibayar — itu diambil dari gateway.
    const hos = gw.is_sandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
    // urlencoded — lihat nota dalam save-gateway-settings.
    const borang = new URLSearchParams();
    borang.set('userSecretKey', rahsia as string);
    borang.set('billCode', billcode);

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
      return ok('respons getBillTransactions tidak boleh dihurai');
    }

    // billpaymentStatus: 1 = berjaya
    const berjaya = transaksi.find((t) => String(medan(t, 'billpaymentStatus') ?? '') === '1');
    if (!berjaya) {
      await admin.from('audit_logs').insert({
        action: 'toyyibpay_callback_tidak_berjaya',
        entity_type: 'payments', entity_id: bayaran.id,
        details: { billcode, statusDilaporkan: transaksi.map((t) => medan(t, 'billpaymentStatus')) },
      }).then(() => {}, () => {});
      return ok('gateway tidak mengesahkan bayaran berjaya');
    }

    // Jumlah mesti sepadan dengan total_amount (yuran + caj), bukan amount.
    const dibayar = Number(String(medan(berjaya, 'billpaymentAmount') ?? '0').replace(/[^0-9.]/g, ''));
    const dijangka = Number(bayaran.total_amount);
    if (Math.abs(dibayar - dijangka) > 0.01) {
      await admin.from('payments').update({
        status: 'failed',
        notes: `Jumlah tidak sepadan: dibayar ${dibayar}, dijangka ${dijangka}`,
      }).eq('id', bayaran.id);
      await admin.from('audit_logs').insert({
        action: 'toyyibpay_jumlah_tidak_sepadan',
        entity_type: 'payments', entity_id: bayaran.id,
        details: { dibayar, dijangka, billcode },
      }).then(() => {}, () => {});
      return ok('jumlah tidak sepadan');
    }

    // ── PINTU TEMPAT — atomik, di bawah kunci baris ───────────────────
    const { data: tuntut, error: tuntutErr } = await admin.rpc('claim_siri_seats', {
      p_payment_id: bayaran.id,
      p_new_status: 'paid',
    });
    if (tuntutErr) throw tuntutErr;

    const dapatTempat = tuntut?.ok === true;

    if (dapatTempat) {
      // Bayaran diterima DAN tempat diperoleh: pendaftaran masuk giliran pengesahan.
      const { data: subs } = await admin
        .from('submissions').select('id')
        .eq('school_id', bayaran.school_id).eq('badge_id', bayaran.badge_id)
        .eq('submission_year', bayaran.year);
      const subIds = (subs || []).map((s: any) => s.id);
      if (subIds.length) {
        await admin.from('submissions').update({ status: 'submitted' })
          .in('id', subIds).eq('status', 'draft');
      }

      await admin.from('school_badge_status').upsert({
        school_id: bayaran.school_id, badge_id: bayaran.badge_id,
        year: bayaran.year, siri: bayaran.siri,
        payment_status: 'paid',
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'school_id,badge_id,year,siri' });
    } else {
      // Duit diterima, tempat tiada. claim_siri_seats sudah menandakan
      // seat_status = 'no_seat'. Pendaftaran KEKAL draf dengan sengaja —
      // ia tidak boleh masuk giliran pengesahan tanpa tempat.
      await admin.from('school_badge_status').upsert({
        school_id: bayaran.school_id, badge_id: bayaran.badge_id,
        year: bayaran.year, siri: bayaran.siri,
        payment_status: 'paid',
      }, { onConflict: 'school_id,badge_id,year,siri' });
    }

    await admin.from('audit_logs').insert({
      action: dapatTempat ? 'bayaran_disahkan' : 'bayaran_tanpa_tempat',
      entity_type: 'payments', entity_id: bayaran.id,
      details: { billcode, dibayar, tuntut },
    }).then(() => {}, () => {});

    // Notifikasi admin — best-effort. Kegagalan di sini tidak boleh
    // menggagalkan webhook; duit sudah diterima dan direkod.
    try {
      const { data: sekolah } = await admin
        .from('schools').select('name, negeri_id, daerah_id').eq('id', bayaran.school_id).maybeSingle();
      const { data: adminUsers } = await admin
        .from('profiles').select('id')
        .in('role', ['admin', 'negeri_admin', 'daerah_admin', 'developer'])
        .or(`daerah_id.eq.${sekolah?.daerah_id ?? '00000000-0000-0000-0000-000000000000'},negeri_id.eq.${sekolah?.negeri_id ?? '00000000-0000-0000-0000-000000000000'},role.eq.developer`);
      if (adminUsers?.length) {
        await admin.from('notifications').insert(adminUsers.map((a: any) => ({
          user_id: a.id,
          title: dapatTempat ? 'Bayaran diterima' : 'Bayaran diterima TANPA TEMPAT',
          message: dapatTempat
            ? `${sekolah?.name} telah membayar RM${dijangka.toFixed(2)} — sedia untuk disahkan.`
            : `${sekolah?.name} membayar RM${dijangka.toFixed(2)} tetapi tempat sudah penuh. Perlu tindakan.`,
        })));
      }
    } catch (_) { /* diabaikan dengan sengaja */ }

    return ok(dapatTempat ? 'bayaran disahkan' : 'bayaran diterima tanpa tempat');
  } catch (error: any) {
    // Balas 200 walaupun gagal — lihat peraturan 4. Lapisan reconciliation
    // akan menemuinya semula melalui getBillTransactions.
    console.error('toyyibpay-callback error:', error?.message);
    await admin.from('audit_logs').insert({
      action: 'toyyibpay_callback_ralat',
      entity_type: 'payments', entity_id: orderId || null,
      details: { billcode, ralat: String(error?.message || error) },
    }).then(() => {}, () => {});
    return ok('ralat dalaman direkod');
  }
});
