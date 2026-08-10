-- ============================================================
-- MIGRATION 043: Tempat dikira daripada snapshot bayaran
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.12.
--
-- KENAPA SEKARANG
--   Bil susulan (mengecaj peserta yang ditambah selepas bayaran) mencipta
--   DUA baris bayaran bagi program × siri yang sama. Pengiraan tempat sedia
--   ada tidak boleh menanganinya:
--
--     join public.payments pay
--       on pay.school_id = sc.id and pay.badge_id = ps.badge_id ...
--
--   Setiap peserta disertai kepada SETIAP baris bayaran yang sepadan. Dengan
--   satu bayaran ia betul; dengan dua, setiap peserta dikira dua kali dan
--   program kelihatan penuh pada separuh bilangan sebenar.
--
--   Ia tidak menggigit hari ini kerana had tempat masih kosong. Ia menggigit
--   pada hari pertama had ditetapkan — dan pada ketika itu sebabnya tidak
--   akan jelas kepada sesiapa.
--
-- MODEL BAHARU
--   Tempat = jumlah SNAPSHOT merentas bayaran berbayar. Itu tepat "berapa
--   tempat sudah dijual". Ia tidak boleh berganda tidak kira berapa banyak
--   bil wujud, dan bil susulan berfungsi tanpa kes khas.
--
--   Snapshot dibekukan semasa bil dicipta, jadi peserta yang ditambah selepas
--   itu TIDAK mengambil tempat sehingga dibil. Itu betul: tempat mengikut
--   wang, sama seperti keputusan asal "bayar baru dapat tempat".
--
-- Hanya peranan yang DICAJ dikira, sama seperti sebelum ini.
-- ============================================================


-- ============================================================
-- 1. siri_seats_taken
-- ============================================================

create or replace function public.siri_seats_taken(
  p_program_setting_id uuid,
  p_siri smallint,
  p_kecuali_payment_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    (case when ps.fee_peserta  is not null then pay.snapshot_peserta  else 0 end)
  + (case when ps.fee_pemimpin is not null then pay.snapshot_pemimpin else 0 end)
  + (case when ps.fee_penolong is not null then pay.snapshot_penolong else 0 end)
  ), 0)::integer
  from public.program_settings ps
  join public.badges b on b.id = ps.badge_id
  join public.schools sc
    on (coalesce(b.scope, 'daerah') = 'negeri' and sc.negeri_id is not distinct from ps.negeri_id)
    or (coalesce(b.scope, 'daerah') = 'daerah' and sc.daerah_id is not distinct from ps.daerah_id)
  join public.payments pay
    on pay.school_id = sc.id
   and pay.badge_id = ps.badge_id
   and pay.year = ps.year
   and pay.siri = p_siri
   and pay.status in ('paid', 'pending_review')
   and pay.seat_status = 'ok'
  where ps.id = p_program_setting_id
    -- Semasa menuntut, bayaran yang sedang diproses dikecualikan supaya
    -- snapshotnya tidak dikira dua kali.
    and (p_kecuali_payment_id is null or pay.id <> p_kecuali_payment_id);
$$;

revoke execute on function public.siri_seats_taken(uuid, smallint, uuid) from public, anon;
grant execute on function public.siri_seats_taken(uuid, smallint, uuid) to authenticated, service_role;

comment on function public.siri_seats_taken(uuid, smallint, uuid) is
  'Tempat dijual = jumlah snapshot bayaran berbayar. TIDAK menyertai peserta '
  'kepada bayaran: satu program × siri boleh mempunyai beberapa bil selepas '
  'bil susulan, dan sertaan itu mengira setiap peserta sekali bagi setiap bil.';


-- ============================================================
-- 2. claim_siri_seats
-- ============================================================
-- Tempat yang diminta ialah snapshot bayaran ITU SENDIRI. Mengira semula
-- semua peserta sekolah bermakna bil susulan meminta tempat yang bil pertama
-- sudah bayar.

create or replace function public.claim_siri_seats(
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
  v_ps public.program_settings%rowtype;
  v_ps_id uuid;
  v_max integer;
  v_closed boolean;
  v_taken integer;
  v_minta integer;
begin
  if p_new_status not in ('paid', 'pending_review') then
    return jsonb_build_object('ok', false, 'sebab', 'status_tidak_sah');
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('ok', false, 'sebab', 'bayaran_tidak_dijumpai');
  end if;

  -- Idempoten: webhook boleh sampai lebih daripada sekali
  if v_pay.status = p_new_status and v_pay.seat_status = 'ok' then
    return jsonb_build_object('ok', true, 'sebab', 'sudah_dituntut');
  end if;

  v_ps_id := public.resolve_program_setting(v_pay.school_id, v_pay.badge_id, v_pay.year);
  if v_ps_id is null then
    return jsonb_build_object('ok', false, 'sebab', 'tiada_tetapan_program');
  end if;

  -- KUNCI BARIS YANG MEMEGANG HAD (migrasi 041). Permintaan serentak bagi
  -- program yang sama BERATUR di sini. Tanpa ini, dua sekolah yang membayar
  -- serentak untuk tempat terakhir akan kedua-duanya nampak ruang kosong.
  select * into v_ps from public.program_settings where id = v_ps_id for update;
  v_max := v_ps.max_peserta;

  -- Penutupan manual kekal per siri.
  select pss.is_closed into v_closed
  from public.program_siri_settings pss
  where pss.program_setting_id = v_ps_id and pss.siri = v_pay.siri;

  if v_max is null and not coalesce(v_closed, false) then
    update public.payments
       set status = p_new_status,
           seat_status = 'ok',
           paid_at = coalesce(paid_at, now())
     where id = p_payment_id;
    return jsonb_build_object('ok', true, 'had', null);
  end if;

  -- Tarikh tutup TIDAK disemak di sini dengan sengaja. Duit sudah diterima;
  -- menolaknya kerana lewat beberapa saat akan mencipta kes refund. Penapisan
  -- tarikh berlaku lebih awal, semasa bil dicipta.

  v_taken := public.siri_seats_taken(v_ps_id, v_pay.siri, p_payment_id);

  v_minta :=
      (case when v_ps.fee_peserta  is not null then coalesce(v_pay.snapshot_peserta, 0)  else 0 end)
    + (case when v_ps.fee_pemimpin is not null then coalesce(v_pay.snapshot_pemimpin, 0) else 0 end)
    + (case when v_ps.fee_penolong is not null then coalesce(v_pay.snapshot_penolong, 0) else 0 end);

  if coalesce(v_closed, false) or (v_max is not null and (v_taken + v_minta) > v_max) then
    -- Duit sudah diterima tetapi tempat tiada. Tanda untuk tindakan admin;
    -- JANGAN naikkan kiraan dan JANGAN benarkan pengesahan automatik.
    update public.payments
       set status = p_new_status,
           seat_status = 'no_seat',
           paid_at = coalesce(paid_at, now())
     where id = p_payment_id;

    return jsonb_build_object(
      'ok', false,
      'sebab', case when coalesce(v_closed, false) then 'siri_ditutup' else 'tempat_penuh' end,
      'had', v_max, 'terisi', v_taken, 'diminta', v_minta
    );
  end if;

  update public.payments
     set status = p_new_status,
         seat_status = 'ok',
         paid_at = coalesce(paid_at, now())
   where id = p_payment_id;

  return jsonb_build_object('ok', true, 'had', v_max, 'terisi', v_taken + v_minta);
end;
$$;

revoke execute on function public.claim_siri_seats(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_siri_seats(uuid, text) to service_role;

comment on function public.claim_siri_seats(uuid, text) is
  'Tempat diminta = snapshot bayaran ini sendiri. Mengira semula semua '
  'peserta sekolah bermakna bil susulan meminta tempat yang bil pertama '
  'sudah bayar.';
