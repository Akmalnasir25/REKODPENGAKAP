// Supabase Edge Function: create-payment-bill
//
// Mencipta SATU bil bagi satu siri (sekolah × tahun × siri), merangkumi semua
// program yang mempunyai peserta draf dalam siri itu.
//
// Rujuk docs/rancangan-payment-online.md §13.
//
// PERATURAN YANG DIKUATKUASAKAN DI SINI
//   - Jumlah dikira SEPENUHNYA di server. Badan permintaan hanya memilih
//     tahun, siri dan kaedah bayaran — tiada nama program, tiada angka
//   - Peranan yang dicaj datang dari program_settings; jumlahnya dari
//     resolve_program_fees (override siri / jenis sekolah)
//   - Program yang tempatnya tidak mencukupi DILANGKAU dan kekal draf
//     (keputusan 13a). Ia boleh dibil kemudian bila had dinaikkan
//   - Program berjumlah RM0 atau tanpa pintu bayaran dihantar TERUS ke
//     giliran pengesahan, tanpa masuk ke dalam bil
//   - Caj FPX dikenakan kepada pembayar oleh gateway (billChargeToCustomer=0)
//   - Akaun gateway diselesaikan mengikut skop program. TIADA fallback senyap
//
// KENAPA SEBAB DILANGKAU DIKUMPUL DAN DIPULANGKAN
//   Sekolah yang menekan Hantar dan tidak nampak apa-apa berlaku akan
//   menganggap sistem rosak. Setiap program yang tidak masuk ke dalam bil
//   mesti dinamakan berserta sebabnya.

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
// yang lain tidak boleh dipercayai kekal seperti didokumenkan.
const medan = (objek: any, nama: string): any => {
  if (!objek || typeof objek !== 'object') return undefined;
  const kunci = Object.keys(objek).find((k) => k.toLowerCase() === nama.toLowerCase());
  return kunci ? objek[kunci] : undefined;
};

const TEMPOH_BIL_MINIT = 30;

type Kaedah = 'toyyibpay' | 'bank_transfer' | 'cheque';

interface Body {
  year: number;
  siri: number;
  method: Kaedah;
}

interface Item {
  badgeId: string;
  badgeName: string;
  amount: number;
  kira: { peserta: number; pemimpin: number; penolong: number; pembantu: number };
  gatewayId: string | null;
}

interface Dilangkau {
  program: string;
  sebab: string;
}

interface SudahDibayar {
  program: string;
  dibayarUntuk: number;   // bilangan orang dalam snapshot bil yang dibayar
  kini: number;           // bilangan orang sekarang
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
    if (!year || !body?.method) {
      return json({ status: 'error', message: 'Tahun dan kaedah bayaran diperlukan.' }, 400);
    }

    const schoolId = profile.school_id as string;

    const { data: school } = await admin
      .from('schools').select('id, name, school_type, negeri_id, daerah_id').eq('id', schoolId).single();
    if (!school) return json({ status: 'error', message: 'Sekolah tidak dijumpai.' }, 404);

    // ── Bil terbuka sedia ada ─────────────────────────────────────────
    // Disemak SEBELUM sebarang kerja: bukti yang sedang disemak admin tidak
    // boleh dibatalkan secara senyap oleh sekolah menekan Hantar sekali lagi.
    const { data: bilTerbuka } = await admin
      .from('payment_bills')
      .select('id, status')
      .eq('school_id', schoolId).eq('year', year).eq('siri', siri)
      .in('status', ['pending', 'pending_review'])
      .maybeSingle();

    if (bilTerbuka?.status === 'pending_review') {
      return json({
        status: 'error',
        message: 'Bukti bayaran anda bagi siri ini sedang disemak admin. Sila tunggu keputusannya.',
      }, 409);
    }

    // ── Program yang mempunyai peserta dalam siri ini ─────────────────
    const { data: subs } = await admin
      .from('submissions').select('id, badge_id')
      .eq('school_id', schoolId).eq('submission_year', year);
    const semuaSubIds = (subs || []).map((s: any) => s.id);
    if (semuaSubIds.length === 0) {
      return json({ status: 'error', message: 'Tiada pendaftaran dijumpai untuk tahun ini.' }, 404);
    }

    const { data: orang } = await admin
      .from('submission_people').select('submission_id, role')
      .in('submission_id', semuaSubIds)
      .eq('siri', siri)
      .eq('is_deleted', false)
      .or('is_withdrawn.is.null,is_withdrawn.eq.false');

    if (!orang || orang.length === 0) {
      return json({
        status: 'error',
        message: `Tiada peserta direkodkan untuk Siri ${siri}. Sila semak penapis siri anda sebelum menghantar.`,
      }, 400);
    }

    const badgeBagiSub = new Map<string, string>();
    (subs || []).forEach((s: any) => badgeBagiSub.set(s.id, s.badge_id));

    // Kiraan peranan bagi setiap program dalam siri ini.
    const kiraanIkutBadge = new Map<string, { peserta: number; pemimpin: number; penolong: number; pembantu: number }>();
    orang.forEach((p: any) => {
      const badgeId = badgeBagiSub.get(p.submission_id);
      if (!badgeId) return;
      const k = kiraanIkutBadge.get(badgeId) || { peserta: 0, pemimpin: 0, penolong: 0, pembantu: 0 };
      const r = String(p.role || 'PESERTA').toUpperCase();
      if (r === 'PESERTA' || r === 'PENERIMA RAMBU') k.peserta++;
      else if (r === 'PEMIMPIN') k.pemimpin++;
      else if (r.includes('PENOLONG')) k.penolong++;
      // PEMBANTU mempunyai kadar dan snapshotnya sendiri sejak migrasi 051.
      // Ia TIDAK boleh dikira ke dalam baldi penolong: snapshot itulah yang
      // menentukan siapa sudah dilindungi bila bil susulan dijana, dan
      // mencampurkan dua kadar berbeza di situ mengecaj jumlah yang salah.
      else if (r === 'PEMBANTU') k.pembantu++;
      // PENGUJI sengaja diabaikan — tiada lajur yuran untuknya
      kiraanIkutBadge.set(badgeId, k);
    });

    const badgeIds = Array.from(kiraanIkutBadge.keys());
    const { data: badges } = await admin
      .from('badges').select('id, name, scope').in('id', badgeIds);
    const badgeById = new Map<string, any>();
    (badges || []).forEach((b: any) => badgeById.set(b.id, b));

    // Siri yang sudah dihantar atau disahkan tidak dibil semula.
    const { data: statusSedia } = await admin
      .from('school_badge_status').select('badge_id, status, payment_status')
      .eq('school_id', schoolId).eq('year', year).eq('siri', siri);
    const statusBagiBadge = new Map<string, any>();
    (statusSedia || []).forEach((r: any) => statusBagiBadge.set(r.badge_id, r));

    // Program yang SUDAH DIBAYAR bagi siri ini dilangkau. Tanpa ini, bil kedua
    // selepas had dinaikkan (§13.11) akan mengecaj semula program yang sudah
    // dijelaskan dalam bil pertama.
    const { data: bayaranSedia } = await admin
      .from('payments')
      .select('badge_id, status, snapshot_peserta, snapshot_pemimpin, snapshot_penolong, snapshot_pembantu')
      .eq('school_id', schoolId).eq('year', year).eq('siri', siri)
      .in('status', ['paid', 'pending_review']);

    // Berapa orang yang bayaran sedia ada BENAR-BENAR meliputi, per peranan.
    //
    // Kehadiran baris 'paid' tidak memberitahu bilangannya. Snapshot
    // memberitahu — dan perbandingan mesti per PERANAN, bukan jumlah
    // keseluruhan: sekolah yang membayar 2 peserta kemudian menambah seorang
    // pemimpin mempunyai jumlah yang sama tetapi hutang yang berbeza.
    const dilindungi = new Map<string, { peserta: number; pemimpin: number; penolong: number; pembantu: number }>();
    (bayaranSedia || []).forEach((r: any) => {
      const d = dilindungi.get(r.badge_id) || { peserta: 0, pemimpin: 0, penolong: 0, pembantu: 0 };
      d.peserta  += r.snapshot_peserta  ?? 0;
      d.pemimpin += r.snapshot_pemimpin ?? 0;
      d.penolong += r.snapshot_penolong ?? 0;
      d.pembantu += r.snapshot_pembantu ?? 0;
      dilindungi.set(r.badge_id, d);
    });

    // ── Nilai setiap program ──────────────────────────────────────────
    const item: Item[] = [];
    const dilangkau: Dilangkau[] = [];
    const sudahDibayar: SudahDibayar[] = [];
    const terusHantar: string[] = [];   // badge_id yang tidak perlu bayaran
    // Sudah dibayar sepenuhnya tetapi belum berada dalam giliran — cth kerana
    // admin membukanya semula. Wang sudah masuk, jadi ia mesti boleh kembali
    // ke giliran tanpa membayar dua kali.
    const hantarSemula: string[] = [];

    for (const badgeId of badgeIds) {
      const badge = badgeById.get(badgeId);
      if (!badge) continue;
      const nama = badge.name as string;
      const kira = kiraanIkutBadge.get(badgeId)!;

      const sedia = statusBagiBadge.get(badgeId);
      if (sedia && ['submitted', 'approved'].includes(sedia.status)) {
        continue;   // sudah dalam giliran; bukan dilangkau, cuma tiada kerja
      }
      const { data: psId } = await admin.rpc('resolve_program_setting', {
        p_school_id: schoolId, p_badge_id: badgeId, p_year: year,
      });

      // Tiada tetapan program = tiada pintu bayaran. Hantar terus.
      if (!psId) { terusHantar.push(badgeId); continue; }

      const { data: ps } = await admin
        .from('program_settings')
        .select('id, payment_online_required, submission_open, fee_peserta, fee_pemimpin, fee_penolong, fee_pembantu, negeri_id, daerah_id')
        .eq('id', psId).single();

      // Kedua-dua togol ialah per program x SIRI sejak §15. Dibaca melalui
      // penyelesai, bukan terus daripada program_settings: pencetus pangkalan
      // data membaca nilai yang sama, dan dua bacaan berasingan bagi peraturan
      // yang sama akan menyimpang.
      const [{ data: bolehHantar }, { data: perluBayar }] = await Promise.all([
        admin.rpc('siri_submission_open',  { p_program_setting_id: psId, p_siri: siri }),
        admin.rpc('siri_payment_required', { p_program_setting_id: psId, p_siri: siri }),
      ]);

      // Penghantaran belum dibuka admin (§14). Disemak SEBELUM apa-apa lagi:
      // program percuma pun tidak boleh dihantar, dan mencipta bil untuk
      // program yang tidak boleh dihantar hanya mengambil wang tanpa guna.
      if (bolehHantar === false) {
        dilangkau.push({ program: nama, sebab: `penghantaran Siri ${siri} belum dibuka oleh admin` });
        continue;
      }

      // Siri percuma: tiada bil, hantar terus. Satu siri boleh mengandungi
      // program berbayar dan program percuma serentak — gelung ini sudah
      // mengasingkannya per badge.
      if (!perluBayar) { terusHantar.push(badgeId); continue; }

      const { data: yuranRows } = await admin.rpc('resolve_program_fees', {
        p_program_setting_id: psId,
        p_siri: siri,
        p_school_type: school.school_type || 'lain',
      });
      const yuran = Array.isArray(yuranRows) ? yuranRows[0] : yuranRows;

      // Hanya yang BELUM dilindungi oleh bayaran terdahulu dicaj (§13.12).
      // Bil susulan mengecaj beza, bukan jumlah penuh dan bukan tiada apa-apa.
      const lindung = dilindungi.get(badgeId) || { peserta: 0, pemimpin: 0, penolong: 0, pembantu: 0 };
      const baki = {
        peserta:  Math.max(0, kira.peserta  - lindung.peserta),
        pemimpin: Math.max(0, kira.pemimpin - lindung.pemimpin),
        penolong: Math.max(0, kira.penolong - lindung.penolong),
        pembantu: Math.max(0, kira.pembantu - lindung.pembantu),
      };

      if (dilindungi.has(badgeId) && baki.peserta + baki.pemimpin + baki.penolong + baki.pembantu === 0) {
        // Dilindungi sepenuhnya. Dilangkau supaya sekolah tidak dibil dua
        // kali — tetapi DILAPORKAN, kerana program yang hilang dari bil tanpa
        // penjelasan kelihatan seperti sistem tersilap kira.
        sudahDibayar.push({
          program: nama,
          dibayarUntuk: lindung.peserta + lindung.pemimpin + lindung.penolong + lindung.pembantu,
          kini: kira.peserta + kira.pemimpin + kira.penolong + kira.pembantu,
        });
        // Sudah dibayar tetapi belum dalam giliran. Berlaku apabila admin
        // membuka semula pendaftaran yang sudah dijelaskan: melangkaunya
        // sahaja meninggalkan sekolah tersekat selama-lamanya — mereka tidak
        // boleh dibil semula, dan tiada apa lagi menghantar pendaftaran itu.
        if (!sedia || !['submitted', 'approved'].includes(sedia.status)) {
          hantarSemula.push(badgeId);
        }
        continue;
      }

      const amount =
        (ps.fee_peserta  !== null ? baki.peserta  * Number(yuran?.fee_peserta  ?? ps.fee_peserta)  : 0) +
        (ps.fee_pemimpin !== null ? baki.pemimpin * Number(yuran?.fee_pemimpin ?? ps.fee_pemimpin) : 0) +
        (ps.fee_penolong !== null ? baki.penolong * Number(yuran?.fee_penolong ?? ps.fee_penolong) : 0) +
        (ps.fee_pembantu !== null ? baki.pembantu * Number(yuran?.fee_pembantu ?? ps.fee_pembantu) : 0);

      // RM0 bermakna tiada peranan yang didaftarkan dicaj. Bil RM0 akan
      // menyekat sekolah pada skrin yang mustahil dilepasi.
      if (amount <= 0) { terusHantar.push(badgeId); continue; }

      // Tempat yang diminta = peranan DICAJ yang belum dilindungi, sama
      // seperti claim_siri_seats yang membaca snapshot bil ini sendiri.
      const minta =
        (ps.fee_peserta  !== null ? baki.peserta  : 0) +
        (ps.fee_pemimpin !== null ? baki.pemimpin : 0) +
        (ps.fee_penolong !== null ? baki.penolong : 0) +
        (ps.fee_pembantu !== null ? baki.pembantu : 0);

      const { data: sedia2 } = await admin.rpc('check_siri_availability', {
        p_school_id: schoolId, p_badge_id: badgeId, p_year: year,
        p_siri: siri, p_minta: minta,
      });
      if (sedia2 && sedia2.ok === false) {
        dilangkau.push({
          program: nama,
          sebab: sedia2.sebab === 'siri_ditutup' ? 'siri telah ditutup'
            : sedia2.sebab === 'tarikh_tutup_berlalu' ? 'tarikh tutup bayaran telah berlalu'
            : sedia2.sebab === 'tempat_penuh'
              ? `tempat tidak mencukupi (baki ${sedia2.baki ?? 0}, perlu ${minta})`
              : 'pendaftaran tidak dibuka',
        });
        continue;
      }

      // Akaun gateway ikut skop program.
      let gq = admin.from('payment_gateway_settings')
        .select('id, category_code, secret_vault_id, is_sandbox, is_active, allow_fpx, allow_bank_transfer, allow_cheque')
        .eq('provider', 'toyyibpay');
      gq = (badge.scope || 'daerah') === 'negeri'
        ? gq.eq('negeri_id', ps.negeri_id).is('daerah_id', null)
        : gq.eq('daerah_id', ps.daerah_id).is('negeri_id', null);
      const { data: gw } = await gq.maybeSingle();
      const bolehOnline = !!(gw?.is_active && gw.allow_fpx !== false
        && gw.category_code && gw.secret_vault_id);

      if (body.method === 'toyyibpay' && !bolehOnline) {
        dilangkau.push({ program: nama, sebab: 'bayaran online tidak tersedia untuk skop ini' });
        continue;
      }

      // Togol kaedah dikuatkuasakan di SERVER, bukan hanya disembunyikan pada
      // skrin. Pilihan yang tidak dipaparkan masih boleh dipanggil terus.
      // Skop tanpa baris gateway kekal membenarkan bayaran manual.
      if (body.method === 'bank_transfer' && gw && gw.allow_bank_transfer === false) {
        dilangkau.push({ program: nama, sebab: 'pindahan bank tidak dibuka untuk skop ini' });
        continue;
      }
      if (body.method === 'cheque' && gw && gw.allow_cheque === false) {
        dilangkau.push({ program: nama, sebab: 'bayaran cek tidak dibuka untuk skop ini' });
        continue;
      }

      // kira → baki: snapshot MESTI merekod apa yang bil ini bayar, bukan
      // keseluruhan siri. Pengiraan tempat membaca snapshot ini (migrasi 043).
      item.push({ badgeId, badgeName: nama, amount, kira: baki, gatewayId: gw?.id ?? null });
    }

    // ── Satu bil, satu akaun gateway ──────────────────────────────────
    // Program berskop negeri dan berskop daerah boleh menyelesaikan kepada
    // akaun BERBEZA. Satu bil ToyyibPay hanya boleh masuk ke satu akaun, jadi
    // yang tidak sepadan dilangkau dan dinamakan — bukan dikutip ke akaun
    // orang lain secara senyap.
    let itemDibil = item;
    if (body.method === 'toyyibpay' && item.length > 0) {
      const gatewayUtama = item[0].gatewayId;
      itemDibil = item.filter(i => i.gatewayId === gatewayUtama);
      item.filter(i => i.gatewayId !== gatewayUtama).forEach(i =>
        dilangkau.push({ program: i.badgeName, sebab: 'akaun bayaran berbeza; perlu dibayar berasingan' }));
    }

    // ── Program tanpa bayaran: hantar terus ───────────────────────────
    for (const badgeId of terusHantar) {
      await admin.from('school_badge_status').upsert({
        school_id: schoolId, badge_id: badgeId, year, siri,
        payment_status: 'not_required', status: 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'school_id,badge_id,year,siri' });
      const subIdsBadge = (subs || []).filter((s: any) => s.badge_id === badgeId).map((s: any) => s.id);
      if (subIdsBadge.length > 0) {
        await admin.from('submissions').update({ status: 'submitted' })
          .in('id', subIdsBadge).eq('status', 'draft');
      }
    }

    // ── Sudah dibayar, dikembalikan ke giliran ────────────────────────
    // payment_status TIDAK disentuh: ia sudah 'paid', dan menulis semula
    // 'not_required' seperti laluan terusHantar akan memadam fakta bahawa
    // wang pernah diterima.
    for (const badgeId of hantarSemula) {
      await admin.from('school_badge_status')
        .update({ status: 'submitted' })
        .eq('school_id', schoolId).eq('badge_id', badgeId)
        .eq('year', year).eq('siri', siri)
        .neq('status', 'approved');
      const subIdsBadge = (subs || []).filter((s: any) => s.badge_id === badgeId).map((s: any) => s.id);
      if (subIdsBadge.length > 0) {
        await admin.from('submissions').update({ status: 'submitted' })
          .in('id', subIdsBadge).eq('status', 'draft');
      }
    }

    if (itemDibil.length === 0) {
      if (terusHantar.length > 0 || hantarSemula.length > 0) {
        return json({
          status: 'success', skipped: true, dilangkau, sudahDibayar,
          message: hantarSemula.length > 0
            ? 'Program yang sudah dibayar dikembalikan ke giliran pengesahan.'
            : dilangkau.length > 0
              ? 'Sebahagian program dihantar tanpa bayaran; selebihnya dilangkau.'
              : 'Tiada yuran dikenakan. Pendaftaran terus dihantar untuk pengesahan.',
        });
      }
      if (sudahDibayar.length > 0) {
        return json({
          status: 'success', skipped: true, dilangkau, sudahDibayar,
          message: 'Semua program dalam siri ini sudah dibayar.',
        });
      }
      return json({
        status: 'error',
        dilangkau,
        message: dilangkau.length > 0
          ? `Tiada program yang boleh dibil: ${dilangkau.map(d => `${d.program} (${d.sebab})`).join('; ')}.`
          : 'Tiada program yang memerlukan bayaran untuk siri ini.',
      }, 400);
    }

    // ── Batalkan bil terbuka sedia ada ────────────────────────────────
    if (bilTerbuka?.id) {
      await admin.from('payments')
        .update({ status: 'cancelled', notes: 'Digantikan oleh bil baharu' })
        .eq('bill_id', bilTerbuka.id).eq('status', 'pending');
      await admin.from('payment_bills')
        .update({ status: 'cancelled', notes: 'Digantikan oleh bil baharu' })
        .eq('id', bilTerbuka.id);
    }

    const amount = itemDibil.reduce((n, i) => n + i.amount, 0);
    // Caj FPX dikenakan kepada pembayar oleh gateway sendiri melalui
    // billChargeToCustomer=0, jadi ia TIDAK ditambah ke jumlah bil kita.
    const caj = 0;
    const total = amount;
    const luput = new Date(Date.now() + TEMPOH_BIL_MINIT * 60 * 1000);
    const gatewayId = itemDibil[0].gatewayId;

    const { data: bil, error: bilErr } = await admin.from('payment_bills').insert({
      school_id: schoolId, year, siri,
      amount, transaction_fee: caj, total_amount: total,
      method: body.method,
      status: 'pending',
      gateway_settings_id: gatewayId,
      expires_at: luput.toISOString(),
    }).select('id').single();
    if (bilErr) throw bilErr;

    const { error: itemErr } = await admin.from('payments').insert(
      itemDibil.map(i => ({
        bill_id: bil.id,
        school_id: schoolId, badge_id: i.badgeId, year, siri,
        submission_id: (subs || []).find((s: any) => s.badge_id === i.badgeId)?.id ?? null,
        amount: i.amount, transaction_fee: 0, total_amount: i.amount,
        snapshot_peserta: i.kira.peserta,
        snapshot_pemimpin: i.kira.pemimpin,
        snapshot_penolong: i.kira.penolong,
        snapshot_pembantu: i.kira.pembantu,
        method: body.method,
        status: 'pending',
        gateway_settings_id: gatewayId,
        expires_at: luput.toISOString(),
      })),
    );
    if (itemErr) throw itemErr;

    for (const i of itemDibil) {
      await admin.from('school_badge_status').upsert({
        school_id: schoolId, badge_id: i.badgeId, year, siri, payment_status: 'pending',
      }, { onConflict: 'school_id,badge_id,year,siri' });
    }

    const pecahan = itemDibil.map(i => ({
      program: i.badgeName, amount: i.amount,
      peserta: i.kira.peserta, pemimpin: i.kira.pemimpin, penolong: i.kira.penolong, pembantu: i.kira.pembantu,
    }));

    // ── Kaedah manual: tiada panggilan gateway ────────────────────────
    if (body.method !== 'toyyibpay') {
      return json({
        status: 'success',
        paymentId: bil.id,
        amount, transactionFee: 0, totalAmount: total,
        expiresAt: luput.toISOString(),
        pecahan, dilangkau, sudahDibayar,
        message: 'Bil dijana. Sila buat bayaran dan muat naik bukti.',
      });
    }

    // ── ToyyibPay createBill ──────────────────────────────────────────
    const { data: gwPenuh } = await admin
      .from('payment_gateway_settings')
      .select('category_code, secret_vault_id, is_sandbox')
      .eq('id', gatewayId).single();

    const { data: rahsia, error: vaultErr } = await admin.rpc('read_gateway_secret', { p_id: gwPenuh!.secret_vault_id });
    if (vaultErr || !rahsia) throw new Error('Kunci gateway tidak dapat dibaca');

    const hos = gwPenuh!.is_sandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
    const pad = (n: number) => String(n).padStart(2, '0');

    // billExpiryDate MESTI dalam waktu Malaysia (UTC+8).
    //
    // Edge Function berjalan pada UTC, jadi getHours() memulangkan jam UTC.
    // ToyyibPay ialah perkhidmatan Malaysia dan membaca angka yang dihantar
    // sebagai waktu tempatan — menghantar jam UTC bermakna setiap bil dicipta
    // dengan tarikh luput lapan jam yang LALU, dan ToyyibPay memaparkan
    // "This bill is inactive" serta-merta.
    const OFFSET_MYT_MS = 8 * 60 * 60 * 1000;
    const luputMyt = new Date(luput.getTime() + OFFSET_MYT_MS);
    const expiryStr = `${pad(luputMyt.getUTCDate())}-${pad(luputMyt.getUTCMonth() + 1)}-${luputMyt.getUTCFullYear()} ${pad(luputMyt.getUTCHours())}:${pad(luputMyt.getUTCMinutes())}:${pad(luputMyt.getUTCSeconds())}`;

    const senaraiProgram = itemDibil.map(i => i.badgeName).join(', ');

    // urlencoded — lihat nota dalam save-gateway-settings.
    const borang = new URLSearchParams();
    borang.set('userSecretKey', rahsia as string);
    borang.set('categoryCode', gwPenuh!.category_code!);
    // billName dihadkan 30 aksara oleh ToyyibPay
    borang.set('billName', `Pendaftaran Siri ${siri}`.slice(0, 30));
    borang.set('billDescription', `${school.name} · Siri ${siri} ${year} · ${senaraiProgram}`.slice(0, 100));
    borang.set('billPriceSetting', '1');          // jumlah tetap — pembayar tak boleh ubah
    borang.set('billPayorInfo', '1');
    borang.set('billAmount', String(Math.round(total * 100)));   // sen; Math.round elak ralat float
    borang.set('billReturnUrl', `${appUrl}/?bayaran=${bil.id}`);
    borang.set('billCallbackUrl', `${supabaseUrl}/functions/v1/toyyibpay-callback`);
    borang.set('billExternalReferenceNo', bil.id);
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
      await admin.from('payments').update({ status: 'failed', notes: 'createBill gagal' }).eq('bill_id', bil.id);
      await admin.from('payment_bills').update({ status: 'failed', notes: 'createBill gagal' }).eq('id', bil.id);
      console.error('createBill gagal', { status: res.status });
      return json({ status: 'error', message: 'Gagal menjana bil di ToyyibPay. Sila cuba lagi atau guna bayaran manual.' }, 502);
    }

    const billUrl = `${hos}/${billCode}`;
    await admin.from('payment_bills')
      .update({ external_bill_code: billCode, bill_url: billUrl }).eq('id', bil.id);

    return json({
      status: 'success',
      paymentId: bil.id,
      billUrl,
      amount, transactionFee: caj, totalAmount: total,
      expiresAt: luput.toISOString(),
      pecahan, dilangkau, sudahDibayar,
    });
  } catch (error: any) {
    console.error('create-payment-bill error:', error?.message);
    return json({ status: 'error', message: 'Gagal menjana bil.' }, 500);
  }
});
