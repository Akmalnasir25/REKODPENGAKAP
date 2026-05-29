-- ============================================================
-- MIGRATION 015: Leader School Link Approval Workflow
-- ============================================================
-- Tujuan:
-- - Pemimpin (guru) yang link ke sekolah PERLU approval dari
--   akaun sekolah utama (school_user) sebelum boleh akses data
-- - Patuhi PDPA - persetujuan jelas sebelum kongsi data sensitif
-- ============================================================

-- ============================================================
-- 1. TAMBAH STATUS APPROVAL DALAM LEADER_ACCOUNTS
-- ============================================================
ALTER TABLE public.leader_accounts
  ADD COLUMN IF NOT EXISTS school_link_status text DEFAULT NULL
    CHECK (school_link_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS school_link_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS school_link_approved_by text,
  ADD COLUMN IF NOT EXISTS school_link_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS school_link_reject_reason text;

CREATE INDEX IF NOT EXISTS idx_leader_school_link_status
  ON public.leader_accounts(school_link_status)
  WHERE school_link_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leader_school_id_status
  ON public.leader_accounts(school_id, school_link_status)
  WHERE school_id IS NOT NULL;

-- ============================================================
-- 2. SET DEFAULT 'pending' UNTUK BARIS YANG ADA SCHOOL_ID
-- ============================================================
UPDATE public.leader_accounts
SET school_link_status = 'pending',
    school_link_requested_at = COALESCE(school_link_requested_at, created_at)
WHERE school_id IS NOT NULL
  AND school_link_status IS NULL;

-- ============================================================
-- 3. AUDIT LOG UNTUK TRACKING APPROVAL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leader_school_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES public.leader_accounts(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('request', 'approve', 'reject', 'revoke')),
  performed_by text NOT NULL,
  performed_by_role text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leader_audit_leader
  ON public.leader_school_audit(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_audit_school
  ON public.leader_school_audit(school_id);

-- ============================================================
-- 4. RLS untuk audit table
-- ============================================================
ALTER TABLE public.leader_school_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_anon_all" ON public.leader_school_audit;
CREATE POLICY "audit_anon_all" ON public.leader_school_audit
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audit_service_role" ON public.leader_school_audit;
CREATE POLICY "audit_service_role" ON public.leader_school_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
