-- ============================================================
-- SUPABASE RLS POLICIES
-- Fasa 1 — Row Level Security
-- ============================================================

-- Enable RLS on all tables
alter table public.negeri enable row level security;
alter table public.daerah enable row level security;
alter table public.schools enable row level security;
alter table public.badges enable row level security;
alter table public.profiles enable row level security;
alter table public.school_profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_people enable row level security;
alter table public.school_badge_status enable row level security;
alter table public.audit_logs enable row level security;
alter table public.attendance_verifications enable row level security;
alter table public.attachments enable row level security;

-- ============================================================
-- HELPER: Get current user role
-- ============================================================

create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.get_my_school_id()
returns uuid as $$
  select school_id from public.profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.get_my_negeri_id()
returns uuid as $$
  select negeri_id from public.profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.get_my_daerah_id()
returns uuid as $$
  select daerah_id from public.profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.is_admin_or_above()
returns boolean as $$
  select exists(
    select 1 from public.profiles 
    where id = auth.uid() 
    and role in ('admin', 'negeri_admin', 'daerah_admin', 'developer')
  );
$$ language sql security definer stable;

create or replace function public.is_developer()
returns boolean as $$
  select exists(
    select 1 from public.profiles 
    where id = auth.uid() 
    and role = 'developer'
  );
$$ language sql security definer stable;

-- ============================================================
-- NEGERI — Read: all authenticated, Write: admin+
-- ============================================================

create policy "negeri_select" on public.negeri
  for select using (true);

create policy "negeri_insert" on public.negeri
  for insert to authenticated with check (public.is_admin_or_above());

create policy "negeri_update" on public.negeri
  for update to authenticated using (public.is_admin_or_above());

create policy "negeri_delete" on public.negeri
  for delete to authenticated using (public.is_developer());

-- ============================================================
-- DAERAH — Read: all authenticated, Write: admin+
-- ============================================================

create policy "daerah_select" on public.daerah
  for select using (true);

create policy "daerah_insert" on public.daerah
  for insert to authenticated with check (public.is_admin_or_above());

create policy "daerah_update" on public.daerah
  for update to authenticated using (public.is_admin_or_above());

create policy "daerah_delete" on public.daerah
  for delete to authenticated using (public.is_developer());

-- ============================================================
-- SCHOOLS — Read: scoped by role, Write: admin+
-- ============================================================

create policy "schools_select" on public.schools
  for select to authenticated using (
    case public.get_my_role()
      when 'developer' then true
      when 'admin' then true
      when 'negeri_admin' then negeri_id = public.get_my_negeri_id()
      when 'daerah_admin' then daerah_id = public.get_my_daerah_id()
      when 'school_user' then id = public.get_my_school_id()
      else false
    end
  );

-- Anonymous can read schools for registration dropdown
create policy "schools_select_anon" on public.schools
  for select to anon using (is_active = true);

create policy "schools_insert" on public.schools
  for insert to authenticated with check (public.is_admin_or_above());

create policy "schools_update" on public.schools
  for update to authenticated using (public.is_admin_or_above());

create policy "schools_delete" on public.schools
  for delete to authenticated using (public.is_developer());

-- ============================================================
-- BADGES — Read: all (including anon for form), Write: admin+
-- ============================================================

create policy "badges_select" on public.badges
  for select using (true);

create policy "badges_insert" on public.badges
  for insert to authenticated with check (public.is_admin_or_above());

create policy "badges_update" on public.badges
  for update to authenticated using (public.is_admin_or_above());

create policy "badges_delete" on public.badges
  for delete to authenticated using (public.is_developer());

-- ============================================================
-- PROFILES — Read: own + admin, Write: own + admin
-- ============================================================

create policy "profiles_select" on public.profiles
  for select to authenticated using (
    id = auth.uid() or public.is_admin_or_above()
  );

create policy "profiles_update" on public.profiles
  for update to authenticated using (
    id = auth.uid() or public.is_developer()
  );

-- Insert handled by trigger (handle_new_user)
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (true);

-- ============================================================
-- SCHOOL_PROFILES — Read: own school + admin, Write: own + admin
-- ============================================================

create policy "school_profiles_select" on public.school_profiles
  for select to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "school_profiles_insert" on public.school_profiles
  for insert to authenticated with check (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "school_profiles_update" on public.school_profiles
  for update to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

-- ============================================================
-- SUBMISSIONS — Read: scoped, Write: own school + admin
-- ============================================================

create policy "submissions_select" on public.submissions
  for select to authenticated using (
    case public.get_my_role()
      when 'developer' then true
      when 'admin' then true
      when 'negeri_admin' then school_id in (
        select id from public.schools where negeri_id = public.get_my_negeri_id()
      )
      when 'daerah_admin' then school_id in (
        select id from public.schools where daerah_id = public.get_my_daerah_id()
      )
      when 'school_user' then school_id = public.get_my_school_id()
      else false
    end
  );

create policy "submissions_insert" on public.submissions
  for insert to authenticated with check (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "submissions_update" on public.submissions
  for update to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "submissions_delete" on public.submissions
  for delete to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

-- ============================================================
-- SUBMISSION_PEOPLE — Follow parent submission access
-- ============================================================

create policy "submission_people_select" on public.submission_people
  for select to authenticated using (
    submission_id in (
      select id from public.submissions
    )
  );

create policy "submission_people_insert" on public.submission_people
  for insert to authenticated with check (
    submission_id in (
      select id from public.submissions where school_id = public.get_my_school_id()
    ) or public.is_admin_or_above()
  );

create policy "submission_people_update" on public.submission_people
  for update to authenticated using (
    submission_id in (
      select id from public.submissions where school_id = public.get_my_school_id()
    ) or public.is_admin_or_above()
  );

create policy "submission_people_delete" on public.submission_people
  for delete to authenticated using (
    submission_id in (
      select id from public.submissions where school_id = public.get_my_school_id()
    ) or public.is_admin_or_above()
  );

-- ============================================================
-- SCHOOL_BADGE_STATUS — Read: scoped, Write: own + admin
-- ============================================================

create policy "sbs_select" on public.school_badge_status
  for select to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "sbs_insert" on public.school_badge_status
  for insert to authenticated with check (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "sbs_update" on public.school_badge_status
  for update to authenticated using (
    public.is_admin_or_above()
  );

-- ============================================================
-- AUDIT_LOGS — Read: admin+, Write: all authenticated
-- ============================================================

create policy "audit_select" on public.audit_logs
  for select to authenticated using (public.is_admin_or_above());

create policy "audit_insert" on public.audit_logs
  for insert to authenticated with check (true);

-- ============================================================
-- ATTENDANCE_VERIFICATIONS — Read: scoped, Write: admin+
-- ============================================================

create policy "attendance_select" on public.attendance_verifications
  for select to authenticated using (
    school_id = public.get_my_school_id() or public.is_admin_or_above()
  );

create policy "attendance_insert" on public.attendance_verifications
  for insert to authenticated with check (public.is_admin_or_above());

-- ============================================================
-- ATTACHMENTS — Follow parent submission access
-- ============================================================

create policy "attachments_select" on public.attachments
  for select to authenticated using (
    submission_id in (select id from public.submissions) or public.is_admin_or_above()
  );

create policy "attachments_insert" on public.attachments
  for insert to authenticated with check (
    submission_id in (
      select id from public.submissions where school_id = public.get_my_school_id()
    ) or public.is_admin_or_above()
  );

create policy "attachments_delete" on public.attachments
  for delete to authenticated using (public.is_admin_or_above());
