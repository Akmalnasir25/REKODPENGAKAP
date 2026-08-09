-- ============================================================
-- MIGRATION 031: Yuran ikut Siri & Jenis Sekolah
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §3.
--
-- KEPERLUAN
--   Yuran boleh berbeza antara siri (Siri 1 RM67, Siri 2 RM80) dan antara
--   jenis sekolah (menengah membayar lebih daripada rendah).
--
-- PRINSIP PEMISAHAN
--   program_settings  menentukan SIAPA dicaj  (yuran null = peranan tidak dicaj)
--   override di sini  menentukan BERAPA       (hanya jumlah, bukan keahlian)
--
--   Ini bukan sekadar kekemasan. Ia bermakna set peranan yang dicaj adalah
--   sama untuk setiap sekolah dalam program, jadi peraturan "sesiapa yang
--   dicaj mengambil tempat" (Keputusan #10) kekal benar dan fungsi
--   siri_seats_taken() TIDAK perlu diubah langsung.
--
--   Kalau override dibenarkan menambah peranan baharu, pemimpin dari SMK
--   akan mengambil tempat sementara pemimpin dari SK tidak — untuk program
--   dan had yang sama. Fungsi resolve_program_fees() di bawah menapis
--   keadaan itu secara aktif.
-- ============================================================


-- ============================================================
-- 1. schools.school_type
-- ============================================================

alter table public.schools
  add column if not exists school_type text not null default 'lain'
    check (school_type in ('rendah', 'menengah', 'lain'));

-- Backfill daripada nama. Susunan penting: "SEKOLAH MENENGAH KEBANGSAAN"
-- mengandungi perkataan KEBANGSAAN, jadi menengah mesti diuji dahulu.
update public.schools
   set school_type = 'menengah'
 where school_type = 'lain'
   and upper(name) ~ '(^SMK|^SMJK|^SM\y|SEKOLAH MENENGAH)';

update public.schools
   set school_type = 'rendah'
 where school_type = 'lain'
   and upper(name) ~ '(^SK\y|^SJK|^SRK|SEKOLAH KEBANGSAAN|SEKOLAH JENIS KEBANGSAAN|SEKOLAH RENDAH)';

-- Apa-apa yang tinggal 'lain' (cth entri JPN, atau nama yang tidak lazim)
-- perlu ditetapkan manual oleh admin. Ia TIDAK dianggap rendah secara diam
-- kerana meneka jenis sekolah bermakna meneka jumlah yang perlu dibayar.

create index if not exists idx_schools_type on public.schools(school_type);

comment on column public.schools.school_type is
  'Menentukan kadar yuran mana yang terpakai. Diisi automatik daripada nama '
  'semasa migrasi 031; baris "lain" perlu disemak manual oleh admin.';


-- ============================================================
-- 2. program_fee_overrides
-- ============================================================
-- Satu baris = satu pengecualian kepada yuran asas program.
-- siri NULL        = terpakai kepada semua siri
-- school_type NULL = terpakai kepada semua jenis sekolah

create table if not exists public.program_fee_overrides (
  id uuid primary key default gen_random_uuid(),
  program_setting_id uuid not null references public.program_settings(id) on delete cascade,

  siri smallint check (siri is null or siri >= 1),
  school_type text check (school_type is null or school_type in ('rendah', 'menengah', 'lain')),

  fee_peserta  numeric(10,2) check (fee_peserta  is null or fee_peserta  >= 0),
  fee_pemimpin numeric(10,2) check (fee_pemimpin is null or fee_pemimpin >= 0),
  fee_penolong numeric(10,2) check (fee_penolong is null or fee_penolong >= 0),

  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Satu override per gabungan. COALESCE supaya unique berfungsi dengan NULL
-- (corak sama seperti uq_program_settings).
create unique index if not exists uq_program_fee_override
  on public.program_fee_overrides (
    program_setting_id,
    coalesce(siri, 0),
    coalesce(school_type, '*')
  );

create index if not exists idx_pfo_setting on public.program_fee_overrides(program_setting_id);

drop trigger if exists set_updated_at on public.program_fee_overrides;
create trigger set_updated_at before update on public.program_fee_overrides
  for each row execute function public.handle_updated_at();


-- ============================================================
-- 3. resolve_program_fees — keutamaan paling khusus menang
-- ============================================================
-- Susunan padanan:
--   1. (siri tepat, jenis tepat)
--   2. (siri tepat, semua jenis)
--   3. (semua siri, jenis tepat)
--   4. (semua siri, semua jenis)
--   5. yuran asas program_settings
--
-- Peranan yang TIDAK dicaj pada aras program kekal tidak dicaj, walau apa
-- pun yang override cuba tetapkan. Inilah yang mengekalkan Keputusan #10.

create or replace function public.resolve_program_fees(
  p_program_setting_id uuid,
  p_siri smallint default 1,
  p_school_type text default 'lain'
)
returns table (
  fee_peserta numeric(10,2),
  fee_pemimpin numeric(10,2),
  fee_penolong numeric(10,2)
)
language sql
stable
security definer
set search_path = public
as $$
  with asas as (
    select ps.fee_peserta, ps.fee_pemimpin, ps.fee_penolong
    from public.program_settings ps
    where ps.id = p_program_setting_id
  ),
  pilihan as (
    select o.fee_peserta, o.fee_pemimpin, o.fee_penolong,
           -- keutamaan: nombor lebih kecil = lebih khusus
           case
             when o.siri is not null and o.school_type is not null then 1
             when o.siri is not null                               then 2
             when o.school_type is not null                        then 3
             else 4
           end as keutamaan
    from public.program_fee_overrides o
    where o.program_setting_id = p_program_setting_id
      and (o.siri is null or o.siri = p_siri)
      and (o.school_type is null or o.school_type = p_school_type)
  ),
  terpilih as (
    select * from pilihan order by keutamaan limit 1
  )
  select
    -- coalesce(override, asas) memberi jumlah; syarat `asas is not null`
    -- memastikan override tidak boleh MENAMBAH peranan yang dicaj.
    case when asas.fee_peserta  is null then null
         else coalesce((select fee_peserta  from terpilih), asas.fee_peserta)  end,
    case when asas.fee_pemimpin is null then null
         else coalesce((select fee_pemimpin from terpilih), asas.fee_pemimpin) end,
    case when asas.fee_penolong is null then null
         else coalesce((select fee_penolong from terpilih), asas.fee_penolong) end
  from asas;
$$;

grant execute on function public.resolve_program_fees(uuid, smallint, text) to authenticated;


-- ============================================================
-- 4. RLS — program_fee_overrides
-- ============================================================
-- Baca untuk semua: sekolah perlu nampak yuran mereka sendiri sebelum
-- membayar. Tulis untuk admin sahaja — corak sama seperti program_settings.

alter table public.program_fee_overrides enable row level security;

drop policy if exists "pfo_select" on public.program_fee_overrides;
create policy "pfo_select" on public.program_fee_overrides
  for select using (true);

drop policy if exists "pfo_insert" on public.program_fee_overrides;
create policy "pfo_insert" on public.program_fee_overrides
  for insert to authenticated with check (public.is_admin_or_above());

drop policy if exists "pfo_update" on public.program_fee_overrides;
create policy "pfo_update" on public.program_fee_overrides
  for update to authenticated using (public.is_admin_or_above());

drop policy if exists "pfo_delete" on public.program_fee_overrides;
create policy "pfo_delete" on public.program_fee_overrides
  for delete to authenticated using (public.is_admin_or_above());
