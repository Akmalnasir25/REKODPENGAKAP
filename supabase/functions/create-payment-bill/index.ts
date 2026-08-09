// Supabase Edge Function: create-payment-bill
//
// Mencipta bil bagi satu pendaftaran (sekolah × program × tahun × siri).
//
// PERATURAN YANG DIKUATKUASAKAN DI SINI
//   - Jumlah dikira SEPENUHNYA di server. Tiada angka dari pelayar dipercayai;
//     badan permintaan hanya memilih program, siri dan kaedah bayaran
//   - Peranan yang dicaj datang dari program_settings; jumlahnya dari
//     resolve_program_fees (override siri / jenis sekolah)
//   - Caj FPX dikenakan kepada pembayar oleh gateway (billChargeToCustomer=0),
//     bukan ditambah ke jumlah bil kita. Penganjur menerima jumlah yuran yang
//     tepat, dan kita tidak perlu meneka kadar caj
//   - Akaun gateway diselesaikan mengikut skop. TIADA fallback senyap:
//     daerah tanpa akaun tidak akan tersilap mengutip ke akaun daerah lain
//   - Jumlah RM0 melangkau pintu bayaran sepenuhnya, bukan mencipta bil RM0
//     yang mustahil dibayar
//
// Rujuk docs/rancangan-payment-online.md §6.1.

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

const TEMPOH_BIL_MINIT = 30;

type Kaedah = 'toyyibpay' | 'bank_transfer' | 'cheque';

interface Body {
  badgeName: string;
  year: number;
  siri: number;
  method: Kaedah;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: 'error', message: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appUrl = Deno.env.get('APP_BASE_URL') || 'https://scoutnadi.web.app';

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ status: 'error', message: 'Sesi tidak sah. Sila log masuk semula.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ status: 'error', message: 'Sesi tamat.' }, 401);

    const { data: profile } = await admin
      .from('profiles').select('role, school_id, is_active').eq('id', user.id).single();
    if (!profile?.is_active || !profile.school_id) {
      return json({ status: 'error', message: 'Profil sekolah tidak aktif.' }, 403);
    }

    const body = (await req.json()) as Body;
    const siri = Number(body?.siri) || 1;
    const year = Number(body?.year);
    if (!body?.badgeName || !year || !body?.method) {
      return json({ status: 'error', message: 'Program, tahun dan kaedah bayaran diperlukan.' }, 400);
    }

    const schoolId = profile.school_id as string;

    const { data: school } = await admin
      .from('schools').select('id, name, school_type, negeri_id, daerah_id').eq('id', schoolId).single();
    const { data: badge } = await admin
      .from('badges').select('id, name, scope').eq('name', body.badgeName).maybeSingle();
    if (!school || !badge) return json({ status: 'error', message: 'Sekolah atau program tidak dijumpai.' }, 404);

    // ── Tetapan program ikut skop ─────────────────────────────────────
    const { data: psId } = await admin.rpc('resolve_program_setting', {
      p_school_id: schoolId, p_badge_id: badge.id, p_year: year,
    });
    if (!psId) return json({ status: 'error', message: 'Tetapan yuran untuk program ini belum ditetapkan.' }, 400);

    const { data: ps } = await admin
      .from('program_settings')
      .select('id, payment_enabled, payment_online_required, fee_peserta, fee_pemimpin, fee_penolong, negeri_id, daerah_id')
      .eq('id', psId).single();
    if (!ps?.payment_online_required) {
      return json({ status: 'error', message: 'Program ini tidak memerlukan bayaran online.' }, 400);
    }

    // ── Kira bilangan mengikut peranan ────────────────────────────────
    const { data: subs } = await admin
      .from('submissions').select('id')
      .eq('school_id', schoolId).eq('badge_id', badge.id).eq('submission_year', year);
    const subIds = (subs || []).map((s: any) => s.id);
    if (subIds.length === 0) return json({ status: 'error', message: 'Tiada pendaftaran dijumpai.' }, 404);

    const { data: people } = await admin
      .from('submission_people').select('role')
      .in('submission_id', subIds)
      .eq('siri', siri)
      .eq('is_deleted', false)
      .or('is_withdrawn.is.null,is_withdrawn.eq.false');

    // Siri tanpa seorang pun peserta BUKAN pendaftaran percuma — ia siri yang
    // salah. Tanpa semakan ini kedua-duanya menghasilkan RM0, dan cabang RM0 di
    // bawah menghantar pendaftaran terus ke pengesahan tanpa bayaran. Sekolah
    // masuk statistik secara percuma, dan tiada apa-apa yang kelihatan rosak.
    if ((people || []).length === 0) {
      return json({
        status: 'error',
        message: `Tiada peserta direkodkan untuk Siri ${siri} dalam program ini. `
               + `Sila semak penapis siri anda sebelum menghantar.`,
      }, 400);
    }

    const kira = { peserta: 0, pemimpin: 0, penolong: 0 };
    (people || []).forEach((p: any) => {
      const r = String(p.role || 'PESERTA').toUpperCase();
      if (r === 'PESERTA' || r === 'PENERIMA RAMBU') kira.peserta++;
      else if (r === 'PEMIMPIN') kira.pemimpin++;
      else if (r.includes('PENOLONG')) kira.penolong++;
      // PENGUJI sengaja diabaikan — tiada lajur yuran untuknya
    });

    // ── Yuran: peranan dari program_settings, jumlah dari override ────
    const { data: yuranRows } = await admin.rpc('resolve_program_fees', {
      p_program_setting_id: psId,
      p_siri: siri,
      p_school_type: school.school_type || 'lain',
    });
    const yuran = Array.isArray(yuranRows) ? yuranRows[0] : yuranRows;

    const amount =
      (ps.fee_peserta  !== null ? kira.peserta  * Number(yuran?.fee_peserta  ?? ps.fee_peserta)  : 0) +
      (ps.fee_pemimpin !== null ? kira.pemimpin * Number(yuran?.fee_pemimpin ?? ps.fee_pemimpin) : 0) +
      (ps.fee_penolong !== null ? kira.penolong * Number(yuran?.fee_penolong ?? ps.fee_penolong) : 0);

    // ── Jumlah RM0: langkau pintu bayaran ─────────────────────────────
    // Berlaku bila sekolah mendaftar hanya peranan yang tidak dicaj. Mencipta
    // bil RM0 akan menyekat mereka pada skrin yang mustahil dilepasi.
    if (amount <= 0) {
      await admin.from('school_badge_status').upsert({
        school_id: schoolId, badge_id: badge.id, year, siri,
        payment_status: 'not_required', status: 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'school_id,badge_id,year,siri' });
      await admin.from('submissions').update({ status: 'submitted' })
        .in('id', subIds).eq('status', 'draft');
      return json({ status: 'success', skipped: true, message: 'Tiada yuran dikenakan. Pendaftaran terus dihantar untuk pengesahan.' });
    }

    // ── Tempat & tarikh tutup ─────────────────────────────────────────
    const { data: sedia } = await admin.rpc('check_siri_availability', {
      p_school_id: schoolId, p_badge_id: badge.id, p_year: year, p_siri: siri,
    });
    if (sedia && sedia.ok === false) {
      const sebab = sedia.sebab === 'siri_ditutup' ? 'Siri ini telah ditutup.'
        : sedia.sebab === 'tarikh_tutup_berlalu' ? 'Tarikh tutup bayaran telah berlalu.'
        : sedia.sebab === 'tempat_penuh' || sedia.baki === 0 ? 'Tempat bagi siri ini telah penuh.'
        : 'Pendaftaran bagi siri ini tidak dibuka.';
      return json({ status: 'error', message: sebab }, 400);
    }

    // ── Akaun gateway ikut skop, tiada fallback ───────────────────────
    let gq = admin.from('payment_gateway_settings')
      .select('id, category_code, secret_vault_id, transaction_fee_flat, is_sandbox, is_active')
      .eq('provider', 'toyyibpay');
    gq = (badge.scope || 'daerah') === 'negeri'
      ? gq.eq('negeri_id', ps.negeri_id).is('daerah_id', null)
      : gq.eq('daerah_id', ps.daerah_id).is('negeri_id', null);
    const { data: gw } = await gq.maybeSingle();

    const bolehOnline = !!(gw?.is_active && gw.category_code && gw.secret_vault_id);
    if (body.method === 'toyyibpay' && !bolehOnline) {
      return json({
        status: 'error',
        message: 'Bayaran online tidak tersedia untuk daerah/negeri ini. Sila guna pindahan bank atau cek.',
      }, 400);
    }

    // ── Batalkan bil terbuka sedia ada ────────────────────────────────
    // Indeks unik separa membenarkan hanya satu bil terbuka per siri. Bil lama
    // dibatalkan supaya senarai peserta yang berubah tidak dibil pada jumlah lapuk.
    await admin.from('payments')
      .update({ status: 'cancelled', notes: 'Digantikan oleh bil baharu' })
      .eq('school_id', schoolId).eq('badge_id', badge.id).eq('year', year).eq('siri', siri)
      .eq('status', 'pending');

    // Caj FPX dikenakan kepada pembayar oleh gateway sendiri melalui
    // billChargeToCustomer=0, jadi ia TIDAK ditambah ke jumlah bil kita.
    // Kesannya: penganjur menerima jumlah yuran yang tepat, dan kita tidak
    // perlu meneka kadar caj yang boleh berubah tanpa kita sedar.
    const caj = 0;
    const total = amount;
    const luput = new Date(Date.now() + TEMPOH_BIL_MINIT * 60 * 1000);

    const { data: bayaran, error: insErr } = await admin.from('payments').insert({
      school_id: schoolId, badge_id: badge.id, year, siri,
      submission_id: subIds[0],
      amount, transaction_fee: caj, total_amount: total,
      snapshot_peserta: kira.peserta, snapshot_pemimpin: kira.pemimpin, snapshot_penolong: kira.penolong,
      method: body.method,
      status: 'pending',
      gateway_settings_id: gw?.id ?? null,
      expires_at: luput.toISOString(),
    }).select('id').single();
    if (insErr) throw insErr;

    await admin.from('school_badge_status').upsert({
      school_id: schoolId, badge_id: badge.id, year, siri, payment_status: 'pending',
    }, { onConflict: 'school_id,badge_id,year,siri' });

    // ── Kaedah manual: tiada panggilan gateway ────────────────────────
    if (body.method !== 'toyyibpay') {
      return json({
        status: 'success',
        paymentId: bayaran.id,
        amount, transactionFee: 0, totalAmount: total,
        expiresAt: luput.toISOString(),
        message: 'Bil dijana. Sila buat bayaran dan muat naik bukti.',
      });
    }

    // ── ToyyibPay createBill ──────────────────────────────────────────
    const { data: rahsia, error: vaultErr } = await admin.rpc('read_gateway_secret', { p_id: gw!.secret_vault_id });
    if (vaultErr || !rahsia) throw new Error('Kunci gateway tidak dapat dibaca');

    const hos = gw!.is_sandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
    const pad = (n: number) => String(n).padStart(2, '0');

    // billExpiryDate MESTI dalam waktu Malaysia (UTC+8).
    //
    // Edge Function berjalan pada UTC, jadi getHours() memulangkan jam UTC.
    // ToyyibPay ialah perkhidmatan Malaysia dan membaca angka yang dihantar
    // sebagai waktu tempatan — menghantar jam UTC bermakna setiap bil dicipta
    // dengan tarikh luput lapan jam yang LALU, dan ToyyibPay memaparkan
    // "This bill is inactive" serta-merta.
    //
    // Anjakan +8 jam kemudian baca komponen UTC memberi waktu Malaysia yang
    // betul tanpa bergantung pada zon waktu pelayan.
    const OFFSET_MYT_MS = 8 * 60 * 60 * 1000;
    const luputMyt = new Date(luput.getTime() + OFFSET_MYT_MS);
    const expiryStr = `${pad(luputMyt.getUTCDate())}-${pad(luputMyt.getUTCMonth() + 1)}-${luputMyt.getUTCFullYear()} ${pad(luputMyt.getUTCHours())}:${pad(luputMyt.getUTCMinutes())}:${pad(luputMyt.getUTCSeconds())}`;

    // urlencoded — lihat nota dalam save-gateway-settings.
    const borang = new URLSearchParams();
    borang.set('userSecretKey', rahsia as string);
    borang.set('categoryCode', gw!.category_code!);
    // billName dihadkan 30 aksara oleh ToyyibPay
    borang.set('billName', `${badge.name} S${siri}`.slice(0, 30));
    borang.set('billDescription', `${school.name} · ${badge.name} Siri ${siri} ${year}`.slice(0, 100));
    borang.set('billPriceSetting', '1');          // jumlah tetap — pembayar tak boleh ubah
    borang.set('billPayorInfo', '1');
    // Jumlah yuran sahaja. Caj FPX ditambah oleh gateway di atas ini.
    borang.set('billAmount', String(Math.round(total * 100)));   // sen; Math.round elak ralat float
    borang.set('billReturnUrl', `${appUrl}/?bayaran=${bayaran.id}`);
    borang.set('billCallbackUrl', `${supabaseUrl}/functions/v1/toyyibpay-callback`);
    borang.set('billExternalReferenceNo', bayaran.id);
    borang.set('billTo', school.name);
    borang.set('billEmail', user.email || 'noreply@scoutnadi.my');
    borang.set('billPhone', '0000000000');
    borang.set('billPaymentChannel', '0');        // FPX sahaja — caj kad ialah peratusan
    borang.set('billChargeToCustomer', '0');      // caj FPX ditanggung sekolah, dikutip gateway
    borang.set('billExpiryDate', expiryStr);

    const res = await fetch(`${hos}/index.php/api/createBill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: borang.toString(),
    });
    const teks = await res.text();
    let billCode = '';
    try {
      const parsed = JSON.parse(teks);
      billCode = medan(Array.isArray(parsed) ? parsed[0] : parsed, 'BillCode');
    } catch (_) { /* respons bukan JSON — dikendali di bawah */ }

    if (!billCode) {
      // Bil gagal dicipta di gateway; jangan tinggalkan baris pending yatim.
      await admin.from('payments').update({ status: 'failed', notes: 'createBill gagal' }).eq('id', bayaran.id);
      console.error('createBill gagal', { status: res.status });
      return json({ status: 'error', message: 'Gagal menjana bil di ToyyibPay. Sila cuba lagi atau guna bayaran manual.' }, 502);
    }

    const billUrl = `${hos}/${billCode}`;
    await admin.from('payments').update({ external_bill_code: billCode, bill_url: billUrl }).eq('id', bayaran.id);

    return json({
      status: 'success',
      paymentId: bayaran.id,
      billUrl,
      amount, transactionFee: caj, totalAmount: total,
      expiresAt: luput.toISOString(),
    });
  } catch (error: any) {
    console.error('create-payment-bill error:', error?.message);
    return json({ status: 'error', message: 'Gagal menjana bil.' }, 500);
  }
});
