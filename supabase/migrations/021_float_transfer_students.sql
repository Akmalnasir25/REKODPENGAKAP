-- ============================================================
-- MIGRATION 021: Sistem Apung Pindah Murid
-- ============================================================
-- Tujuan:
-- - Tambah kolum untuk track status apung/pindah murid
-- - Murid tidak dipadam, cuma ditukar status
-- - Sekolah baru boleh tarik murid yang diapungkan
-- ============================================================

-- 1. Tambah kolum baru ke submission_people
ALTER TABLE public.submission_people
  ADD COLUMN IF NOT EXISTS float_status text DEFAULT 'active' CHECK (float_status IN ('active', 'floated', 'transferred')),
  ADD COLUMN IF NOT EXISTS floated_at timestamptz,
  ADD COLUMN IF NOT EXISTS floated_by text,
  ADD COLUMN IF NOT EXISTS float_reason text,
  ADD COLUMN IF NOT EXISTS float_notes text,
  ADD COLUMN IF NOT EXISTS original_school_code text,
  ADD COLUMN IF NOT EXISTS transferred_to_school_code text,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

-- 2. Index untuk carian pantas murid terapung
CREATE INDEX IF NOT EXISTS idx_submission_people_float_status ON public.submission_people(float_status);
CREATE INDEX IF NOT EXISTS idx_submission_people_floated_at ON public.submission_people(floated_at DESC);

-- 3. View: Senarai murid yang sedang diapungkan (belum ditarik)
CREATE OR REPLACE VIEW public.v_floated_students AS
SELECT 
  sp.id,
  sp.submission_id,
  sp.name as student_name,
  sp.ic_number,
  sp.gender,
  sp.race,
  sp.role,
  sp.category,
  sp.membership_id,
  sp.phone_number,
  sp.makanan,
  sp.masalah_kesihatan,
  sp.masalah_kesihatan_lain,
  sp.float_status,
  sp.floated_at,
  sp.floated_by,
  sp.float_reason,
  sp.float_notes,
  sp.original_school_code,
  sub.school_code as current_school_code,
  s.name as school_name,
  s.daerah_id,
  s.negeri_id,
  d.code as daerah_code,
  d.name as daerah_name,
  n.code as negeri_code,
  n.name as negeri_name
FROM public.submission_people sp
JOIN public.submissions sub ON sub.id = sp.submission_id
JOIN public.schools s ON s.id = sub.school_id
LEFT JOIN public.daerah d ON d.id = s.daerah_id
LEFT JOIN public.negeri n ON n.id = s.negeri_id
WHERE sp.float_status = 'floated'
ORDER BY sp.floated_at DESC;

-- 4. View: History murid yang sudah dipindahkan
CREATE OR REPLACE VIEW public.v_transferred_students AS
SELECT 
  sp.id,
  sp.name as student_name,
  sp.ic_number,
  sp.original_school_code,
  sp.transferred_to_school_code,
  sp.floated_at,
  sp.transferred_at,
  sp.float_reason,
  s_orig.name as original_school_name,
  s_new.name as new_school_name
FROM public.submission_people sp
LEFT JOIN public.schools s_orig ON s_orig.school_code = sp.original_school_code
LEFT JOIN public.schools s_new ON s_new.school_code = sp.transferred_to_school_code
WHERE sp.float_status = 'transferred'
ORDER BY sp.transferred_at DESC;

-- 5. RLS untuk view baru
ALTER VIEW public.v_floated_students OWNER TO postgres;
ALTER VIEW public.v_transferred_students OWNER TO postgres;

-- 6. Update existing records (jika ada) supaya semua jadi 'active'
UPDATE public.submission_people 
SET float_status = 'active' 
WHERE float_status IS NULL;
