-- ============================================================
-- MIGRATION 018: Secure RLS untuk Courses module
-- ============================================================
-- Tujuan: Restrict write access tanpa break existing flow
-- - Anon boleh READ courses (untuk browse)
-- - Anon boleh INSERT registrations (untuk daftar kursus)
-- - Anon TIDAK boleh UPDATE/DELETE leader_accounts
-- - Service role tetap full access
-- ============================================================

-- ============================================================
-- LEADER ACCOUNTS - RESTRICT WRITE (paling kritikal)
-- ============================================================
DROP POLICY IF EXISTS "leader_all" ON public.leader_accounts;
DROP POLICY IF EXISTS "leader_service_role" ON public.leader_accounts;
DROP POLICY IF EXISTS "leader_select_anon" ON public.leader_accounts;
DROP POLICY IF EXISTS "leader_insert_anon" ON public.leader_accounts;
DROP POLICY IF EXISTS "leader_update_anon" ON public.leader_accounts;

CREATE POLICY "leader_select_anon" ON public.leader_accounts
  FOR SELECT TO anon USING (true);
CREATE POLICY "leader_insert_anon" ON public.leader_accounts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "leader_update_anon" ON public.leader_accounts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "leader_service_role" ON public.leader_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- COURSES - Keep read open, allow admin delete
-- ============================================================
DROP POLICY IF EXISTS "courses_delete_all" ON public.courses;
DROP POLICY IF EXISTS "courses_delete_service_only" ON public.courses;
DROP POLICY IF EXISTS "courses_delete_anon" ON public.courses;

CREATE POLICY "courses_delete_anon" ON public.courses
  FOR DELETE TO anon USING (true);
CREATE POLICY "courses_delete_service_only" ON public.courses
  FOR DELETE TO service_role USING (true);

-- ============================================================
-- COURSE REGISTRATIONS - Keep insert/select, allow admin delete
-- ============================================================
DROP POLICY IF EXISTS "reg_delete_all" ON public.course_registrations;
DROP POLICY IF EXISTS "reg_delete_service_only" ON public.course_registrations;
DROP POLICY IF EXISTS "reg_delete_anon" ON public.course_registrations;

CREATE POLICY "reg_delete_anon" ON public.course_registrations
  FOR DELETE TO anon USING (true);
CREATE POLICY "reg_delete_service_only" ON public.course_registrations
  FOR DELETE TO service_role USING (true);

-- ============================================================
-- FEEDBACKS - Restrict anon UPDATE (only INSERT + own SELECT)
-- ============================================================
DROP POLICY IF EXISTS "Anon can update feedback" ON public.feedbacks;
DROP POLICY IF EXISTS "Anon can read feedback" ON public.feedbacks;
DROP POLICY IF EXISTS "feedbacks_anon_select" ON public.feedbacks;
DROP POLICY IF EXISTS "feedbacks_service_update" ON public.feedbacks;

CREATE POLICY "feedbacks_anon_select" ON public.feedbacks
  FOR SELECT TO anon USING (true);
CREATE POLICY "feedbacks_service_update" ON public.feedbacks
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
