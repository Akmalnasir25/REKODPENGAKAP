-- ============================================================
-- SUPABASE MIGRATION: Sistem Pendaftaran Pengakap
-- Fasa 1 — Schema, Indexes, Constraints
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. REFERENCE TABLES
-- ============================================================

-- Negeri
create table public.negeri (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  created_at timestamptz default now()
);

-- Daerah
create table public.daerah (
  id uuid primary key default uuid_generate_v4(),
  negeri_id uuid not null references public.negeri(id) on delete cascade,
  code text not null unique,
  name text not null,
  created_at timestamptz default now()
);

create index idx_daerah_negeri on public.daerah(negeri_id);

-- Schools
create table public.schools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  school_code text not null unique,
  negeri_id uuid references public.negeri(id) on delete set null,
  daerah_id uuid references public.daerah(id) on delete set null,
  group_number text,
  allow_students boolean default true,
  allow_assistants boolean default true,
  allow_examiners boolean default true,
  is_claimed boolean default false,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_email text,
  claimed_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_schools_negeri on public.schools(negeri_id);
create index idx_schools_daerah on public.schools(daerah_id);
create index idx_schools_code on public.schools(school_code);
create index idx_schools_claimed on public.schools(is_claimed);

-- Badges
create table public.badges (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  is_open boolean default true,
  deadline timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. AUTH / PROFILE TABLES
-- ============================================================

-- Profiles (linked to auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'school_user' check (role in ('school_user', 'admin', 'negeri_admin', 'daerah_admin', 'developer')),
  school_id uuid references public.schools(id) on delete set null,
  negeri_id uuid references public.negeri(id) on delete set null,
  daerah_id uuid references public.daerah(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_profiles_role on public.profiles(role);
create index idx_profiles_school on public.profiles(school_id);
create index idx_profiles_negeri on public.profiles(negeri_id);
create index idx_profiles_daerah on public.profiles(daerah_id);

-- ============================================================
-- 3. SCHOOL PROFILES (Leader/Principal info)
-- ============================================================

create table public.school_profiles (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  principal_name text,
  principal_phone text,
  leader_name text,
  leader_phone text,
  leader_ic text,
  leader_gender text,
  leader_membership_id text,
  leader_race text,
  remarks text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

create index idx_school_profiles_school on public.school_profiles(school_id);

-- ============================================================
-- 4. SUBMISSIONS
-- ============================================================

-- Submission batch
create table public.submissions (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  submission_year integer not null default extract(year from now()),
  submitted_at timestamptz default now(),
  submitted_by uuid references auth.users(id),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'approved', 'locked', 'rejected')),
  source text default 'manual' check (source in ('manual', 'bulk_import', 'migration', 'rambu_upgrade')),
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_submissions_school on public.submissions(school_id);
create index idx_submissions_badge on public.submissions(badge_id);
create index idx_submissions_year on public.submissions(submission_year);
create index idx_submissions_status on public.submissions(status);
create index idx_submissions_school_badge_year on public.submissions(school_id, badge_id, submission_year);

-- Submission people (individuals)
create table public.submission_people (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  name text not null,
  gender text check (gender in ('Lelaki', 'Perempuan')),
  race text,
  membership_id text,
  ic_number text,
  phone_number text,
  role text not null default 'PESERTA' check (role in ('PESERTA', 'PEMIMPIN', 'PENOLONG PEMIMPIN', 'PENGUJI', 'PENERIMA RAMBU')),
  category text check (category in ('Pengakap Kanak-kanak', 'Pengakap Muda', 'Pengakap Remaja', 'Kelana', null)),
  unit text check (unit in ('Perdana', 'Udara', 'Laut', 'PPKI', 'PPKI Udara', null)),
  makanan text check (makanan in ('Biasa', 'Vegetarian', null)),
  masalah_kesihatan text check (masalah_kesihatan in ('Alahan', 'Asma', 'Gastrik', 'Penyakit Jantung', 'Migrain', 'Penyakit Kronik', 'Lain-lain', 'Tiada', null)),
  masalah_kesihatan_lain text,
  remarks text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_submission_people_submission on public.submission_people(submission_id);
create index idx_submission_people_ic on public.submission_people(ic_number);
create index idx_submission_people_name on public.submission_people(name);
create index idx_submission_people_role on public.submission_people(role);
create index idx_submission_people_deleted on public.submission_people(is_deleted);

-- ============================================================
-- 5. SCHOOL BADGE STATUS (Lock/Approve)
-- ============================================================

create table public.school_badge_status (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  year integer not null,
  status text not null default 'open' check (status in ('open', 'submitted', 'approved', 'locked', 'reopened')),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  locked_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(school_id, badge_id, year)
);

create index idx_sbs_school on public.school_badge_status(school_id);
create index idx_sbs_badge on public.school_badge_status(badge_id);
create index idx_sbs_year on public.school_badge_status(year);
create index idx_sbs_status on public.school_badge_status(status);

-- ============================================================
-- 6. AUDIT LOGS
-- ============================================================

create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references auth.users(id),
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz default now()
);

create index idx_audit_actor on public.audit_logs(actor_user_id);
create index idx_audit_action on public.audit_logs(action);
create index idx_audit_created on public.audit_logs(created_at desc);

-- ============================================================
-- 7. ATTENDANCE VERIFICATIONS
-- ============================================================

create table public.attendance_verifications (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  badge_id uuid references public.badges(id),
  year integer not null,
  verified_by uuid references auth.users(id),
  verified_at timestamptz default now(),
  participant_count integer default 0,
  source text default 'qr_school_scan',
  created_at timestamptz default now()
);

create index idx_attendance_school on public.attendance_verifications(school_id);
create index idx_attendance_year on public.attendance_verifications(year);

-- ============================================================
-- 8. ATTACHMENTS
-- ============================================================

create table public.attachments (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid references public.submissions(id) on delete cascade,
  submission_person_id uuid references public.submission_people(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size integer,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_attachments_submission on public.attachments(submission_id);
create index idx_attachments_person on public.attachments(submission_person_id);

-- ============================================================
-- 9. HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply trigger to tables with updated_at
create trigger set_updated_at before update on public.schools
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.school_profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.submissions
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.submission_people
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.school_badge_status
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 10. AUTO-CREATE PROFILE ON AUTH SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'school_user');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
