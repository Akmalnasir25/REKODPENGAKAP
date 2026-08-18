-- 064 — kuota penguji setiap program
--
-- Rujuk docs/rancangan-kumpulan-stesen.md §14.
--
-- Kolam dikongsi (migrasi 063) tidak bermakna satu program menelan
-- keseluruhannya. Admin menetapkan berapa penguji program itu perlukan;
-- selebihnya kekal untuk program yang lain dalam siri yang sama.
--
-- Pemilihan siapa yang diambil dibuat di sebelah aplikasi, bukan di sini:
-- ia bergantung pada program sendiri dahulu, kemudian pinjaman. Yang perlu
-- disimpan hanyalah angkanya.

alter table public.station_group_runs
  add column if not exists penguji_diperlukan integer;

comment on column public.station_group_runs.penguji_diperlukan is
  'Berapa penguji program ini perlukan daripada kolam. NULL bermakna belum '
  'ditetapkan — pengagihan mengambil seluruh kolam yang ada.';

-- Sifar atau negatif bukan "belum ditetapkan"; ia angka yang tidak bermakna
-- dan hanya akan menghasilkan jadual kosong yang kelihatan seperti pepijat.
-- NULL ialah satu-satunya cara menyatakan "belum ditetapkan".
alter table public.station_group_runs
  drop constraint if exists station_group_runs_penguji_diperlukan_positif;

alter table public.station_group_runs
  add constraint station_group_runs_penguji_diperlukan_positif
  check (penguji_diperlukan is null or penguji_diperlukan > 0);
