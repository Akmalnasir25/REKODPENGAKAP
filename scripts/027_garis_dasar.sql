-- ============================================================
-- GARIS DASAR & PENGESAHAN untuk MIGRASI 027
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §7.3.
--
-- APA YANG DIUKUR
--   Migrasi 027 hanya boleh merosakkan data melalui SATU mekanisme: cara
--   peserta dipadankan dengan baris pengesahannya.
--
--     SEBELUM : padan pada (sekolah, program, tahun)          — siri diabaikan
--     SELEPAS : padan pada (sekolah, program, tahun, SIRI)
--
--   Sebelum migrasi, SEMUA peserta sesebuah sekolah untuk program+tahun itu
--   berkongsi satu baris pengesahan. Selepas migrasi, setiap peserta mesti
--   menemui baris siri mereka SENDIRI. Jika backfill terlepas satu baris,
--   peserta siri tersebut jatuh keluar daripada kiraan "disahkan" — senyap.
--
--   Skrip ini merakam kiraan mengikut semantik LAMA, kemudian membandingkannya
--   dengan kiraan mengikut semantik BARU. Kedua-duanya mesti serupa.
--
-- CARA GUNA
--   LANGKAH 1  jalankan SEBELUM migrasi 027
--   LANGKAH 2  jalankan SELEPAS migrasi 027       ← senarai kosong = LULUS
--   LANGKAH 3  jalankan selepas semuanya disahkan (kemas)
-- ============================================================


-- ============================================================
-- LANGKAH 0 — Garis dasar BACA-SAHAJA (untuk aliran Supabase Branching)
-- ============================================================
-- Gunakan INI, bukan Langkah 1, apabila menguji melalui cawangan Supabase.
--
-- Sebabnya urutan: Supabase menjalankan migrasi secara automatik sebaik
-- cawangan dicipta, jadi 027 sudah berjalan sebelum sempat merakam apa-apa
-- di sana. Garis dasar mesti diambil dari PRODUKSI terlebih dahulu — dan
-- kerana produksi tidak sepatutnya disentuh, ini SELECT tulen tanpa jadual.
--
-- Simpan outputnya. Selepas cawangan siap, jalankan Langkah 2b-cawangan
-- di sana dan bandingkan kedua-dua senarai.

select
  b.name              as program,
  s.submission_year   as tahun,
  sp.siri,
  count(*) filter (where sbs.status = 'approved') as peserta_disahkan,
  count(*)                                        as peserta_semua
from public.submission_people sp
join public.submissions s on s.id = sp.submission_id
join public.badges b      on b.id = s.badge_id
-- SEMANTIK LAMA: padanan TANPA siri
left join public.school_badge_status sbs
  on  sbs.school_id = s.school_id
  and sbs.badge_id  = s.badge_id
  and sbs.year      = s.submission_year
where sp.is_deleted = false
  and coalesce(sp.float_status, '') not in ('floated', 'transferred')
group by b.name, s.submission_year, sp.siri
order by b.name, s.submission_year, sp.siri;


-- ============================================================
-- LANGKAH 2b-cawangan — jalankan pada CAWANGAN selepas migrasi
-- ============================================================
-- Struktur output sama seperti Langkah 0. Bandingkan baris demi baris;
-- setiap angka mesti serupa.
--
--   select b.name as program, s.submission_year as tahun, sp.siri,
--          count(*) filter (where sbs.status = 'approved') as peserta_disahkan,
--          count(*)                                        as peserta_semua
--   from public.submission_people sp
--   join public.submissions s on s.id = sp.submission_id
--   join public.badges b      on b.id = s.badge_id
--   left join public.school_badge_status sbs
--     on  sbs.school_id = s.school_id
--     and sbs.badge_id  = s.badge_id
--     and sbs.year      = s.submission_year
--     and sbs.siri      = sp.siri          -- <<< SEMANTIK BARU
--   where sp.is_deleted = false
--     and coalesce(sp.float_status, '') not in ('floated', 'transferred')
--   group by b.name, s.submission_year, sp.siri
--   order by b.name, s.submission_year, sp.siri;


-- ============================================================
-- LANGKAH 1 — Rakam garis dasar (SEBELUM migrasi, aliran satu-pangkalan-data)
-- ============================================================
-- Gunakan ini HANYA jika memasang terus ke pangkalan data yang sama.
-- Untuk aliran cawangan, guna Langkah 0 di atas.
-- Jadual biasa, bukan TEMP, kerana ia mesti bertahan merentas sesi
-- dan merentas migrasi itu sendiri.

create table if not exists public._migrasi_027_garis_dasar (
  program           text,
  tahun             integer,
  siri              smallint,
  peserta_disahkan  integer,
  peserta_semua     integer,
  dirakam_pada      timestamptz default now()
);

truncate public._migrasi_027_garis_dasar;

insert into public._migrasi_027_garis_dasar (program, tahun, siri, peserta_disahkan, peserta_semua)
select
  b.name,
  s.submission_year,
  sp.siri,
  count(*) filter (where sbs.status = 'approved'),
  count(*)
from public.submission_people sp
join public.submissions s
  on s.id = sp.submission_id
join public.badges b
  on b.id = s.badge_id
-- SEMANTIK LAMA: padanan TANPA siri
left join public.school_badge_status sbs
  on  sbs.school_id = s.school_id
  and sbs.badge_id  = s.badge_id
  and sbs.year      = s.submission_year
where sp.is_deleted = false
  -- Selaras dengan fetchCloudData. coalesce diperlukan kerana NOT IN dengan
  -- NULL menghasilkan NULL, yang akan menyingkirkan baris secara senyap.
  and coalesce(sp.float_status, '') not in ('floated', 'transferred')
group by b.name, s.submission_year, sp.siri;

-- Papar apa yang dirakam — simpan hasil ini untuk rujukan mata kasar
select program, tahun, siri, peserta_disahkan, peserta_semua
from public._migrasi_027_garis_dasar
order by program, tahun, siri;


-- ============================================================
-- LANGKAH 2 — Bandingkan (SELEPAS migrasi)
-- ============================================================
-- SENARAI KOSONG = LULUS. Sebarang baris yang keluar bermakna kiraan berubah,
-- dan migrasi patut DIGULUNG SEMULA.

with selepas as (
  select
    b.name              as program,
    s.submission_year   as tahun,
    sp.siri             as siri,
    count(*) filter (where sbs.status = 'approved') as peserta_disahkan,
    count(*)                                        as peserta_semua
  from public.submission_people sp
  join public.submissions s
    on s.id = sp.submission_id
  join public.badges b
    on b.id = s.badge_id
  -- SEMANTIK BARU: padanan TERMASUK siri
  left join public.school_badge_status sbs
    on  sbs.school_id = s.school_id
    and sbs.badge_id  = s.badge_id
    and sbs.year      = s.submission_year
    and sbs.siri      = sp.siri
  where sp.is_deleted = false
    and coalesce(sp.float_status, '') not in ('floated', 'transferred')
  group by b.name, s.submission_year, sp.siri
)
select
  coalesce(g.program, n.program)  as program,
  coalesce(g.tahun,   n.tahun)    as tahun,
  coalesce(g.siri,    n.siri)     as siri,
  g.peserta_disahkan              as disahkan_sebelum,
  n.peserta_disahkan              as disahkan_selepas,
  coalesce(n.peserta_disahkan, 0) - coalesce(g.peserta_disahkan, 0) as beza,
  case
    when g.program is null then 'BARIS BAHARU muncul selepas migrasi'
    when n.program is null then 'BARIS HILANG selepas migrasi'
    when coalesce(n.peserta_disahkan, 0) < coalesce(g.peserta_disahkan, 0)
      then 'PESERTA HILANG — backfill terlepas baris siri'
    else 'Kiraan bertambah — siasat sebelum teruskan'
  end as diagnosis
from public._migrasi_027_garis_dasar g
full outer join selepas n
  on  n.program = g.program
  and n.tahun   = g.tahun
  and n.siri    = g.siri
where coalesce(g.peserta_disahkan, -1) is distinct from coalesce(n.peserta_disahkan, -1)
   or coalesce(g.peserta_semua,    -1) is distinct from coalesce(n.peserta_semua,    -1)
order by 1, 2, 3;


-- ============================================================
-- LANGKAH 2b — Semak baris yang dicipta oleh backfill
-- ============================================================
-- Pemeriksaan mata kasar: baris ini sepatutnya mewarisi status yang SAMA
-- dengan baris Siri 1 sekolah tersebut.

select
  sc.name    as sekolah,
  b.name     as program,
  sbs.year   as tahun,
  sbs.siri,
  sbs.status,
  sbs.approved_at
from public.school_badge_status sbs
join public.schools sc on sc.id = sbs.school_id
join public.badges  b  on b.id  = sbs.badge_id
where sbs.siri > 1
order by b.name, sc.name, sbs.siri;


-- ============================================================
-- LANGKAH 3 — Kemas (selepas migrasi disahkan LULUS)
-- ============================================================
-- drop table if exists public._migrasi_027_garis_dasar;
