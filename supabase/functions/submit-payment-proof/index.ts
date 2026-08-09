// Supabase Edge Function: submit-payment-proof
//
// Bayaran manual: sekolah membayar di luar sistem (pindahan bank atau cek),
// kemudian memuat naik bukti.
//
// KENAPA BUKTI MENGAMBIL TEMPAT SERTA-MERTA
//   Status bertukar kepada 'pending_review', dan pending_review MENGAMBIL
//   tempat (Keputusan #8). Sebabnya duit sudah keluar dari sekolah — menunggu
//   admin menyemak sebelum menyimpan tempat bermakna sekolah yang benar-benar
//   membayar boleh kehilangan tempat kepada orang yang membayar kemudian
//   secara online. Jika bukti kemudiannya ditolak, tempat dilepaskan semula.
//
// Fail sebenar dimuat naik terus ke R2 oleh pelayar melalui
// r2-presigned-upload. Fungsi ini hanya merekod metadatanya dan menggerakkan
// status bayaran.

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
  paymentId: string;
  referenceNumber: string;
  method: 'bank_transfer' | 'cheque';
  bukti?: { fileName: string; filePath: string; mimeType?: string; fileSize?: number };
  notes?: string;
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
      return json({ status: 'error', message: 'Sesi tidak sah.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: 'error', message: 'Sesi tamat.' }, 401);

    const body = (await req.json()) as Body;
    if (!body?.paymentId || !body?.referenceNumber?.trim()) {
      return json({ status: 'error', message: 'No. rujukan bayaran diperlukan.' }, 400);
    }

    // paymentId ialah id BIL (§13). Bukti dilampirkan pada bil, bukan pada
    // satu baris program — satu slip bank membayar keseluruhan siri.
    const { data: bayaran } = await admin
      .from('payment_bills')
      .select('id, school_id, status, method')
      .eq('id', body.paymentId)
      .maybeSingle();
    if (!bayaran) return json({ status: 'error', message: 'Bil tidak dijumpai.' }, 404);

    // submission_id untuk lampiran diambil dari baris program pertama —
    // attachments.submission_id ialah rujukan audit, bukan kunci padanan.
    const { data: itemPertama } = await admin
      .from('payments').select('submission_id').eq('bill_id', bayaran.id).limit(1).maybeSingle();

    // Sekolah hanya boleh menghantar bukti untuk bilnya sendiri.
    const { data: profile } = await admin
      .from('profiles').select('role, school_id').eq('id', user.id).single();
    const adminPenuh = ['developer', 'admin', 'negeri_admin', 'daerah_admin'].includes(profile?.role || '');
    if (!adminPenuh && profile?.school_id !== bayaran.school_id) {
      return json({ status: 'error', message: 'Tiada kebenaran.' }, 403);
    }

    if (bayaran.status === 'paid') {
      return json({ status: 'error', message: 'Bil ini sudah dibayar dan disahkan.' }, 409);
    }
    if (!['pending', 'rejected', 'pending_review'].includes(bayaran.status)) {
      return json({ status: 'error', message: `Bil ini tidak boleh menerima bukti (status: ${bayaran.status}).` }, 409);
    }

    // Rekod bukti sebelum menggerakkan status: bukti yatim lebih baik
    // daripada bayaran 'pending_review' tanpa apa-apa untuk disemak admin.
    if (body.bukti?.filePath) {
      const { error: lampiranErr } = await admin.from('attachments').insert({
        submission_id: itemPertama?.submission_id ?? null,
        payment_id: bayaran.id,
        category: 'payment_proof',
        file_name: body.bukti.fileName,
        file_path: body.bukti.filePath,
        mime_type: body.bukti.mimeType || null,
        file_size: body.bukti.fileSize || null,
        uploaded_by: user.id,
      });
      if (lampiranErr) throw lampiranErr;
    }

    await admin.from('payment_bills').update({
      method: body.method,
      reference_number: body.referenceNumber.trim(),
      notes: body.notes?.trim() || null,
      paid_at: new Date().toISOString(),
      rejected_reason: null,        // percubaan baharu selepas penolakan
    }).eq('id', bayaran.id);

    await admin.from('payments').update({
      method: body.method,
      reference_number: body.referenceNumber.trim(),
    }).eq('bill_id', bayaran.id);

    // pending_review mengambil tempat — duit sudah keluar dari sekolah.
    // Urutan dikongsi dengan laluan ToyyibPay (migrasi 040).
    const { data: hasil, error: finErr } = await admin.rpc('finalize_bill', {
      p_bill_id: bayaran.id,
      p_new_status: 'pending_review',
    });
    if (finErr) throw finErr;

    await admin.from('audit_logs').insert({
      action: hasil?.ok ? 'bukti_bayaran_dihantar' : 'bukti_bayaran_tanpa_tempat',
      entity_type: 'payment_bills', entity_id: bayaran.id,
      details: { method: body.method, rujukan: body.referenceNumber.trim(), hasil },
    }).then(() => {}, () => {});

    // Notifikasi admin — best-effort, kegagalan tidak menggagalkan penghantaran.
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
          title: 'Bukti bayaran perlu disemak',
          message: `${sekolah?.name} telah menghantar bukti bayaran (${body.method === 'cheque' ? 'cek' : 'pindahan bank'}). Rujukan: ${body.referenceNumber.trim()}`,
        })));
      }
    } catch (_) { /* diabaikan dengan sengaja */ }

    return json({
      status: 'success',
      paymentStatus: 'pending_review',
      seatStatus: hasil?.ok ? 'ok' : 'no_seat',
      message: hasil?.ok
        ? 'Bukti dihantar. Menunggu semakan admin.'
        : 'Bukti dihantar, tetapi tempat bagi siri ini sudah penuh. Admin akan menghubungi anda.',
    });
  } catch (error: any) {
    console.error('submit-payment-proof error:', error?.message);
    return json({ status: 'error', message: 'Gagal menghantar bukti bayaran.' }, 500);
  }
});
