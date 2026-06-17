-- ============================================================
-- MIGRATION 023: Tetapan Bayaran (Yuran) & Saiz Baju per Program
-- ============================================================
-- Tujuan:
-- - program_settings: konfigurasi yuran + saiz baju bagi setiap program,
--   ditetapkan oleh admin ikut skop (negeri/daerah) dan tahun.
--     * Program scope 'negeri' -> ditetapkan oleh admin negeri (negeri_id)
--     * Program scope 'daerah' -> ditetapkan oleh admin daerah (daerah_id)
-- - Yuran ikut peranan: Peserta, Pemimpin, Penolong Pemimpin (null = tak caj)
-- - shirt_enabled: aktifkan medan saiz baju untuk program tersebut
-- - submission_people.shirt_size: saiz baju individu (diisi semasa daftar)
-- ============================================================

create table if not exists public.program_settings (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null references public.badges(id) on delete cascade,
  negeri_id uuid references public.negeri(id) on delete cascade,
  daerah_id uuid references public.daerah(id) on delete cascade,
  year integer not null,
  payment_enabled boolean default false,
  fee_peserta numeric(10,2),
  fee_pemimpin numeric(10,2),
  fee_penolong numeric(10,2),
  shirt_enabled boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Satu tetapan per program + skop + tahun.
-- COALESCE supaya unique berfungsi walaupun negeri_id / daerah_id null.
create unique index if not exists uq_program_settings
  on public.program_settings (
    badge_id, year,
    coalesce(negeri_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(daerah_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_program_settings_badge on public.program_settings(badge_id);
create index if not exists idx_program_settings_year on public.program_settings(year);
create index if not exists idx_program_settings_negeri on public.program_settings(negeri_id);
create index if not exists idx_program_settings_daerah on public.program_settings(daerah_id);

-- Saiz baju per individu (nullable; hanya diisi bila program perlukan)
alter table public.submission_people
  add column if not exists shirt_size text
    check (shirt_size in ('XS','S','M','L','XL','2XL','3XL','4XL') or shirt_size is null);

-- ============================================================
-- RLS: baca untuk semua (borang & rumusan), tulis untuk admin+
-- ============================================================
alter table public.program_settings enable row level security;

create policy "program_settings_select" on public.program_settings
  for select using (true);

create policy "program_settings_insert" on public.program_settings
  for insert to authenticated with check (public.is_admin_or_above());

create policy "program_settings_update" on public.program_settings
  for update to authenticated using (public.is_admin_or_above());

create policy "program_settings_delete" on public.program_settings
  for delete to authenticated using (public.is_admin_or_above());
