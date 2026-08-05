-- ============================================================
-- MIGRATION 026: Had Bilangan Siri per Program
-- ============================================================
-- program_settings.max_siri: bilangan siri maksimum yang dibenarkan untuk
-- program+skop+tahun berkenaan (cth Keris Emas 2026 = 3 siri sahaja).
-- Dropdown siri di seluruh app dijana ikut nombor ini (bukan lagi tetap 1-5).
-- ============================================================

alter table public.program_settings
  add column if not exists max_siri smallint not null default 5 check (max_siri >= 1 and max_siri <= 20);
