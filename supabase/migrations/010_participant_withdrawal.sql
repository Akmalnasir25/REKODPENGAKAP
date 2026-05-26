-- ============================================================
-- MIGRATION 010: Penarikan Diri Peserta (Withdrawal)
-- ============================================================
-- Apabila peserta tarik diri di tengah-tengah program (cth pulang awal),
-- admin daerah/negeri akan scan QR peserta dan rekod sebab.
-- Peserta yang ditarik balik akan dikecualikan dari statistik aktif
-- dan dipindahkan ke senarai/analisis Penarikan Diri.
-- ============================================================

ALTER TABLE public.submission_people
  ADD COLUMN IF NOT EXISTS is_withdrawn boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS withdrawal_notes text,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submission_people_withdrawn ON public.submission_people(is_withdrawn);
CREATE INDEX IF NOT EXISTS idx_submission_people_withdrawn_at ON public.submission_people(withdrawn_at);
