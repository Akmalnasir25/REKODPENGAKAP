// Supabase Edge Function: save-gateway-settings
//
// Satu-satunya laluan yang userSecretKey ToyyibPay boleh lalui.
//
// PERATURAN KUNCI RAHSIA
//   - Kunci masuk sekali sahaja, dari borang admin ke Supabase Vault
//   - Ia TIDAK PERNAH disimpan dalam lajur biasa, jadi ia tidak muncul dalam
//     backup jadual, log kueri, atau eksport
//   - Ia TIDAK PERNAH dipulangkan ke browser; hanya 4 aksara terakhir
//   - Ia TIDAK PERNAH dicatat dalam log; ralat ToyyibPay ditapis sebelum
//     dikembalikan, kerana respons gateway kadang memantulkan input
//
// Kunci disahkan dengan ToyyibPay SEBELUM disimpan. Kunci yang salah ditolak
// di sini, bukan ketika sekolah pertama cuba membayar.

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

interface Body {
  scope: 'negeri' | 'daerah';
  negeriCode?: string;
  daerahCode?: string;
  categoryCode: string;
  userSecretKey?: string;      // kosong = kekalkan kunci sedia ada
  bankAccountInfo?: string;
  allowFpx?: boolean;
  allowBankTransfer?: boolean;
  allowCheque?: boolean;
  transactionFeeFlat?: number;
  isSandbox: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: 'error', message: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ status: 'error', message: 'Sesi tidak sah. Sila log masuk semula.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ status: 'error', message: 'Sesi tamat.' }, 401);

    const { data: profile } = await admin
      .from('profiles')
      .select('role, negeri_id, daerah_id, is_active')
      .eq('id', user.id)
      .single();

    if (!profile?.is_active) return json({ status: 'error', message: 'Profil tidak aktif.' }, 403);

    const body = (await req.json()) as Body;
    if (!body?.scope || !body.categoryCode?.trim()) {
      return json({ status: 'error', message: 'Skop dan kod kategori diperlukan.' }, 400);
    }

    // ── Kebenaran skop ────────────────────────────────────────────────
    // Admin daerah hanya boleh menetapkan akaun daerah SENDIRI. Tanpa
    // semakan ini, mana-mana admin daerah boleh menukar akaun daerah lain
    // dan mengalihkan kutipan mereka.
    const negeriId = body.negeriCode
      ? (await admin.from('negeri').select('id').eq('code', body.negeriCode).maybeSingle()).data?.id
      : null;
    const daerahId = body.daerahCode
      ? (await admin.from('daerah').select('id').eq('code', body.daerahCode).maybeSingle()).data?.id
      : null;

    const role = profile.role;
    const dibenarkan =
      role === 'developer' || role === 'admin'
        ? true
        : role === 'negeri_admin'
          ? body.scope === 'negeri' && negeriId && negeriId === profile.negeri_id
          : role === 'daerah_admin'
            ? body.scope === 'daerah' && daerahId && daerahId === profile.daerah_id
            : false;

    if (!dibenarkan) {
      return json({ status: 'error', message: 'Anda tiada kebenaran untuk skop ini.' }, 403);
    }

    if (body.scope === 'negeri' && !negeriId) return json({ status: 'error', message: 'Negeri tidak dijumpai.' }, 404);
    if (body.scope === 'daerah' && !daerahId) return json({ status: 'error', message: 'Daerah tidak dijumpai.' }, 404);

    // ── Baris sedia ada ───────────────────────────────────────────────
    let cari = admin
      .from('payment_gateway_settings')
      .select('id, secret_vault_id')
      .eq('provider', 'toyyibpay');
    cari = body.scope === 'negeri' ? cari.eq('negeri_id', negeriId).is('daerah_id', null)
                                   : cari.eq('daerah_id', daerahId).is('negeri_id', null);
    const { data: sedia } = await cari.maybeSingle();

    const kunciBaharu = body.userSecretKey?.trim() || '';
    if (!kunciBaharu && !sedia?.secret_vault_id) {
      return json({ status: 'error', message: 'Kunci rahsia diperlukan untuk tetapan baharu.' }, 400);
    }

    // ── Sahkan kunci dengan ToyyibPay SEBELUM menyimpan ───────────────
    // Kunci yang perlu diuji: yang baharu jika diberi, jika tidak yang sedia ada.
    let kunciUntukUji = kunciBaharu;
    if (!kunciUntukUji && sedia?.secret_vault_id) {
      // Melalui pembungkus, bukan skema vault terus — vault tidak terdedah
      // kepada PostgREST, dan pembungkus ini dihadkan kepada service_role.
      const { data: rahsia, error } = await admin.rpc('read_gateway_secret', {
        p_id: sedia.secret_vault_id,
      });
      if (error) throw error;
      kunciUntukUji = (rahsia as string) || '';
    }

    const hos = body.isSandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com';
    let sah = false;
    // Panjang dan nama medan sahaja — tiada nilai. Ini dipulangkan kepada
    // pemanggil supaya punca kegagalan kelihatan terus dalam borang, tanpa
    // perlu memburu log dalam dashboard.
    let diagnostik: Record<string, unknown> = { nota: 'panggilan tidak sempat berjalan' };
    try {
      // getCategoryDetails mengesahkan kunci DAN kod kategori sekali gus —
      // kedua-duanya mesti betul untuk mendapat balasan yang bermakna.
      // urlencoded, BUKAN FormData. API ToyyibPay membaca $_POST daripada
      // badan urlencoded; multipart/form-data tidak dibaca dengan betul dan
      // setiap panggilan kelihatan seperti kredensial salah.
      const borang = new URLSearchParams();
      borang.set('userSecretKey', kunciUntukUji);
      borang.set('categoryCode', body.categoryCode.trim());
      const res = await fetch(`${hos}/index.php/api/getCategoryDetails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: borang.toString(),
      });
      const teks = (await res.text()).trim();

      // Respons bagi kredensial sah:
      //   [{"CategoryName":"...","categoryDescription":"...","categoryStatus":"1"}]
      //
      // ⚠ Dokumentasi rasmi ToyyibPay menunjukkan "categoryName" dengan huruf
      // kecil. API sebenar memulangkan "CategoryName" dengan C BESAR. Padanan
      // peka huruf menolak kredensial yang sah — itulah punca borang ini gagal
      // berulang kali walaupun kunci dan kod kategori betul.
      //
      // Padanan dibuat tanpa mengira huruf besar-kecil supaya ia bertahan
      // walaupun ToyyibPay menyelaraskannya dengan dokumentasi kemudian.
      let kategori: any = null;
      try {
        const parsed = JSON.parse(teks);
        kategori = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch (_) { /* bukan JSON — tidak sah */ }

      const adaNamaKategori = kategori && typeof kategori === 'object'
        && Object.keys(kategori).some(
             (k) => k.toLowerCase() === 'categoryname' && String(kategori[k] ?? '').length > 0,
           );
      sah = res.ok && !!adaNamaKategori;

      // Diagnosis: nama medan sahaja, bukan nilai. Ini mendedahkan bentuk
      // respons (dan sebab padanan gagal) tanpa mencatat apa-apa kandungan —
      // ToyyibPay kadang memantulkan input dalam mesej ralat.
      let bentuk: string[] = [];
      try {
        const parsed = JSON.parse(teks);
        const objek = Array.isArray(parsed) ? parsed[0] : parsed;
        bentuk = objek && typeof objek === 'object' ? Object.keys(objek) : [`bukan-objek:${typeof objek}`];
      } catch (_) {
        bentuk = ['bukan-JSON'];
      }
      diagnostik = {
        httpStatus: res.status,
        panjangRespons: teks.length,
        medan: bentuk,
        panjangKunci: kunciUntukUji.length,
        panjangKategori: body.categoryCode.trim().length,
        kunciDari: kunciBaharu ? 'borang' : 'vault',
      };
      console.log('getCategoryDetails', {
        httpStatus: res.status,
        panjangRespons: teks.length,
        medan: bentuk,
        sah,
        // Panjang input, bukan nilainya. Respons kosong daripada ToyyibPay
        // hampir selalunya bermakna satu parameter tidak sampai — dan punca
        // paling lazim ialah kunci kosong kerana medan borang dibiar kosong
        // sedangkan tiada kunci tersimpan untuk digunakan semula.
        panjangKunci: kunciUntukUji.length,
        panjangKategori: body.categoryCode.trim().length,
        kunciDari: kunciBaharu ? 'borang' : 'vault',
      });
    } catch (e: any) {
      sah = false;
      diagnostik = { ralatRangkaian: String(e?.name || 'gagal') };
    }

    if (!sah) {
      // Sengaja TIDAK memulangkan respons ToyyibPay — ia kadang memantulkan
      // input, yang bermakna kunci boleh bocor ke browser melalui mesej ralat.
      return json({
        status: 'error',
        message: `Kunci atau kod kategori tidak sah untuk persekitaran ${body.isSandbox ? 'sandbox' : 'produksi'}. Semak semula dalam dashboard ToyyibPay.`,
        diagnostik,
      }, 400);
    }

    // ── Simpan kunci ke Vault ─────────────────────────────────────────
    let vaultId = sedia?.secret_vault_id ?? null;
    if (kunciBaharu) {
      const namaRahsia = `toyyibpay_${body.scope}_${body.negeriCode || body.daerahCode}`;
      if (vaultId) {
        const { error } = await admin.rpc('update_gateway_secret', { p_id: vaultId, p_secret: kunciBaharu });
        if (error) throw error;
      } else {
        const { data, error } = await admin.rpc('create_gateway_secret', {
          p_secret: kunciBaharu,
          p_name: namaRahsia,
        });
        if (error) throw error;
        vaultId = data as string;
      }
    }

    // ── Tulis baris tetapan ───────────────────────────────────────────
    const payload = {
      negeri_id: body.scope === 'negeri' ? negeriId : null,
      daerah_id: body.scope === 'daerah' ? daerahId : null,
      provider: 'toyyibpay',
      category_code: body.categoryCode.trim(),
      secret_vault_id: vaultId,
      masked_key: kunciBaharu ? `••••${kunciBaharu.slice(-4)}` : undefined,
      bank_account_info: body.bankAccountInfo?.trim() || null,
      // Lalai BENAR: tetapan yang disimpan tanpa menyebut togol tidak
      // sepatutnya mematikan kaedah bayaran secara senyap.
      allow_fpx: body.allowFpx ?? true,
      allow_bank_transfer: body.allowBankTransfer ?? true,
      allow_cheque: body.allowCheque ?? true,
      transaction_fee_flat: body.transactionFeeFlat ?? 1.0,
      is_sandbox: body.isSandbox,
      is_active: true,          // hanya sampai sini jika ujian sambungan lulus
      verified_at: new Date().toISOString(),
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };
    Object.keys(payload).forEach(k => (payload as any)[k] === undefined && delete (payload as any)[k]);

    if (sedia) {
      const { error } = await admin.from('payment_gateway_settings').update(payload).eq('id', sedia.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('payment_gateway_settings').insert(payload);
      if (error) throw error;
    }

    return json({
      status: 'success',
      message: `Tetapan gateway disimpan dan disahkan (${body.isSandbox ? 'sandbox' : 'produksi'}).`,
    });
  } catch (error: any) {
    // Mesej ralat dalaman tidak dipulangkan mentah — ia boleh mengandungi
    // payload permintaan, yang mengandungi kunci.
    console.error('save-gateway-settings error:', error?.message);
    return json({ status: 'error', message: 'Gagal menyimpan tetapan gateway.' }, 500);
  }
});
