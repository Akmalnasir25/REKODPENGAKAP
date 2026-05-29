-- ============================================================
-- MIGRATION 012: Modul Kursus Pemimpin
-- ============================================================
-- Tujuan:
-- - Akaun pemimpin individu (guru/luar) terpisah dari akaun sekolah
-- - Kursus boleh dicipta admin daerah/negeri
-- - Pendaftaran auto-approve dengan kuota
-- - Kehadiran, hasil & sijil
-- ============================================================

-- ============================================================
-- 1. LEADER ACCOUNTS (Akaun Pemimpin Individu)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leader_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  ic_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone_number text NOT NULL,
  leader_type text NOT NULL CHECK (leader_type IN ('guru', 'luar')),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  negeri_id uuid REFERENCES public.negeri(id) ON DELETE SET NULL,
  daerah_id uuid REFERENCES public.daerah(id) ON DELETE SET NULL,
  email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leader_accounts_email ON public.leader_accounts(email);
CREATE INDEX IF NOT EXISTS idx_leader_accounts_ic ON public.leader_accounts(ic_number);
CREATE INDEX IF NOT EXISTS idx_leader_accounts_negeri ON public.leader_accounts(negeri_id);
CREATE INDEX IF NOT EXISTS idx_leader_accounts_daerah ON public.leader_accounts(daerah_id);

-- ============================================================
-- 2. COURSES (Kursus)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  scope text NOT NULL CHECK (scope IN ('negeri', 'daerah')),
  negeri_id uuid REFERENCES public.negeri(id) ON DELETE CASCADE,
  daerah_id uuid REFERENCES public.daerah(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  venue text NOT NULL,
  venue_address text,
  quota integer NOT NULL DEFAULT 30 CHECK (quota > 0),
  fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  registration_deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled')),
  created_by_role text CHECK (created_by_role IN ('daerah_admin', 'negeri_admin', 'developer')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_course_scope_id CHECK (
    (scope = 'negeri' AND negeri_id IS NOT NULL AND daerah_id IS NULL) OR
    (scope = 'daerah' AND daerah_id IS NOT NULL AND negeri_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_scope ON public.courses(scope);
CREATE INDEX IF NOT EXISTS idx_courses_negeri ON public.courses(negeri_id);
CREATE INDEX IF NOT EXISTS idx_courses_daerah ON public.courses(daerah_id);
CREATE INDEX IF NOT EXISTS idx_courses_start_date ON public.courses(start_date);

-- ============================================================
-- 3. COURSE REGISTRATIONS (Pendaftaran)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES public.leader_accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'cancelled', 'attended', 'absent', 'passed', 'failed')),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'waived')),
  payment_proof_url text,
  payment_verified_at timestamptz,
  payment_verified_by text,
  result_grade text,
  result_notes text,
  certificate_url text,
  certificate_generated_at timestamptz,
  admin_notes text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, leader_id)
);

CREATE INDEX IF NOT EXISTS idx_course_reg_course ON public.course_registrations(course_id);
CREATE INDEX IF NOT EXISTS idx_course_reg_leader ON public.course_registrations(leader_id);
CREATE INDEX IF NOT EXISTS idx_course_reg_status ON public.course_registrations(status);
CREATE INDEX IF NOT EXISTS idx_course_reg_payment ON public.course_registrations(payment_status);

-- ============================================================
-- 4. COURSE DOCUMENTS (Dokumen Sokongan)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.course_registrations(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('ic', 'sijil', 'lain')),
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_docs_reg ON public.course_documents(registration_id);

-- ============================================================
-- 5. COURSE ATTENDANCE (Kehadiran)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES public.leader_accounts(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.course_registrations(id) ON DELETE CASCADE,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  method text NOT NULL DEFAULT 'manual' CHECK (method IN ('qr', 'manual')),
  verified_by text,
  notes text,
  UNIQUE(course_id, leader_id)
);

CREATE INDEX IF NOT EXISTS idx_course_att_course ON public.course_attendance(course_id);
CREATE INDEX IF NOT EXISTS idx_course_att_leader ON public.course_attendance(leader_id);

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.leader_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_attendance ENABLE ROW LEVEL SECURITY;

-- Leader accounts: bolehkan anon untuk SELECT (untuk cek email/IC unique semasa daftar) & INSERT (daftar baru)
CREATE POLICY "Anon can register leader" ON public.leader_accounts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read leader for login" ON public.leader_accounts
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update leader login meta" ON public.leader_accounts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Courses: anon SELECT (untuk browse) & INSERT/UPDATE oleh admin (gunakan service_role atau anon untuk simplicity)
CREATE POLICY "Anyone can read courses" ON public.courses
  FOR SELECT TO anon USING (true);
CREATE POLICY "Admin can manage courses" ON public.courses
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Registrations
CREATE POLICY "Anon can read registrations" ON public.course_registrations
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can manage registrations" ON public.course_registrations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Documents
CREATE POLICY "Anon docs all" ON public.course_documents
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Attendance
CREATE POLICY "Anon att all" ON public.course_attendance
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Service role full access
CREATE POLICY "Service role leader full" ON public.leader_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role courses full" ON public.courses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role reg full" ON public.course_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role docs full" ON public.course_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role att full" ON public.course_attendance FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('course-documents', 'course-documents', true),
  ('course-certificates', 'course-certificates', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. HELPER VIEW: senarai pendaftaran dengan info penuh
-- ============================================================
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
