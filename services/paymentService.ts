import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';

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

/** Maklumat akaun bank bagi skop sekolah — dipapar untuk bayaran manual. */
export const getArahanBayaranManual = async (
  negeriCode?: string, daerahCode?: string,
): Promise<{ bankAccountInfo: string | null; adaOnline: boolean }> => {
  try {
    let q = supabase.from('payment_gateway_settings_public')
      .select('bank_account_info, category_code, is_active');
    if (daerahCode) {
      const { data: d } = await supabase.from('daerah').select('id').eq('code', daerahCode).maybeSingle();
      if (!d?.id) return { bankAccountInfo: null, adaOnline: false };
      q = q.eq('daerah_id', d.id);
    } else if (negeriCode) {
      const { data: n } = await supabase.from('negeri').select('id').eq('code', negeriCode).maybeSingle();
      if (!n?.id) return { bankAccountInfo: null, adaOnline: false };
      q = q.eq('negeri_id', n.id);
    } else {
      return { bankAccountInfo: null, adaOnline: false };
    }
    const { data } = await q.maybeSingle();
    return {
      bankAccountInfo: data?.bank_account_info ?? null,
      // ToyyibPay hanya ditawarkan bila skop ini benar-benar ada akaun aktif.
      // Daerah tanpa akaun mendapat pindahan bank & cek sahaja.
      adaOnline: !!(data?.is_active && data?.category_code),
    };
  } catch {
    return { bankAccountInfo: null, adaOnline: false };
  }
};
