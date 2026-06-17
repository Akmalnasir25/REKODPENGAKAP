-- ============================================================
-- MIGRATION 024: Jenis Baju + Perluas Pilihan Saiz
-- ============================================================
-- - Tambah shirt_type (Kolar / Round Neck Lengan Pendek / Lengan Panjang / Muslimah)
-- - Buang sekatan saiz lama (XS-4XL) supaya boleh simpan saiz budak (24-32)
--   dan saiz dewasa hingga 8XL. Validasi pilihan dikawal di frontend.
-- ============================================================

alter table public.submission_people
  add column if not exists shirt_type text;

alter table public.submission_people
  drop constraint if exists submission_people_shirt_size_check;
