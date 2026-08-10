-- ============================================================
-- MIGRATION 044: Baki tempat yang sekolah boleh lihat
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §13.13.
--
-- MASALAH
--   Tiada apa-apa menghalang sekolah mendaftar 40 peserta untuk program yang
--   tinggal 3 tempat. Sekatan hanya berlaku semasa Hantar, dan pada ketika
--   itu kerja sejam sudah terbuang. Mereka kena membuang 37 nama sendiri.
--
--   Datanya sudah ada — check_siri_availability memulangkan had, terisi dan
--   baki. Yang tiada ialah cara sekolah melihatnya SEBELUM mendaftar.
--
-- KENAPA SATU FUNGSI UNTUK SEMUA PROGRAM
--   Badge di klien tidak membawa id, dan memanggil check_siri_availability
--   bagi setiap program bermakna satu panggilan bulat-balik setiap satu.
--
-- KENAPA MELALUI resolve_program_setting
--   Penyelesaian skop (negeri lawan daerah) sudah wujud di situ. Menulis
--   semula syarat itu di sini mencipta salinan kedua yang akan menyimpang
--   daripada create-payment-bill dan claim_siri_seats.
--
-- Hanya program BERHAD dipulangkan. "Baki: tiada had" hanyalah bunyi pada
-- skrin yang sekolah perlu baca pantas.
-- ============================================================

create or replace function public.baki_tempat_siri(
  p_year integer,
  p_siri smallint
)
returns table (
  badge_name   text,
  had          integer,
  terisi       integer,
  baki         integer,
  perlu        integer,     -- peserta sekolah ini yang DICAJ dalam siri ini
  ditutup      boolean,
  tarikh_tutup timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.profiles where id = auth.uid();
  if v_school is null then
    return;   -- admin tanpa sekolah tidak mendapat apa-apa di sini
  end if;

  return query
  select
    b.name::text,
    ps.max_peserta,
    public.siri_seats_taken(ps.id, p_siri, null),
    greatest(ps.max_peserta - public.siri_seats_taken(ps.id, p_siri, null), 0),
    -- Peranan yang mengambil tempat = peranan yang ada yuran, sama seperti
    -- siri_seats_taken dan claim_siri_seats.
    (
      select count(*)::integer
      from public.submissions s
      join public.submission_people sp on sp.submission_id = s.id
      where s.school_id = v_school
        and s.badge_id = ps.badge_id
        and s.submission_year = p_year
        and sp.siri = p_siri
        and sp.is_deleted = false
        and coalesce(sp.is_withdrawn, false) = false
        and (
             (sp.role in ('PESERTA', 'PENERIMA RAMBU') and ps.fee_peserta  is not null)
          or (sp.role = 'PEMIMPIN'                     and ps.fee_pemimpin is not null)
          or (sp.role = 'PENOLONG PEMIMPIN'            and ps.fee_penolong is not null)
        )
    ),
    coalesce(pss.is_closed, false),
    pss.payment_deadline
  from public.badges b
  cross join lateral (
    select public.resolve_program_setting(v_school, b.id, p_year) as id
  ) r
  join public.program_settings ps on ps.id = r.id
  left join public.program_siri_settings pss
    on pss.program_setting_id = ps.id and pss.siri = p_siri
  where ps.max_peserta is not null
  order by b.name;
end;
$$;

revoke execute on function public.baki_tempat_siri(integer, smallint) from public, anon;
grant execute on function public.baki_tempat_siri(integer, smallint) to authenticated;

comment on function public.baki_tempat_siri(integer, smallint) is
  'Baki tempat bagi setiap program BERHAD, untuk sekolah pemanggil. '
  'Memulangkan juga bilangan pesertanya sendiri yang dicaj, supaya skrin '
  'boleh memberi amaran sebelum sekolah menaip 40 nama ke dalam 3 tempat.';
