-- 056 — kategori lalai mengikut program
--
-- Rujuk docs/rancangan-kategori-lalai-program.md, keputusan K1.
--
-- MASALAH
--   Borang pendaftaran bermula setiap baris pada 'Pengakap Kanak-kanak'
--   (UserForm.tsx:74), satu nilai tetap untuk setiap program. Pendaftaran
--   Kemahiran — yang sepatutnya Pengakap Remaja — bermula salah, dan guru
--   menukarnya baris demi baris.
--
-- KENAPA LAJUR, BUKAN PETA DALAM KOD
--   Peta dalam kod bermakna setiap program baharu dan setiap perubahan
--   kategori memerlukan suntingan fail dan deploy semula. Program ditambah
--   oleh admin, bukan oleh pembangun (keputusan K1).
--
-- NULL BERMAKNA WARISAN
--   Program tanpa lalai yang ditetapkan kekal pada 'Pengakap Kanak-kanak',
--   iaitu kelakuan hari ini. Tiada program terpaksa mempunyai nilai.

alter table public.program_settings
  add column if not exists default_category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.program_settings'::regclass
       and conname  = 'program_settings_default_category_check'
  ) then
    alter table public.program_settings
      add constraint program_settings_default_category_check
      check (default_category is null or default_category in
        ('Pengakap Kanak-kanak', 'Pengakap Muda', 'Pengakap Remaja', 'Kelana'));
  end if;
end $$;

comment on column public.program_settings.default_category is
  'Kategori yang dipilih dahulu bagi peserta baharu dalam program ini. Guru '
  'masih boleh mengubahnya. NULL = warisi Pengakap Kanak-kanak.';


-- ============================================================
-- Nilai awal
-- ============================================================
-- Dikenakan pada SETIAP tahun dan skop bagi program berkenaan. Padanan ikut
-- nama badge, kerana itulah cara admin memikirkannya.
--
-- Baris yang sudah mempunyai nilai TIDAK ditulis ganti — menjalankan migrasi
-- ini semula tidak boleh memadam pilihan admin.

update public.program_settings ps
   set default_category = v.kategori
  from (values
    ('Keris Gangsa',  'Pengakap Kanak-kanak'),
    ('Keris Emas',    'Pengakap Kanak-kanak'),
    ('Keris Perak',   'Pengakap Kanak-kanak'),
    ('Usaha',         'Pengakap Muda'),
    ('Maju',          'Pengakap Muda'),
    ('Jaya',          'Pengakap Muda'),
    ('Kemahiran',     'Pengakap Remaja'),
    ('Pembantu CPR',  'Pengakap Remaja'),
    ('Pembantu SM',   'Pengakap Muda')
  ) as v(nama, kategori)
  join public.badges b on b.name = v.nama
 where ps.badge_id = b.id
   and ps.default_category is null;
