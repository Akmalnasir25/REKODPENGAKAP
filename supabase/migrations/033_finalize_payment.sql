-- ============================================================
-- MIGRATION 033: finalize_payment — satu tempat bayaran diselesaikan
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §5.1, §6.2.
--
-- KENAPA FUNGSI, BUKAN KOD DALAM EDGE FUNCTION
--   Dua Edge Function mengesahkan bayaran: toyyibpay-callback (webhook) dan
--   check-payment-status (bila sekolah kembali dari gateway). Kedua-duanya
--   mesti melakukan urutan yang SAMA selepas pengesahan:
--
--     tuntut tempat → jika berjaya, hantar pendaftaran → kemas kini status
--
--   Menyalin urutan itu ke dua tempat bermakna dua salinan yang akan
--   menyimpang. Dan menyimpang di sini bukan pepijat kosmetik: satu laluan
--   mungkin menghantar pendaftaran sementara satu lagi tidak, bergantung
--   pada sama ada webhook atau sekolah yang sampai dahulu.
--
--   submit-payment-proof turut memanggilnya dengan 'pending_review'.
--
-- Pengesahan dengan ToyyibPay TIDAK berlaku di sini — itu memerlukan HTTP dan
-- kekal dalam Edge Function. Fungsi ini menganggap bayaran SUDAH disahkan.
-- ============================================================

create or replace function public.finalize_payment(
  p_payment_id uuid,
  p_new_status text default 'paid'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_tuntut jsonb;
  v_dapat_tempat boolean;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  -- Tuntut tempat secara atomik. Fungsi ini juga yang mengemas kini
  -- payments.status dan seat_status.
  v_tuntut := public.claim_siri_seats(p_payment_id, p_new_status);
  v_dapat_tempat := coalesce((v_tuntut ->> 'ok')::boolean, false);

  -- Muat semula: claim_siri_seats baru sahaja mengubah baris.
  select * into v_pay from public.payments where id = p_payment_id;

  if v_dapat_tempat then
    -- Bayaran diterima DAN tempat diperoleh: pendaftaran masuk giliran
    -- pengesahan admin.
    update public.submissions
       set status = 'submitted'
     where school_id = v_pay.school_id
       and badge_id = v_pay.badge_id
       and submission_year = v_pay.year
       and status = 'draft';

    insert into public.school_badge_status (
      school_id, badge_id, year, siri, status, payment_status, submitted_at
    ) values (
      v_pay.school_id, v_pay.badge_id, v_pay.year, v_pay.siri,
      'submitted', p_new_status, now()
    )
    on conflict (school_id, badge_id, year, siri) do update
      set payment_status = excluded.payment_status,
          -- Program yang SUDAH disahkan tidak ditolak balik kepada
          -- 'submitted' — itu akan mengeluarkan peserta dari statistik
          -- semata-mata kerana bayaran susulan direkodkan.
          status = case when school_badge_status.status = 'approved'
                        then school_badge_status.status
                        else 'submitted' end,
          submitted_at = coalesce(school_badge_status.submitted_at, now());
  else
    -- Duit diterima tetapi tempat tiada. Pendaftaran KEKAL draf dengan
    -- sengaja: ia tidak boleh masuk giliran pengesahan tanpa tempat.
    -- payment_status tetap direkod kerana duit memang diterima.
    insert into public.school_badge_status (
      school_id, badge_id, year, siri, payment_status
    ) values (
      v_pay.school_id, v_pay.badge_id, v_pay.year, v_pay.siri, p_new_status
    )
    on conflict (school_id, badge_id, year, siri) do update
      set payment_status = excluded.payment_status;
  end if;

  return jsonb_build_object(
    'ok', v_dapat_tempat,
    'seatStatus', v_pay.seat_status,
    'paymentStatus', v_pay.status,
    'tuntut', v_tuntut
  );
end;
$$;

-- service_role sahaja: fungsi ini menandakan bayaran sebagai diterima.
revoke execute on function public.finalize_payment(uuid, text) from public;
grant execute on function public.finalize_payment(uuid, text) to service_role;

comment on function public.finalize_payment(uuid, text) is
  'Urutan selepas bayaran disahkan: tuntut tempat, hantar pendaftaran, kemas '
  'kini status. Dipanggil oleh toyyibpay-callback, check-payment-status dan '
  'submit-payment-proof supaya ketiga-tiganya berkelakuan sama. Pengesahan '
  'dengan gateway berlaku dalam Edge Function, bukan di sini.';
