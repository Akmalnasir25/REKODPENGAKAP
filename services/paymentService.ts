import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { DataResit } from './receiptService';

// ============================================================
// Lapisan bayaran untuk sekolah.
//
// Setiap jumlah datang dari server. Tiada fungsi di sini menghantar harga —
// ia hanya memilih program, siri dan kaedah, dan menerima jumlah yang dikira
// oleh Edge Function.
// ============================================================

export type KaedahBayaran = 'toyyibpay' | 'bank_transfer' | 'cheque';

export interface BilDijana {
  paymentId: string;
  billUrl?: string;
  amount: number;
  transactionFee: number;
  totalAmount: number;
  expiresAt: string;
  /** true bila jumlah RM0 — pintu bayaran dilangkau, pendaftaran terus dihantar. */
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

export const janaBil = (input: {
  badgeName: string; year: number; siri: number; method: KaedahBayaran;
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
 * pengguna sekolah. Itu yang menyebabkan skrin bayaran memaparkan pindahan
 * bank tanpa nombor akaun dan tidak pernah menawarkan ToyyibPay.
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

export const BALDI_BUKTI = 'payment-proofs';

/**
 * Muat naik bukti bayaran ke baldi PERSENDIRIAN payment-proofs.
 *
 * Bukan R2. r2-presigned-upload tidak pernah di-deploy ke projek ini dan tiada
 * kredensial R2 ditetapkan, jadi setiap panggilan berakhir sebagai 404 yang
 * pelayar laporkan sebagai ralat CORS.
 *
 * Segmen pertama laluan MESTI paymentId — polisi storan (migrasi 038) membaca
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

/**
 * URL bertandatangan untuk melihat bukti. Baldi persendirian, jadi tiada URL
 * awam — pautan ini luput dalam 5 minit dan dijana hanya apabila diklik.
 */
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
  badgeName: string;
  year: number;
  siri: number;
  amount: number;
  method: string;
  status: string;
  seatStatus: string;
  referenceNumber: string | null;
  paidAt: string | null;
  bukti: Array<{ fileName: string; filePath: string }>;
}

/**
 * Bayaran yang memerlukan perhatian admin:
 *   pending_review — bukti manual menunggu semakan
 *   no_seat        — duit diterima tetapi tempat sudah penuh
 *
 * RLS pada `payments` sudah mengehadkan hasil kepada skop admin, jadi tiada
 * penapisan skop diperlukan di sini.
 */
export const getBayaranUntukSemakan = async (): Promise<BayaranUntukSemakan[]> => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        id, year, siri, amount, method, status, seat_status, reference_number, paid_at,
        school:school_id(name), badge:badge_id(name),
        attachments(file_name, file_path, category)
      `)
      .or('status.eq.pending_review,seat_status.eq.no_seat')
      .order('paid_at', { ascending: false, nullsFirst: false });
    if (error) throw error;

    return (data || []).map((r: any) => ({
      id: r.id,
      schoolName: (Array.isArray(r.school) ? r.school[0] : r.school)?.name || '-',
      badgeName: (Array.isArray(r.badge) ? r.badge[0] : r.badge)?.name || '-',
      year: r.year,
      siri: r.siri ?? 1,
      amount: Number(r.amount ?? 0),
      method: r.method,
      status: r.status,
      seatStatus: r.seat_status,
      referenceNumber: r.reference_number,
      paidAt: r.paid_at,
      bukti: (r.attachments || [])
        .filter((a: any) => a.category === 'payment_proof')
        .map((a: any) => ({ fileName: a.file_name, filePath: a.file_path })),
    }));
  } catch (error) {
    console.error('getBayaranUntukSemakan error:', error);
    return [];
  }
};

/** Sahkan atau tolak bukti manual. Kebenaran disemak dalam fungsi DB. */
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
 * Data untuk resit. Bilangan peserta diambil dari SNAPSHOT yang disimpan
 * semasa bil dicipta, bukan dikira semula — resit mesti mencerminkan apa yang
 * sebenarnya dibil, walaupun senarai peserta berubah selepas itu.
 *
 * RLS pada `payments` mengehadkan sekolah kepada bayaran sendiri.
 */
export const getDataResit = async (paymentId: string): Promise<DataResit | null> => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        id, year, siri, amount, transaction_fee, total_amount, method,
        reference_number, paid_at, confirmed_at,
        snapshot_peserta, snapshot_pemimpin, snapshot_penolong,
        school:school_id(name, school_code, daerah:daerah_id(name), negeri:negeri_id(name)),
        badge:badge_id(name)
      `)
      .eq('id', paymentId)
      .maybeSingle();
    if (error || !data) return null;

    const sekolah: any = Array.isArray(data.school) ? data.school[0] : data.school;
    const badge: any = Array.isArray(data.badge) ? data.badge[0] : data.badge;
    const daerah: any = Array.isArray(sekolah?.daerah) ? sekolah.daerah[0] : sekolah?.daerah;
    const negeri: any = Array.isArray(sekolah?.negeri) ? sekolah.negeri[0] : sekolah?.negeri;

    return {
      paymentId: data.id,
      schoolName: sekolah?.name || '-',
      schoolCode: sekolah?.school_code,
      badgeName: badge?.name || '-',
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
      bilPeserta: data.snapshot_peserta ?? 0,
      bilPemimpin: data.snapshot_pemimpin ?? 0,
      bilPenolong: data.snapshot_penolong ?? 0,
    };
  } catch (error) {
    console.error('getDataResit error:', error);
    return null;
  }
};
