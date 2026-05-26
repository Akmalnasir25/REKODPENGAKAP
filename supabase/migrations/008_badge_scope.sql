-- ============================================================
-- MIGRATION 008: Badge scope (Negeri-level atau Daerah-level)
-- ============================================================
-- Tujuan:
-- - Setiap badge/program ada scope: 'negeri' atau 'daerah'
-- - Kalau scope='negeri', negeri_id wajib (program peringkat negeri)
-- - Kalau scope='daerah', daerah_id wajib (program peringkat daerah)
-- - Default scope='daerah' untuk backward compat
-- ============================================================

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'daerah'
    CHECK (scope IN ('negeri', 'daerah')),
  ADD COLUMN IF NOT EXISTS negeri_id uuid REFERENCES public.negeri(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daerah_id uuid REFERENCES public.daerah(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_badges_scope ON public.badges(scope);
CREATE INDEX IF NOT EXISTS idx_badges_negeri ON public.badges(negeri_id);
CREATE INDEX IF NOT EXISTS idx_badges_daerah ON public.badges(daerah_id);

-- Tukar 'Pengenalan Pengakap Udara' kepada negeri-level di Perak
UPDATE public.badges
SET
  scope = 'negeri',
  negeri_id = (SELECT id FROM public.negeri WHERE code = 'PRK'),
  daerah_id = NULL
WHERE name = 'Pengenalan Pengakap Udara';
