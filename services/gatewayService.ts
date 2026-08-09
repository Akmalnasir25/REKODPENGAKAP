import { supabase, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { ApiResponse } from '../types';

// ============================================================
// Tetapan gateway pembayaran per skop (negeri / daerah).
//
// Kunci rahsia TIDAK PERNAH melalui lapisan ini dalam kedua-dua arah selain
// sekali semasa disimpan. Ia dihantar sekali ke Edge Function dan tidak
// pernah dibaca balik — bacaan hanya memulangkan `maskedKey`.
// ============================================================

export interface GatewaySettings {
  id: string;
  negeriId: string | null;
  daerahId: string | null;
  categoryCode: string | null;
  maskedKey: string | null;
  bankAccountInfo: string | null;
  transactionFeeFlat: number;
  isSandbox: boolean;
  isActive: boolean;
  verifiedAt: string | null;
}

/**
 * Baca tetapan bagi skop tertentu. Membaca dari view berskop, bukan jadual
 * asas — view itu tidak mengandungi secret_vault_id langsung, jadi tiada
 * rujukan kepada kunci pernah sampai ke browser.
 */
export const getGatewaySettings = async (
  scope: 'negeri' | 'daerah',
  code: string,
): Promise<GatewaySettings | null> => {
  try {
    const jadual = scope === 'negeri' ? 'negeri' : 'daerah';
    const { data: skop } = await supabase.from(jadual).select('id').eq('code', code).maybeSingle();
    if (!skop?.id) return null;

    const lajur = scope === 'negeri' ? 'negeri_id' : 'daerah_id';
    const { data, error } = await supabase
      .from('payment_gateway_settings_public')
      .select('*')
      .eq(lajur, skop.id)
      .eq('provider', 'toyyibpay')
      .maybeSingle();
    if (error || !data) return null;

    return {
      id: data.id,
      negeriId: data.negeri_id,
      daerahId: data.daerah_id,
      categoryCode: data.category_code,
      maskedKey: data.masked_key,
      bankAccountInfo: data.bank_account_info,
      transactionFeeFlat: data.transaction_fee_flat != null ? Number(data.transaction_fee_flat) : 1,
      isSandbox: !!data.is_sandbox,
      isActive: !!data.is_active,
      verifiedAt: data.verified_at,
    };
  } catch (error) {
    console.error('getGatewaySettings error:', error);
    return null;
  }
};

export interface SaveGatewayInput {
  scope: 'negeri' | 'daerah';
  negeriCode?: string;
  daerahCode?: string;
  categoryCode: string;
  /** Kosongkan untuk mengekalkan kunci sedia ada. */
  userSecretKey?: string;
  bankAccountInfo?: string;
  transactionFeeFlat?: number;
  isSandbox: boolean;
}

/**
 * Simpan tetapan. Edge Function mengesahkan kunci dengan ToyyibPay sebelum
 * menyimpan, jadi kegagalan di sini bermakna kredensial memang salah — bukan
 * sekadar masalah rangkaian.
 */
export const saveGatewaySettings = async (input: SaveGatewayInput): Promise<ApiResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { status: 'error', message: 'Sesi tamat. Sila log masuk semula.' };

    const res = await fetch(`${EDGE_FUNCTION_URL}/save-gateway-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });

    const hasil = await res.json().catch(() => null);
    if (!res.ok || hasil?.status !== 'success') {
      return { status: 'error', message: hasil?.message || 'Gagal menyimpan tetapan gateway.' };
    }
    return { status: 'success', message: hasil.message };
  } catch (error: any) {
    return { status: 'error', message: error?.message || 'Ralat sambungan.' };
  }
};
