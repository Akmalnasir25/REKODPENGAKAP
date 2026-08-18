-- 063 — kolam penguji merentas beberapa program
--
-- Rujuk docs/rancangan-kumpulan-stesen.md.
--
-- Dua program yang berjalan serentak berkongsi penguji. Admin menanda program
-- mana digabungkan; kolam penguji menjadi gabungan program itu, dan setiap
-- program KEKAL stesennya sendiri.
--
-- Keris Perak 27 penguji + Keris Emas 7 = kolam 34. Kolam itu dibahagikan
-- antara 12 stesen Keris Perak dan stesen Keris Emas sendiri.
--
-- Kekangan unique(year, siri, person_ic) daripada migrasi 062 sudah
-- menguatkuasakan bahagian yang sukar: seorang penguji yang diambil oleh
-- jadual Keris Perak tidak boleh muncul dalam jadual Keris Emas. Menggabungkan
-- kolam tidak melonggarkan itu — ia hanya meluaskan senarai yang boleh dipilih.

alter table public.station_group_runs
  add column if not exists program_gabung text[];

comment on column public.station_group_runs.program_gabung is
  'Nama program TAMBAHAN yang penguji dikumpulkan bersama, selain program '
  'larian ini sendiri. NULL atau kosong bermakna program ini sahaja.';


-- ============================================================
-- penguji_layak_stesen — kini menerima senarai program
-- ============================================================
-- Tandatangan lama digugurkan supaya tiada dua versi yang menyimpang. Versi
-- baharu mengambil array; satu program ialah array satu elemen.

drop function if exists public.penguji_layak_stesen(text, integer, smallint);

create or replace function public.penguji_layak_stesen(
  p_programs text[],
  p_year integer,
  p_siri smallint
)
returns table (
  person_ic text,
  nama text,
  sekolah text,
  program_lain text,
  sudah_ditempatkan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh melihat senarai penguji stesen';
  end if;

  return query
  with semua as (
    select regexp_replace(coalesce(sp.ic_number, ''), '[^0-9]', '', 'g') as ic,
           sp.name as nm, sc.name as sk, b.name as prog
      from public.submission_people sp
      join public.submissions s   on s.id = sp.submission_id
      join public.badges  b       on b.id = s.badge_id
      join public.schools sc      on sc.id = s.school_id
      join public.school_badge_status sbs
        on sbs.school_id = s.school_id and sbs.badge_id = s.badge_id
       and sbs.year = s.submission_year and sbs.siri = sp.siri
     where s.submission_year = p_year
       and sp.siri = p_siri
       and sbs.status = 'approved'
       and (sp.role = 'PENGUJI' or sp.is_penguji)
       and sp.is_deleted = false
       and coalesce(sp.is_withdrawn, false) = false
  )
  select x.ic,
         min(x.nm),
         min(x.sk),
         -- SETIAP program siri ini yang dia daftar, bukan hanya yang digabung.
         -- Admin patut nampak dari mana seseorang datang sebelum meletakkannya.
         string_agg(distinct x.prog, ', ' order by x.prog),
         (select b2.name
            from public.station_group_examiners e
            join public.station_group_runs r on r.id = e.run_id
            join public.badges b2 on b2.id = r.badge_id
           where e.year = p_year and e.siri = p_siri and e.person_ic = x.ic
           limit 1)
    from semua x
   where x.ic <> ''
     -- Layak jika dia mendaftar dalam MANA-MANA program yang digabungkan.
     and exists (select 1 from semua y
                  where y.ic = x.ic and y.prog = any(p_programs))
   group by x.ic
   order by min(x.nm);
end;
$$;

revoke execute on function public.penguji_layak_stesen(text[], integer, smallint) from public, anon;
grant execute on function public.penguji_layak_stesen(text[], integer, smallint) to authenticated;
