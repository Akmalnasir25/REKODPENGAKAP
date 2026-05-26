-- ============================================================
-- MIGRATION 009: Pengesahan dua peringkat (Daerah → Negeri)
-- ============================================================
-- Untuk program scope=negeri, admin negeri boleh pilih sama ada
-- pendaftaran perlu disahkan oleh daerah terlebih dahulu sebelum
-- sampai ke negeri untuk pengesahan akhir.
-- ============================================================

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS requires_daerah_approval boolean DEFAULT false;

ALTER TABLE public.school_badge_status
  ADD COLUMN IF NOT EXISTS daerah_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS daerah_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS daerah_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sbs_daerah_approved ON public.school_badge_status(daerah_approved);
