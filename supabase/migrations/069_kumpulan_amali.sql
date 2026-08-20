-- 069 — jadual kumpulan ujian amali (ikatan)
--
-- Rujuk docs/rancangan-kumpulan-amali.md.
--
-- BEZANYA DARIPADA KUMPULAN STESEN (migrasi 061)
--   Kumpulan stesen mengagihkan SEKOLAH; satu sekolah tidak pernah dipecahkan.
--   Kumpulan amali mengagihkan ORANG, lapan sekumpulan, kerana penguji ikatan
--   hanya boleh mengendalikan lapan peserta serentak. Sekolah 20 orang MESTI
--   dipecahkan kepada 8 + 8 + baki 4, dan baki itu bergabung dengan baki
--   sekolah lain menjadi kumpulan CAMPUR.
--
--   Kerana itu jadual ini menyimpan baris SEORANG, bukan baris sekolah. Nama
--   peserta muncul pada borang cetakan, jadi ia perlu wujud di sini.
--
-- KENAPA SNAPSHOT NAMA DAN SEKOLAH
--   Sama seperti 061: borang yang sudah dicetak dan diedarkan kepada penguji
--   mesti sepadan dengan apa yang dilihat ketika ia dijana, walaupun seorang
--   peserta ditarik balik atau namanya dibetulkan keesokannya.

create table if not exists public.practical_group_runs (
  id            uuid primary key default uuid_generate_v4(),
  badge_id      uuid not null references public.badges(id) on delete cascade,
  year          integer not null,
  siri          smallint not null default 1 check (siri >= 1),
  -- Saiz sasaran, bukan saiz dijamin. Kumpulan CAMPUR terakhir hampir pasti
  -- kurang daripada ini, dan pelarasan manual boleh menjadikan mana-mana
  -- kumpulan lebih atau kurang. Had 20 kerana borang ikatan tidak muat lagi.
  saiz_kumpulan smallint not null default 8 check (saiz_kumpulan between 2 and 20),
  -- Peserta unit PPKI dan PPKI Udara dikumpulkan berasingan daripada yang lain.
  asing_ppki    boolean not null default true,
  nota          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  -- Satu jadual aktif setiap program x tahun x siri, seperti 061. Menjana
  -- semula MENGGANTIKAN yang lama.
  unique (badge_id, year, siri)
);

create table if not exists public.practical_group_members (
  id         uuid primary key default uuid_generate_v4(),
  run_id     uuid not null references public.practical_group_runs(id) on delete cascade,
  kumpulan   smallint not null check (kumpulan >= 1),
  -- Dipautkan kepada baris orang, bukan nombor kad pengenalan. IC boleh kosong
  -- (migrasi 016) dan boleh dibetulkan kemudian; id baris tidak.
  person_id  uuid not null references public.submission_people(id) on delete cascade,
  nama       text not null,
  school_id  uuid references public.schools(id) on delete set null,
  sekolah    text not null default '-',
  unit       text,
  created_at timestamptz default now(),
  -- Seorang peserta hanya boleh berada dalam SATU kumpulan. Ini peraturan
  -- teras, dikuatkuasakan oleh pangkalan data dan bukan diharapkan daripada
  -- algoritma: pelarasan manual yang tersilap pun tidak boleh melanggarnya.
  unique (run_id, person_id)
);

create index if not exists idx_pgm_run on public.practical_group_members(run_id);
create index if not exists idx_pgm_kumpulan on public.practical_group_members(run_id, kumpulan);

comment on table public.practical_group_runs is
  'Satu jadual kumpulan ujian amali (ikatan) bagi satu program x tahun x siri.';
comment on table public.practical_group_members is
  'Pautan peserta -> nombor kumpulan. Unique(run_id, person_id) menguatkuasakan '
  'seorang peserta hanya berada dalam satu kumpulan.';
comment on column public.practical_group_runs.saiz_kumpulan is
  'Saiz sasaran, bukan saiz dijamin — kumpulan CAMPUR terakhir selalunya kurang.';


-- ============================================================
-- RLS — admin sahaja
-- ============================================================
-- Satu kumpulan CAMPUR memuatkan peserta beberapa sekolah, jadi sekolah yang
-- boleh membacanya akan melihat nama murid sekolah lain. Kekal admin sahaja,
-- atas sebab yang sama seperti 061.

alter table public.practical_group_runs    enable row level security;
alter table public.practical_group_members enable row level security;

drop policy if exists "pgr_admin_all" on public.practical_group_runs;
create policy "pgr_admin_all" on public.practical_group_runs
  for all to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop policy if exists "pgm_admin_all" on public.practical_group_members;
create policy "pgm_admin_all" on public.practical_group_members
  for all to authenticated
  using (public.is_admin_or_above())
  with check (public.is_admin_or_above());

drop trigger if exists set_updated_at on public.practical_group_runs;
create trigger set_updated_at before update on public.practical_group_runs
  for each row execute function public.handle_updated_at();


-- ============================================================
-- peserta_layak_amali — siapa masuk ke dalam agihan
-- ============================================================
-- Syarat kelayakan SAMA seperti sekolah_layak_stesen (061): approved sahaja,
-- PESERTA sahaja, tiada yang dipadam atau ditarik diri. Bezanya ia memulangkan
-- baris seorang, bukan kiraan sekolah, kerana borang ikatan menyenaraikan nama.
--
-- Pendaftaran yang masih 'open' atau 'submitted' DIKECUALIKAN — kalau tidak,
-- jadual berubah setiap kali satu pendaftaran ditolak.

create or replace function public.peserta_layak_amali(
  p_badge_name text,
  p_year integer,
  p_siri smallint
)
returns table (
  person_id uuid,
  nama      text,
  school_id uuid,
  sekolah   text,
  unit      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Hanya admin boleh melihat agihan kumpulan amali';
  end if;

  return query
    select sp.id, sp.name, sc.id, sc.name, sp.unit
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
     order by sc.name, sp.name;
end;
$$;

revoke execute on function public.peserta_layak_amali(text, integer, smallint) from public, anon;
grant execute on function public.peserta_layak_amali(text, integer, smallint) to authenticated;


-- ============================================================
-- simpan_kumpulan_amali — ganti jadual secara atomik
-- ============================================================
-- PADAM dan SISIP dalam satu transaksi, sebab yang sama seperti 061: kemas
-- kini separa akan meninggalkan peserta daripada agihan lama bercampur dengan
-- yang baharu, dan tiada sesiapa perasan sehingga borang dicetak.
--
-- p_ahli: [{"person_id":"...","kumpulan":1,"nama":"...","school_id":"...",
--           "sekolah":"...","unit":"Perdana"}, ...]

create or replace function public.simpan_kumpulan_amali(
  p_badge_name   text,
  p_year         integer,
  p_siri         smallint,
  p_saiz         smallint,
  p_asing_ppki   boolean,
  p_ahli         jsonb,
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
    raise exception 'Hanya admin boleh menjana kumpulan amali';
  end if;

  select id into v_badge from public.badges where name = p_badge_name;
  if v_badge is null then
    raise exception 'Program % tidak dijumpai', p_badge_name;
  end if;

  delete from public.practical_group_runs
   where badge_id = v_badge and year = p_year and siri = p_siri;

  insert into public.practical_group_runs
         (badge_id, year, siri, saiz_kumpulan, asing_ppki, nota, created_by)
  values (v_badge, p_year, p_siri, p_saiz, p_asing_ppki, p_nota, auth.uid())
  returning id into v_run;

  insert into public.practical_group_members
         (run_id, kumpulan, person_id, nama, school_id, sekolah, unit)
  select v_run,
         (x->>'kumpulan')::smallint,
         (x->>'person_id')::uuid,
         coalesce(x->>'nama', '-'),
         nullif(x->>'school_id', '')::uuid,
         coalesce(nullif(x->>'sekolah', ''), '-'),
         nullif(x->>'unit', '')
    from jsonb_array_elements(p_ahli) as x;

  return v_run;
end;
$$;

revoke execute on function public.simpan_kumpulan_amali(text, integer, smallint, smallint, boolean, jsonb, text) from public, anon;
grant execute on function public.simpan_kumpulan_amali(text, integer, smallint, smallint, boolean, jsonb, text) to authenticated;
