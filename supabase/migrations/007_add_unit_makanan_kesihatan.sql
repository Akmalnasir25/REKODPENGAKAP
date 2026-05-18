-- ============================================================
-- MIGRATION 007: Tambah kolum unit, makanan, masalah_kesihatan
-- Tukar kategori kepada Pengakap Kanak-kanak/Muda/Remaja/Kelana
-- ============================================================

-- 1. Tambah kolum baru
ALTER TABLE public.submission_people
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS makanan text,
  ADD COLUMN IF NOT EXISTS masalah_kesihatan text,
  ADD COLUMN IF NOT EXISTS masalah_kesihatan_lain text;

-- 2. DROP semua constraints (lama & yang mungkin sudah wujud dari percubaan sebelum)
ALTER TABLE public.submission_people DROP CONSTRAINT IF EXISTS submission_people_category_check;
ALTER TABLE public.submission_people DROP CONSTRAINT IF EXISTS chk_unit;
ALTER TABLE public.submission_people DROP CONSTRAINT IF EXISTS chk_makanan;
ALTER TABLE public.submission_people DROP CONSTRAINT IF EXISTS chk_masalah_kesihatan;

-- 3. Migrate data lama: pindah nilai category lama ke unit, set category kepada NULL dulu
UPDATE public.submission_people
  SET unit = category, category = NULL
  WHERE category IN ('Perdana', 'Udara', 'Laut', 'PPKI', 'PPKI Udara');

-- 4. Set default kategori baru untuk rekod yang category NULL
UPDATE public.submission_people
  SET category = 'Pengakap Kanak-kanak'
  WHERE category IS NULL AND role = 'PESERTA';

-- 5. Tambah CHECK constraint baru untuk category
ALTER TABLE public.submission_people
  ADD CONSTRAINT submission_people_category_check CHECK (category IN ('Pengakap Kanak-kanak', 'Pengakap Muda', 'Pengakap Remaja', 'Kelana') OR category IS NULL);

-- 6. Tambah CHECK constraints untuk kolum baru
ALTER TABLE public.submission_people
  ADD CONSTRAINT chk_unit CHECK (unit IN ('Perdana', 'Udara', 'Laut', 'PPKI', 'PPKI Udara') OR unit IS NULL);

ALTER TABLE public.submission_people
  ADD CONSTRAINT chk_makanan CHECK (makanan IN ('Biasa', 'Vegetarian') OR makanan IS NULL);

ALTER TABLE public.submission_people
  ADD CONSTRAINT chk_masalah_kesihatan CHECK (masalah_kesihatan IN ('Alahan', 'Asma', 'Gastrik', 'Penyakit Jantung', 'Migrain', 'Penyakit Kronik', 'Lain-lain', 'Tiada') OR masalah_kesihatan IS NULL);

-- 7. Set default untuk makanan dan masalah_kesihatan bagi rekod sedia ada
UPDATE public.submission_people
  SET makanan = 'Biasa'
  WHERE makanan IS NULL AND role = 'PESERTA';

UPDATE public.submission_people
  SET masalah_kesihatan = 'Tiada'
  WHERE masalah_kesihatan IS NULL AND role = 'PESERTA';
