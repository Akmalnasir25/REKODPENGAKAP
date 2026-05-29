-- ============================================================
-- MIGRATION 017: Benarkan anon insert feedbacks
-- ============================================================
-- Tujuan: Chatbot pemimpin/leader tidak guna Supabase Auth,
-- jadi perlu benarkan anon role untuk insert feedback.
-- ============================================================

-- Drop policy lama yang hanya untuk authenticated
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedbacks;

-- Policy baru: authenticated boleh insert (dengan user_id = auth.uid())
CREATE POLICY "Authenticated users can insert own feedback"
  ON public.feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy baru: anon boleh insert feedback (untuk leader/school_user tanpa Supabase Auth)
CREATE POLICY "Anon can insert feedback"
  ON public.feedbacks FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anon juga boleh baca feedback sendiri (jika ada user_id)
CREATE POLICY "Anon can read feedback"
  ON public.feedbacks FOR SELECT
  TO anon
  USING (true);

-- Anon boleh update feedback (untuk mark resolved dll)
CREATE POLICY "Anon can update feedback"
  ON public.feedbacks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
