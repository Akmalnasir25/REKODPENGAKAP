-- ============================================================
-- MIGRATION 050: peranan PEMBANTU
-- ============================================================
-- Rujuk docs/rancangan-peranan-pembantu.md
--
-- KEPUTUSAN
--   PEMBANTU dicaj pada kadar yang SAMA seperti PENOLONG PEMIMPIN.
--
--   Di lapisan wang, kedua-duanya tidak dibezakan: tiada lajur yuran baharu,
--   tiada medan snapshot baharu, tiada perubahan pada bil. create-payment-bill
--   mengira PEMBANTU ke dalam kiraan penolong, dan segala yang hilir daripada
--   itu — siri_seats_taken, claim_siri_seats, check_siri_availability — sudah
--   membaca snapshot_penolong, jadi ia terus berfungsi tanpa disentuh.
--
--   Di lapisan statistik ia berasingan sepenuhnya, supaya papan pemuka boleh
--   memaparkan jumlahnya sendiri.
--
-- APA YANG BERUBAH DI SINI
--   1. Kekangan CHECK pada submission_people.role
--   2. baki_tempat_siri — satu-satunya fungsi HIDUP yang menyenaraikan peranan
--      secara eksplisit. Yang lain berasaskan snapshot.
--
--   Penyenaraian peranan dalam migrasi 029 dan 041 sengaja dibiarkan: fungsi
--   yang mengandunginya sudah digantikan oleh 043 dan 048.
-- ============================================================


-- ============================================================
-- 1. Kekangan peranan
-- ============================================================
-- Digugurkan mengikut DEFINISI, bukan mengikut nama.
--
-- Nama tidak dinyatakan semasa jadual dicipta, jadi PostgreSQL menjananya.
-- Kalau nama sebenar berbeza daripada tekaan kita, `drop … if exists` tidak
-- melakukan apa-apa, `add` di bawah berjaya, dan kekangan LAMA masih menolak
-- PEMBANTU — migrasi kelihatan lulus sedangkan peranan baharu tetap mustahil
-- disisipkan. Mencari mengikut definisi menghapuskan kemungkinan itu.

do $$
declare
  v_nama text;
begin
  for v_nama in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.submission_people'::regclass
      and con.contype  = 'c'
      and pg_get_constraintdef(con.oid) like '%PENERIMA RAMBU%'
  loop
    execute format('alter table public.submission_people drop constraint %I', v_nama);
    raise notice 'Kekangan peranan lama digugurkan: %', v_nama;
  end loop;
end $$;

alter table public.submission_people
  add constraint submission_people_role_check
  check (role in ('PESERTA', 'PEMIMPIN', 'PENOLONG PEMIMPIN', 'PEMBANTU', 'PENGUJI', 'PENERIMA RAMBU'));

comment on column public.submission_people.role is
  'PEMBANTU ditambah dalam migrasi 050. Ia berkelakuan seperti PENOLONG '
  'PEMIMPIN dari segi yuran dan tempat, tetapi dikira berasingan dalam '
  'statistik.';


-- ============================================================
-- 2. baki_tempat_siri — PEMBANTU dikira bersama penolong
-- ============================================================
-- Badan sama seperti migrasi 048; satu-satunya perubahan ialah baris peranan
-- penolong kini menerima PEMBANTU juga. Kalau ia tertinggal, sekolah akan
-- melihat "perlu" yang kurang daripada apa yang bil sebenarnya caj.

create or replace function public.baki_tempat_siri(
  p_year integer,
  p_siri smallint
)
returns table (
  badge_name   text,
  had          integer,
  terisi       integer,
  baki         integer,
  perlu        integer,
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
    return;
  end if;

  return query
  select
    b.name::text,
    pss.max_peserta,
    public.siri_seats_taken(ps.id, p_siri, null),
    greatest(pss.max_peserta - public.siri_seats_taken(ps.id, p_siri, null), 0),
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
             (sp.role in ('PESERTA', 'PENERIMA RAMBU')       and ps.fee_peserta  is not null)
          or (sp.role = 'PEMIMPIN'                           and ps.fee_pemimpin is not null)
          or (sp.role in ('PENOLONG PEMIMPIN', 'PEMBANTU')   and ps.fee_penolong is not null)
        )
    ),
    coalesce(pss.is_closed, false),
    pss.payment_deadline
  from public.badges b
  cross join lateral (
    select public.resolve_program_setting(v_school, b.id, p_year) as id
  ) r
  join public.program_settings ps on ps.id = r.id
  join public.program_siri_settings pss
    on pss.program_setting_id = ps.id and pss.siri = p_siri
  where pss.max_peserta is not null
  order by b.name;
end;
$$;

revoke execute on function public.baki_tempat_siri(integer, smallint) from public, anon;
grant execute on function public.baki_tempat_siri(integer, smallint) to authenticated;
