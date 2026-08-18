-- 062 — stesen bernama dan jadual penguji
--
-- Rujuk docs/rancangan-kumpulan-stesen.md §8-12.
--
-- Melanjutkan migrasi 061. Larian stesen yang sama kini memegang tiga perkara:
-- sekolah peserta (061), nama ujian setiap stesen, dan penguji yang bertugas
-- di situ.

-- ============================================================
-- 1. Nama ujian setiap stesen
-- ============================================================
-- Jadual berasingan supaya stesen tanpa nama tetap berfungsi. Nama ialah
-- hiasan pada cetakan, bukan syarat untuk jadual wujud.

create table if not exists public.station_group_stations (
  id         uuid primary key default uuid_generate_v4(),
  run_id     uuid not null references public.station_group_runs(id) on delete cascade,
  label      text not null,
  nama       text,
  created_at timestamptz default now(),
  unique (run_id, label)
);

create index if not exists idx_sgst_run on public.station_group_stations(run_id);

comment on table public.station_group_stations is
  'Nama ujian bagi setiap label stesen, cth "1A" -> "UJIAN KESETIAAN". '
  'Berbeza mengikut program kerana setiap larian khusus kepada satu program.';


-- ============================================================
-- 2. Penguji mengikut stesen
-- ============================================================
-- Penguji dikenali melalui nombor IC, sama seperti setiap padanan orang dalam
-- sistem ini. Nama dan sekolah disimpan sebagai snapshot supaya cetakan yang
-- diedarkan kekal betul walaupun rekod asal berubah kemudian.

create table if not exists public.station_group_examiners (
  id            uuid primary key default uuid_generate_v4(),
  run_id        uuid not null references public.station_group_runs(id) on delete cascade,
  station_label text not null,
  person_ic     text not null,
  nama          text not null,
  sekolah       text,
  -- Disalin daripada lariannya. Kelihatan berlebihan, tetapi kekangan di
  -- bawah tidak boleh dinyatakan tanpanya.
  year          integer not null,
  siri          smallint not null,
  created_at    timestamptz default now(),

  -- Satu penguji sekali sahaja dalam satu jadual.
  unique (run_id, person_ic),

  -- INILAH kekangan yang penting. Ia merentas SEMUA larian bagi siri itu,
  -- bukan satu larian sahaja. Seorang penguji yang sudah berada dalam jadual
  -- Keris Perak Siri 2 akan DITOLAK apabila cuba dimasukkan ke jadual Maju
  -- Siri 2 — tanpa mengira skrin mana yang mencubanya.
  --
  -- Seorang tidak boleh berada di dua stesen serentak, dan lapan orang
  -- mendaftar sebagai penguji dalam lebih daripada satu program Siri 2. Tanpa
  -- kekangan ini, pertembungan itu hanya ditemui pada hari ujian.
  unique (year, siri, person_ic)
);

create index if not exists idx_sge_run on public.station_group_examiners(run_id);
create index if not exists idx_sge_label on public.station_group_examiners(run_id, station_label);

comment on column public.station_group_examiners.year is
  'Disalin daripada larian semata-mata untuk membolehkan kekangan '
  'unique(year, siri, person_ic) merentas larian.';


-- ============================================================
-- 3. RLS — admin sahaja, sama seperti 061
-- ============================================================

alter table public.station_group_stations enable row level security;
alter table public.station_group_examiners enable row level security;

drop policy if exists "sgst_admin_all" on public.station_group_stations;
create policy "sgst_admin_all" on public.station_group_stations
  for all to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

drop policy if exists "sge_admin_all" on public.station_group_examiners;
create policy "sge_admin_all" on public.station_group_examiners
  for all to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());


-- ============================================================
-- 4. penguji_layak_stesen — siapa boleh diagihkan
-- ============================================================
-- Termasuk PENGUJI dan pegawai yang ditanda merangkap penguji (migrasi 057).
-- Satu baris per ORANG, bukan per pendaftaran: seorang yang mendaftar dalam
-- tiga program muncul sekali, dengan senarai program itu disertakan supaya
-- admin nampak dari mana dia datang.

create or replace function public.penguji_layak_stesen(
  p_badge_name text,
  p_year integer,
  p_siri smallint
)
returns table (person_ic text, nama text, sekolah text, program_lain text, sudah_ditempatkan text)
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
         string_agg(distinct x.prog, ', ' order by x.prog),
         -- Program lain dalam siri ini yang sudah menempatkannya. Bukan
         -- ralat; hanya sebab dia tidak muncul dalam senarai boleh pilih.
         (select b2.name
            from public.station_group_examiners e
            join public.station_group_runs r on r.id = e.run_id
            join public.badges b2 on b2.id = r.badge_id
           where e.year = p_year and e.siri = p_siri and e.person_ic = x.ic
           limit 1)
    from semua x
   where x.ic <> ''
     and exists (select 1 from semua y where y.ic = x.ic and y.prog = p_badge_name)
   group by x.ic
   order by min(x.nm);
end;
$$;

revoke execute on function public.penguji_layak_stesen(text, integer, smallint) from public, anon;
grant execute on function public.penguji_layak_stesen(text, integer, smallint) to authenticated;
