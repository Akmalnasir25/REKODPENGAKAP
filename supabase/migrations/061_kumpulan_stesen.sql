-- 061 — jadual kumpulan ujian stesen
--
-- Rujuk docs/rancangan-kumpulan-stesen.md.
--
-- Peserta dibahagikan kepada kumpulan stesen untuk ujian. Unit agihan ialah
-- SEKOLAH, bukan orang: semua peserta satu sekolah duduk dalam stesen yang
-- sama. Satu stesen boleh memuatkan beberapa sekolah.
--
-- KENAPA DUA JADUAL
--   Satu larian (run) memegang tetapan — program mana, tahun, siri, berapa
--   kumpulan. Baris sekolah memaut setiap sekolah kepada label stesennya.
--   Memisahkannya bermakna menjana semula ialah satu padam dan satu sisip,
--   bukan kemas kini separa yang boleh tertinggal baris lama.
--
-- KENAPA SNAPSHOT BILANGAN
--   peserta_snapshot merekod bilangan pada saat jadual dijana. Cetakan yang
--   sudah diedarkan mesti sepadan dengan apa yang dilihat ketika itu, walaupun
--   seorang peserta ditarik balik keesokannya. Sebab yang sama seperti
--   snapshot bayaran.

create table if not exists public.station_group_runs (
  id           uuid primary key default uuid_generate_v4(),
  badge_id     uuid not null references public.badges(id) on delete cascade,
  year         integer not null,
  siri         smallint not null default 1 check (siri >= 1),
  bil_kumpulan integer not null check (bil_kumpulan between 1 and 60),
  nota         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  -- Satu jadual aktif setiap program x tahun x siri. Menjana semula
  -- MENGGANTIKAN yang lama; dua jadual serentak bagi ujian yang sama hanya
  -- menimbulkan persoalan mana satu yang dicetak.
  unique (badge_id, year, siri)
);

create table if not exists public.station_group_schools (
  id               uuid primary key default uuid_generate_v4(),
  run_id           uuid not null references public.station_group_runs(id) on delete cascade,
  station_label    text not null,
  school_id        uuid not null references public.schools(id) on delete cascade,
  peserta_snapshot integer not null default 0 check (peserta_snapshot >= 0),
  created_at       timestamptz default now(),
  -- INILAH peraturan teras, dikuatkuasakan oleh pangkalan data dan bukan
  -- diharapkan daripada algoritma: satu sekolah muncul sekali sahaja dalam
  -- satu jadual, jadi ia MUSTAHIL dipecahkan antara dua stesen. Pelarasan
  -- manual yang tersilap pun tidak boleh melanggarnya.
  unique (run_id, school_id)
);

create index if not exists idx_sgs_run on public.station_group_schools(run_id);
create index if not exists idx_sgs_label on public.station_group_schools(run_id, station_label);

comment on table public.station_group_runs is
  'Satu jadual kumpulan stesen bagi satu program x tahun x siri.';
comment on table public.station_group_schools is
  'Pautan sekolah -> label stesen. Unique(run_id, school_id) menguatkuasakan '
  'bahawa satu sekolah tidak pernah dipecahkan antara stesen.';
comment on column public.station_group_schools.peserta_snapshot is
  'Bilangan peserta pada saat jadual dijana. Cetakan yang diedarkan mesti '
  'sepadan dengan apa yang dilihat ketika itu.';


-- ============================================================
-- RLS — admin sahaja
-- ============================================================
-- Jadual ini merentas sekolah mengikut sifatnya: satu stesen memuatkan
-- beberapa sekolah, jadi sekolah yang boleh membacanya akan melihat kiraan
-- sekolah lain. Ia kekal admin sahaja.

alter table public.station_group_runs    enable row level security;
alter table public.station_group_schools enable row level security;

drop policy if exists "sgr_admin_all" on public.station_group_runs;
create policy "sgr_admin_all" on public.station_group_runs
  for all to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop policy if exists "sgs_admin_all" on public.station_group_schools;
create policy "sgs_admin_all" on public.station_group_schools
  for all to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop trigger if exists set_updated_at on public.station_group_runs;
create trigger set_updated_at before update on public.station_group_runs
  for each row execute function public.handle_updated_at();


-- ============================================================
-- sekolah_layak_stesen — siapa masuk ke dalam agihan
-- ============================================================
-- approved sahaja, PESERTA sahaja. Pegawai tidak diletakkan dalam stesen;
-- mereka mengiringi sekolah masing-masing.
--
-- Pendaftaran yang masih 'open' atau 'submitted' DIKECUALIKAN. Memasukkannya
-- bermakna jadual berubah setiap kali kau menolak satu pendaftaran.

create or replace function public.sekolah_layak_stesen(
  p_badge_name text,
  p_year integer,
  p_siri smallint
)
returns table (school_id uuid, sekolah text, peserta bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh melihat agihan kumpulan stesen';
  end if;

  return query
    select sc.id, sc.name, count(*)
      from public.submission_people sp
      join public.submissions s   on s.id = sp.submission_id
      join public.badges  b       on b.id = s.badge_id
      join public.schools sc      on sc.id = s.school_id
      join public.school_badge_status sbs
        on sbs.school_id = s.school_id and sbs.badge_id = s.badge_id
       and sbs.year = s.submission_year and sbs.siri = sp.siri
     where b.name = p_badge_name
       and s.submission_year = p_year
       and sp.siri = p_siri
       and sbs.status = 'approved'
       and sp.role in ('PESERTA', 'PENERIMA RAMBU')
       and sp.is_deleted = false
       and coalesce(sp.is_withdrawn, false) = false
     group by sc.id, sc.name
     order by count(*) desc, sc.name;
end;
$$;

revoke execute on function public.sekolah_layak_stesen(text, integer, smallint) from public, anon;
grant execute on function public.sekolah_layak_stesen(text, integer, smallint) to authenticated;


-- ============================================================
-- simpan_kumpulan_stesen — ganti jadual secara atomik
-- ============================================================
-- Menjana semula ialah PADAM dan SISIP, dalam satu transaksi. Kemas kini
-- separa akan meninggalkan sekolah daripada agihan lama bercampur dengan yang
-- baharu, dan tiada sesiapa akan perasan sehingga jadual dicetak.
--
-- p_agihan: [{"school_id": "...", "station_label": "1A", "peserta": 16}, ...]

create or replace function public.simpan_kumpulan_stesen(
  p_badge_name   text,
  p_year         integer,
  p_siri         smallint,
  p_bil_kumpulan integer,
  p_agihan       jsonb,
  p_nota         text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_badge uuid;
  v_run   uuid;
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh menjana kumpulan stesen';
  end if;

  select id into v_badge from public.badges where name = p_badge_name;
  if v_badge is null then
    raise exception 'Program % tidak dijumpai', p_badge_name;
  end if;

  delete from public.station_group_runs
   where badge_id = v_badge and year = p_year and siri = p_siri;

  insert into public.station_group_runs (badge_id, year, siri, bil_kumpulan, nota, created_by)
  values (v_badge, p_year, p_siri, p_bil_kumpulan, p_nota, auth.uid())
  returning id into v_run;

  insert into public.station_group_schools (run_id, station_label, school_id, peserta_snapshot)
  select v_run,
         x->>'station_label',
         (x->>'school_id')::uuid,
         coalesce((x->>'peserta')::integer, 0)
    from jsonb_array_elements(p_agihan) as x;

  return v_run;
end;
$$;

revoke execute on function public.simpan_kumpulan_stesen(text, integer, smallint, integer, jsonb, text) from public, anon;
grant execute on function public.simpan_kumpulan_stesen(text, integer, smallint, integer, jsonb, text) to authenticated;
