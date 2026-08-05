-- ============================================================
-- MIGRATION 025: Ciri "Siri" (Program Berperingkat)
-- ============================================================
-- Rujuk docs/rancangan-siri.md untuk konteks penuh.
--
-- - submission_people.siri: dimensi siri bagi setiap peserta (default 1).
--   Badge/program peserta kekal sama; siri hanya memisahkan paparan/statistik.
-- - program_settings.siri_enabled: toggle opsyenal per program + skop + tahun.
--   Bila tak aktif, UI siri disembunyikan terus dan semua peserta kekal Siri 1.
-- ============================================================

alter table public.submission_people
  add column if not exists siri smallint not null default 1 check (siri >= 1);

alter table public.program_settings
  add column if not exists siri_enabled boolean default false;

create index if not exists idx_submission_people_siri on public.submission_people(siri);

-- attendance_verifications.siri: benarkan satu pengesahan kehadiran berasingan bagi
-- setiap siri (sekolah boleh sahkan kehadiran Siri 1 & Siri 2 berasingan untuk program sama).
alter table public.attendance_verifications
  add column if not exists siri smallint not null default 1 check (siri >= 1);
