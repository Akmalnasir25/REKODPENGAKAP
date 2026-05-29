-- ============================================================
-- MIGRATION 019: broadcast_sessions, updated_at triggers, storage RLS
-- ============================================================

-- ============================================================
-- 1. BROADCAST SESSIONS TABLE (missing from migration 005)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.broadcast_sessions (
  id text PRIMARY KEY,
  step text,
  scope text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_sessions_service_role" ON public.broadcast_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "broadcast_sessions_anon_select" ON public.broadcast_sessions
  FOR SELECT TO anon USING (true);
CREATE POLICY "broadcast_sessions_anon_update" ON public.broadcast_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

INSERT INTO public.broadcast_sessions (id, step, scope)
VALUES ('admin_session', null, null)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. UPDATED_AT TRIGGERS (missing on 7 tables)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_feedbacks ON public.feedbacks;
CREATE TRIGGER set_updated_at_feedbacks
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_telegram_groups ON public.telegram_groups;
CREATE TRIGGER set_updated_at_telegram_groups
  BEFORE UPDATE ON public.telegram_groups
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_leader_accounts ON public.leader_accounts;
CREATE TRIGGER set_updated_at_leader_accounts
  BEFORE UPDATE ON public.leader_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_courses ON public.courses;
CREATE TRIGGER set_updated_at_courses
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_course_registrations ON public.course_registrations;
CREATE TRIGGER set_updated_at_course_registrations
  BEFORE UPDATE ON public.course_registrations
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_certificate_templates ON public.certificate_templates;
CREATE TRIGGER set_updated_at_certificate_templates
  BEFORE UPDATE ON public.certificate_templates
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_broadcast_sessions ON public.broadcast_sessions;
CREATE TRIGGER set_updated_at_broadcast_sessions
  BEFORE UPDATE ON public.broadcast_sessions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================
-- 3. STORAGE BUCKETS - Set to private (run manually if fails)
-- ============================================================
-- NOTE: Storage policies bergantung pada Supabase version.
-- Jika INSERT ke storage.policies gagal, set buckets ke private
-- secara manual di Supabase Dashboard > Storage > Policies
UPDATE storage.buckets SET public = false WHERE id IN ('course-documents', 'course-certificates');
