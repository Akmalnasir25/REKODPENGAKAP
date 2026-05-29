-- ============================================================
-- MIGRATION 014: Fix RLS policies untuk Courses module
-- ============================================================
-- Tujuan:
-- - Pastikan RLS policy bagi semua role (anon, authenticated, service_role)
-- - Mengelakkan error "new row violates row-level security policy"
-- ============================================================

-- ============================================================
-- COURSES
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read courses" ON public.courses;
DROP POLICY IF EXISTS "Admin can manage courses" ON public.courses;
DROP POLICY IF EXISTS "Service role courses full" ON public.courses;

CREATE POLICY "courses_select_all" ON public.courses
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "courses_insert_all" ON public.courses
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "courses_update_all" ON public.courses
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "courses_delete_all" ON public.courses
  FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "courses_service_role" ON public.courses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- COURSE REGISTRATIONS
-- ============================================================
DROP POLICY IF EXISTS "Anon can read registrations" ON public.course_registrations;
DROP POLICY IF EXISTS "Anon can manage registrations" ON public.course_registrations;
DROP POLICY IF EXISTS "Service role reg full" ON public.course_registrations;

CREATE POLICY "reg_select_all" ON public.course_registrations
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "reg_insert_all" ON public.course_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "reg_update_all" ON public.course_registrations
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "reg_delete_all" ON public.course_registrations
  FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "reg_service_role" ON public.course_registrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- COURSE DOCUMENTS
-- ============================================================
DROP POLICY IF EXISTS "Anon docs all" ON public.course_documents;
DROP POLICY IF EXISTS "Service role docs full" ON public.course_documents;

CREATE POLICY "docs_all" ON public.course_documents
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "docs_service_role" ON public.course_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- COURSE ATTENDANCE
-- ============================================================
DROP POLICY IF EXISTS "Anon att all" ON public.course_attendance;
DROP POLICY IF EXISTS "Service role att full" ON public.course_attendance;

CREATE POLICY "att_all" ON public.course_attendance
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "att_service_role" ON public.course_attendance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- LEADER ACCOUNTS
-- ============================================================
DROP POLICY IF EXISTS "Anon can register leader" ON public.leader_accounts;
DROP POLICY IF EXISTS "Anon can read leader for login" ON public.leader_accounts;
DROP POLICY IF EXISTS "Anon can update leader login meta" ON public.leader_accounts;
DROP POLICY IF EXISTS "Service role leader full" ON public.leader_accounts;

CREATE POLICY "leader_all" ON public.leader_accounts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leader_service_role" ON public.leader_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CERTIFICATE TEMPLATES
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read templates" ON public.certificate_templates;
DROP POLICY IF EXISTS "Anon manage templates" ON public.certificate_templates;
DROP POLICY IF EXISTS "Service role templates full" ON public.certificate_templates;

CREATE POLICY "tpl_all" ON public.certificate_templates
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tpl_service_role" ON public.certificate_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
