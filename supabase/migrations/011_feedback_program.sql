-- ============================================================
-- MIGRATION 011: Feedback program targeting
-- ============================================================
-- Tujuan:
-- - Pengguna boleh pilih program (badge) bila hantar feedback
-- - Routing mesej:
--   * Program scope='negeri' -> hantar ke admin negeri sahaja
--   * Program scope='daerah' -> hantar ke admin daerah sahaja
--   * Tiada program dipilih -> hantar ke kedua-dua admin negeri & daerah
-- ============================================================

ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.badges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_name text,
  ADD COLUMN IF NOT EXISTS program_scope text CHECK (program_scope IN ('negeri', 'daerah'));

CREATE INDEX IF NOT EXISTS idx_feedbacks_program_id ON public.feedbacks(program_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_program_scope ON public.feedbacks(program_scope);
