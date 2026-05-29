-- ============================================================
-- MIGRATION 013: Cloudflare R2 + Sijil Custom + Approval
-- ============================================================
-- Tujuan:
-- - Tukar storage dari Supabase ke Cloudflare R2 (URL kekal)
-- - Sijil bersyarat (toggle per kursus)
-- - Template sijil per kursus + per scope (default)
-- - Approval flow untuk sijil
-- ============================================================

-- ============================================================
-- 1. UPDATE COURSES: tambah pilihan sijil digital
-- ============================================================
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS has_digital_certificate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_template_url text,
  ADD COLUMN IF NOT EXISTS certificate_template_id uuid,
  ADD COLUMN IF NOT EXISTS certificate_field_positions jsonb,
  ADD COLUMN IF NOT EXISTS certificate_requires_approval boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_courses_has_cert ON public.courses(has_digital_certificate);

-- ============================================================
-- 2. CERTIFICATE TEMPLATES (default per scope)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  scope text NOT NULL CHECK (scope IN ('negeri', 'daerah', 'global')),
  negeri_id uuid REFERENCES public.negeri(id) ON DELETE CASCADE,
  daerah_id uuid REFERENCES public.daerah(id) ON DELETE CASCADE,
  template_url text NOT NULL,
  field_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_role text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_templates_scope ON public.certificate_templates(scope);
CREATE INDEX IF NOT EXISTS idx_cert_templates_negeri ON public.certificate_templates(negeri_id);
CREATE INDEX IF NOT EXISTS idx_cert_templates_daerah ON public.certificate_templates(daerah_id);
CREATE INDEX IF NOT EXISTS idx_cert_templates_default ON public.certificate_templates(is_default);

-- FK lewat untuk template_id
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS fk_courses_cert_template;
ALTER TABLE public.courses
  ADD CONSTRAINT fk_courses_cert_template
  FOREIGN KEY (certificate_template_id)
  REFERENCES public.certificate_templates(id) ON DELETE SET NULL;

-- ============================================================
-- 3. COURSE REGISTRATIONS: tambah approval status sijil
-- ============================================================
ALTER TABLE public.course_registrations
  ADD COLUMN IF NOT EXISTS certificate_status text DEFAULT 'pending'
    CHECK (certificate_status IN ('pending', 'approved', 'rejected', 'released')),
  ADD COLUMN IF NOT EXISTS certificate_approved_by text,
  ADD COLUMN IF NOT EXISTS certificate_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_reject_reason text;

CREATE INDEX IF NOT EXISTS idx_course_reg_cert_status
  ON public.course_registrations(certificate_status);

-- ============================================================
-- 4. RLS POLICIES untuk certificate_templates
-- ============================================================
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates" ON public.certificate_templates
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon manage templates" ON public.certificate_templates
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Service role templates full" ON public.certificate_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. UPDATE VIEW v_course_registrations_full
-- ============================================================
DROP VIEW IF EXISTS public.v_course_registrations_full;
CREATE OR REPLACE VIEW public.v_course_registrations_full AS
SELECT
  cr.id,
  cr.course_id,
  cr.leader_id,
  cr.status,
  cr.payment_status,
  cr.payment_proof_url,
  cr.result_grade,
  cr.result_notes,
  cr.certificate_url,
  cr.certificate_status,
  cr.certificate_approved_by,
  cr.certificate_approved_at,
  cr.admin_notes,
  cr.registered_at,
  cr.cancelled_at,
  c.code as course_code,
  c.name as course_name,
  c.scope as course_scope,
  c.start_date,
  c.end_date,
  c.venue,
  c.fee_amount,
  c.status as course_status,
  c.has_digital_certificate,
  c.negeri_id as course_negeri_id,
  c.daerah_id as course_daerah_id,
  l.full_name as leader_name,
  l.email as leader_email,
  l.ic_number as leader_ic,
  l.phone_number as leader_phone,
  l.leader_type,
  l.school_id as leader_school_id,
  l.negeri_id as leader_negeri_id,
  l.daerah_id as leader_daerah_id
FROM public.course_registrations cr
JOIN public.courses c ON c.id = cr.course_id
JOIN public.leader_accounts l ON l.id = cr.leader_id;
