-- Tambah kolum category dalam feedbacks table
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'umum' CHECK (category IN ('umum', 'sistem'));

-- Index untuk filter by category
CREATE INDEX IF NOT EXISTS idx_feedbacks_category ON public.feedbacks(category);
