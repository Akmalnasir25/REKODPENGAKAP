import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { DataResit } from './receiptService';

// ============================================================
// Lapisan bayaran untuk sekolah.
//
// Satu BIL merangkumi semua program dalam satu siri (§13). `paymentId` di
// seluruh fail ini bermaksud id bil — nama dikekalkan supaya URL pulangan
// gateway yang sudah tersebar (?bayaran=<id>) kekal sah.
//
// Setiap jumlah datang dari server. Tiada fungsi di sini menghantar harga —
// ia hanya memilih tahun, siri dan kaedah.
// ============================================================

export type KaedahBayaran = 'toyyibpay' | 'bank_transfer' | 'cheque';

export interface PecahanProgram {
  program: string;
  amount: number;
  peserta: number;
  pemimpin: number;
  penolong: number;
}

export interface ProgramDilangkau {
  program: string;
  sebab: string;
}

export interface ProgramSudahDibayar {
  program: string;
  dibayarUntuk: number;
  kini: number;
}

export interface BilDijana {
  paymentId: string;
  billUrl?: string;
  amount: number;
  transactionFee: number;
  totalAmount: number;
  expiresAt: string;
  /** Pecahan mengikut program — inilah yang sekolah perlu lihat sebelum bayar. */
  pecahan?: PecahanProgram[];
  /** Program yang tidak masuk ke dalam bil, berserta sebabnya. */
  dilangkau?: ProgramDilangkau[];
  /** Program yang dilangkau kerana sudah dibayar sebelum ini. */
  sudahDibayar?: ProgramSudahDibayar[];
  /** true bila tiada yuran langsung — pintu bayaran dilangkau. */
  skipped?: boolean;
  message?: string;
}

const panggil = async (fungsi: string, badan: unknown) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesi tamat. Sila log masuk semula.');

  const res = await fetch(`${EDGE_FUNCTION_URL}/${fungsi}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(badan),
  });
  const hasil = await res.json().catch(() => null);
  if (!res.ok || hasil?.status === 'error') {
    throw new Error(hasil?.message || 'Ralat sambungan.');
  }
  return hasil;
};

/** Satu bil untuk seluruh siri. Server memilih program mana yang masuk. */
export const janaBil = (input: {
  year: number; siri: number; method: KaedahBayaran;
}): Promise<BilDijana> => panggil('create-payment-bill', input);

export interface StatusBayaran {
  paymentStatus: 'pending' | 'pending_review' | 'paid' | 'rejected' | 'failed' | 'cancelled';
  seatStatus: 'ok' | 'no_seat';
  gatewayPending?: boolean;
  message?: string;
}

/**
 * Lapisan 1 dalam strategi cuba-semula: dipanggil sebaik sekolah kembali dari
 * gateway, tanpa menunggu webhook. Selamat dipanggil berulang kali.
 */
export const semakStatusBayaran = (paymentId: string): Promise<StatusBayaran> =>
  panggil('check-payment-status', { paymentId });

export const hantarBuktiBayaran = (input: {
  paymentId: string;
  referenceNumber: string;
  method: 'bank_transfer' | 'cheque';
  bukti?: { fileName: string; filePath: string; mimeType?: string; fileSize?: number };
  notes?: string;
}): Promise<StatusBayaran> => panggil('submit-payment-proof', input);

/**
 * Kaedah bayaran yang tersedia untuk sekolah pemanggil bagi program ini.
 *
 * Melalui RPC berskop sekolah, BUKAN view payment_gateway_settings_public —
 * view itu berakhir dengan `else false` dan tidak memulangkan apa-apa kepada
 * pengguna sekolah.
 */
export const getArahanBayaranManual = async (
  badgeName: string, year: number,
): Promise<{ bankAccountInfo: string | null; adaOnline: boolean }> => {
  try {
    const { data, error } = await supabase.rpc('get_payment_methods', {
      p_badge_name: badgeName,
      p_year: year,
    });
    if (error) throw error;
    const baris = Array.isArray(data) ? data[0] : data;
    return {
      bankAccountInfo: baris?.bank_account_info ?? null,
      adaOnline: !!baris?.online_available,
    };
  } catch (error) {
    console.error('getArahanBayaranManual error:', error);
    return { bankAccountInfo: null, adaOnline: false };
  }
};

/**
 * Tahun, siri dan program yang bil ini sebenarnya meliputi.
 *
 * Diperlukan kerana `billReturnUrl` menyebabkan MUAT SEMULA PENUH halaman.
 * Selepas itu penapis UI kembali kepada nilai awalnya, jadi skrin bayaran yang
 * dibuka semula tidak lagi tahu apa yang sedang dibayar. Bil tahu.
 */
export const getMaklumatBayaran = async (
  billId: string,
): Promise<{ year: number; siri: number; programs: string[] } | null> => {
  try {
    const { data, error } = await supabase
      .from('payment_bills')
      .select('year, siri, payments(badge:badge_id(name))')
      .eq('id', billId)
      .maybeSingle();
    if (error || !data) return null;
    const programs = ((data as any).payments || [])
      .map((p: any) => (Array.isArray(p.badge) ? p.badge[0] : p.badge)?.name)
      .filter(Boolean);
    return { year: data.year, siri: data.siri ?? 1, programs };
  } catch (error) {
    console.error('getMaklumatBayaran error:', error);
    return null;
  }
};

export const BALDI_BUKTI = 'payment-proofs';

/**
 * Muat naik bukti bayaran ke baldi PERSENDIRIAN payment-proofs.
 *
 * Bukan R2 — r2-presigned-upload tidak pernah di-deploy ke projek ini dan
 * tiada kredensial R2 ditetapkan, jadi setiap panggilan berakhir sebagai 404
 * yang pelayar laporkan sebagai ralat CORS.
 *
 * Segmen pertama laluan MESTI id bil — polisi storan (migrasi 038) membaca
 * segmen itu untuk menentukan siapa boleh melihat fail ini.
 */
export const muatNaikBukti = async (
  paymentId: string, fail: File,
): Promise<{ fileName: string; filePath: string; mimeType: string; fileSize: number }> => {
  const ext = (fail.name.split('.').pop() || 'bin').toLowerCase();
  const laluan = `${paymentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BALDI_BUKTI)
    .upload(laluan, fail, { contentType: fail.type, upsert: false });
  if (error) throw new Error(error.message || 'Gagal memuat naik bukti.');

  return { fileName: fail.name, filePath: laluan, mimeType: fail.type, fileSize: fail.size };
};

/** URL bertandatangan untuk melihat bukti. Luput dalam 5 minit. */
export const urlBukti = async (filePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(BALDI_BUKTI)
    .createSignedUrl(filePath, 300);
  if (error) {
    console.error('urlBukti error:', error);
    return null;
  }
  return data?.signedUrl ?? null;
};

// ============================================================
// Sebelah admin
// ============================================================

export interface BayaranUntukSemakan {
  id: string;
  schoolName: string;
  year: number;
  siri: number;
  amount: number;
  method: string;
  status: string;
  /** 'no_seat' jika MANA-MANA program dalam bil ini tiada tempat. */
  seatStatus: string;
  referenceNumber: string | null;
  paidAt: string | null;
  programs: Array<{ name: string; amount: number; seatStatus: string }>;
  bukti: Array<{ fileName: string; filePath: string }>;
}

/**
 * Bil yang memerlukan perhatian admin:
 *   pending_review — bukti manual menunggu semakan
 *   no_seat        — duit diterima tetapi tempat sudah penuh bagi sekurang-
 *                    kurangnya satu program dalam bil itu
 *
 * RLS pada `payment_bills` sudah mengehadkan hasil kepada skop admin.
 */
export const getBayaranUntukSemakan = async (): Promise<BayaranUntukSemakan[]> => {
  try {
    const { data, error } = await supabase
      .from('payment_bills')
      .select(`
        id, year, siri, amount, method, status, reference_number, paid_at,
        school:school_id(name),
        payments(amount, seat_status, badge:badge_id(name)),
        attachments(file_name, file_path, category)
      `)
      .order('paid_at', { ascending: false, nullsFirst: false });
    if (error) throw error;

    return (data || [])
      .map((r: any) => {
        const programs = (r.payments || []).map((p: any) => ({
          name: (Array.isArray(p.badge) ? p.badge[0] : p.badge)?.name || '-',
          amount: Number(p.amount ?? 0),
          seatStatus: p.seat_status,
        }));
        return {
          id: r.id,
          schoolName: (Array.isArray(r.school) ? r.school[0] : r.school)?.name || '-',
          year: r.year,
          siri: r.siri ?? 1,
          amount: Number(r.amount ?? 0),
          method: r.method,
          status: r.status,
          seatStatus: programs.some((p: any) => p.seatStatus === 'no_seat') ? 'no_seat' : 'ok',
          referenceNumber: r.reference_number,
          paidAt: r.paid_at,
          programs,
          bukti: (r.attachments || [])
            .filter((a: any) => a.category === 'payment_proof')
            .map((a: any) => ({ fileName: a.file_name, filePath: a.file_path })),
        };
      })
      // Penapisan dibuat di klien kerana syarat "mana-mana program tiada
      // tempat" hidup pada baris ANAK, dan PostgREST tidak boleh menapis
      // induk berdasarkan keadaan anak dalam satu kueri bersarang.
      .filter(b => b.status === 'pending_review'
        || (b.seatStatus === 'no_seat' && ['paid', 'pending_review'].includes(b.status)));
  } catch (error) {
    console.error('getBayaranUntukSemakan error:', error);
    return [];
  }
};

/** Sahkan atau tolak bukti manual bagi keseluruhan bil. */
export const semakBuktiBayaran = async (
  paymentId: string, terima: boolean, sebab?: string,
): Promise<{ ok: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.rpc('admin_review_payment', {
      p_payment_id: paymentId,
      p_terima: terima,
      p_sebab: sebab ?? null,
    });
    if (error) throw error;
    if (data?.ok) return { ok: true, message: terima ? 'Bayaran disahkan.' : 'Bukti ditolak.' };

    const sebabMesej: Record<string, string> = {
      tiada_kebenaran: 'Anda tiada kebenaran untuk tindakan ini.',
      luar_skop: 'Bayaran ini di luar skop anda.',
      bayaran_tidak_dijumpai: 'Bayaran tidak dijumpai.',
      bukan_menunggu_semakan: 'Bayaran ini bukan lagi menunggu semakan.',
      sebab_diperlukan: 'Sila nyatakan sebab penolakan.',
    };
    return { ok: false, message: sebabMesej[data?.sebab] || 'Gagal menyemak bayaran.' };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'Ralat sambungan.' };
  }
};

/**
 * Merekod refund yang dibuat di luar sistem.
 *
 * Wang dipulangkan melalui bank; ini merekod hakikat itu supaya tempat
 * dilepaskan dan bil terkeluar dari jumlah kutipan. Tanpa langkah ini,
 * bayaran yang sudah dipulangkan kekal dikira sebagai wang yang diterima.
 */
export const refundBil = async (
  billId: string, sebab: string,
): Promise<{ ok: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.rpc('admin_refund_bill', {
      p_bill_id: billId,
      p_sebab: sebab,
    });
    if (error) throw error;
    if (data?.ok) return { ok: true, message: 'Refund direkodkan. Tempat dilepaskan.' };

    const sebabMesej: Record<string, string> = {
      tiada_kebenaran: 'Anda tiada kebenaran untuk tindakan ini.',
      luar_skop: 'Bayaran ini di luar skop anda.',
      bayaran_tidak_dijumpai: 'Bayaran tidak dijumpai.',
      bukan_bayaran_diterima: 'Hanya bayaran yang sudah diterima boleh direfund.',
      sebab_diperlukan: 'Sila nyatakan sebab refund.',
    };
    return { ok: false, message: sebabMesej[data?.sebab] || 'Gagal merekod refund.' };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'Ralat sambungan.' };
  }
};

export interface BarisRumusanBayaran {
  id: string;
  schoolName: string;
  schoolCode: string | null;
  schoolType: string | null;
  daerahName: string | null;
  year: number;
  siri: number;
  amount: number;
  transactionFee: number;
  totalAmount: number;
  method: string;
  status: string;
  seatStatus: string;
  referenceNumber: string | null;
  billCode: string | null;
  paidAt: string | null;
  createdAt: string;
  programs: Array<{ name: string; amount: number; peserta: number; pemimpin: number; penolong: number }>;
  bilPeserta: number;
  bilPemimpin: number;
  bilPenolong: number;
}

/**
 * Setiap bil dalam skop admin — bukan hanya yang menunggu tindakan.
 *
 * Tiada penapisan skop di sini: RLS pada `payment_bills` (migrasi 040) sudah
 * mengehadkan admin daerah kepada daerahnya dan admin negeri kepada negerinya.
 */
export const getRumusanBayaran = async (tahun?: number): Promise<BarisRumusanBayaran[]> => {
  try {
    let q = supabase
      .from('payment_bills')
      .select(`
        id, year, siri, amount, transaction_fee, total_amount, method, status,
        reference_number, external_bill_code, paid_at, created_at,
        school:school_id(name, school_code, school_type, daerah:daerah_id(name)),
        payments(amount, seat_status, snapshot_peserta, snapshot_pemimpin, snapshot_penolong, badge:badge_id(name))
      `)
      .order('created_at', { ascending: false });
    if (tahun) q = q.eq('year', tahun);

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map((r: any) => {
      const sekolah = Array.isArray(r.school) ? r.school[0] : r.school;
      const daerah = Array.isArray(sekolah?.daerah) ? sekolah.daerah[0] : sekolah?.daerah;
      const items = (r.payments || []).map((p: any) => ({
        name: (Array.isArray(p.badge) ? p.badge[0] : p.badge)?.name || '-',
        amount: Number(p.amount ?? 0),
        peserta: p.snapshot_peserta ?? 0,
        pemimpin: p.snapshot_pemimpin ?? 0,
        penolong: p.snapshot_penolong ?? 0,
        seatStatus: p.seat_status,
      }));
      return {
        id: r.id,
        schoolName: sekolah?.name || '-',
        schoolCode: sekolah?.school_code ?? null,
        schoolType: sekolah?.school_type ?? null,
        daerahName: daerah?.name ?? null,
        year: r.year,
        siri: r.siri ?? 1,
        amount: Number(r.amount ?? 0),
        transactionFee: Number(r.transaction_fee ?? 0),
        totalAmount: Number(r.total_amount ?? 0),
        method: r.method,
        status: r.status,
        seatStatus: items.some((i: any) => i.seatStatus === 'no_seat') ? 'no_seat' : 'ok',
        referenceNumber: r.reference_number,
        billCode: r.external_bill_code,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        programs: items,
        bilPeserta: items.reduce((n: number, i: any) => n + i.peserta, 0),
        bilPemimpin: items.reduce((n: number, i: any) => n + i.pemimpin, 0),
        bilPenolong: items.reduce((n: number, i: any) => n + i.penolong, 0),
      };
    });
  } catch (error) {
    console.error('getRumusanBayaran error:', error);
    return [];
  }
};

/**
 * Data untuk resit. Bilangan peserta diambil dari SNAPSHOT yang disimpan
 * semasa bil dicipta, bukan dikira semula — resit mesti mencerminkan apa yang
 * sebenarnya dibil, walaupun senarai peserta berubah selepas itu.
 */
export const getDataResit = async (billId: string): Promise<DataResit | null> => {
  try {
    const { data, error } = await supabase
      .from('payment_bills')
      .select(`
        id, year, siri, amount, transaction_fee, total_amount, method,
        reference_number, paid_at, confirmed_at,
        school:school_id(name, school_code, daerah:daerah_id(name), negeri:negeri_id(name)),
        payments(amount, snapshot_peserta, snapshot_pemimpin, snapshot_penolong, badge:badge_id(name))
      `)
      .eq('id', billId)
      .maybeSingle();
    if (error || !data) return null;

    const sekolah: any = Array.isArray(data.school) ? data.school[0] : data.school;
    const daerah: any = Array.isArray(sekolah?.daerah) ? sekolah.daerah[0] : sekolah?.daerah;
    const negeri: any = Array.isArray(sekolah?.negeri) ? sekolah.negeri[0] : sekolah?.negeri;

    const items = ((data as any).payments || []).map((p: any) => ({
      program: (Array.isArray(p.badge) ? p.badge[0] : p.badge)?.name || '-',
      amount: Number(p.amount ?? 0),
      peserta: p.snapshot_peserta ?? 0,
      pemimpin: p.snapshot_pemimpin ?? 0,
      penolong: p.snapshot_penolong ?? 0,
    }));

    return {
      paymentId: data.id,
      schoolName: sekolah?.name || '-',
      schoolCode: sekolah?.school_code,
      siri: data.siri ?? 1,
      year: data.year,
      amount: Number(data.amount ?? 0),
      transactionFee: Number(data.transaction_fee ?? 0),
      totalAmount: Number(data.total_amount ?? 0),
      method: data.method,
      referenceNumber: data.reference_number,
      paidAt: data.paid_at,
      confirmedAt: data.confirmed_at,
      daerahName: daerah?.name,
      negeriName: negeri?.name,
      items,
    };
  } catch (error) {
    console.error('getDataResit error:', error);
    return null;
  }
};
