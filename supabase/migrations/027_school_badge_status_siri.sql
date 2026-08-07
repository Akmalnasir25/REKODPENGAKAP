-- ============================================================
-- MIGRATION 027: Dimensi "Siri" pada school_badge_status
-- ============================================================
-- Rujuk docs/rancangan-payment-online.md §7.3 untuk konteks penuh.
--
-- MASALAH
--   Setiap siri ialah pusingan pendaftaran berasingan — Siri 1 tutup cerita,
--   kemudian Siri 2 dibuka dengan peserta berlainan. Tetapi school_badge_status
--   berkunci (school_id, badge_id, year) TANPA siri, jadi sekolah yang sudah
--   menghantar Siri 1 terkunci daripada menghantar Siri 2 untuk program sama.
--
--   Migrasi 025 sudah melakukan perkara yang sama untuk attendance_verifications
--   ("benarkan satu pengesahan kehadiran berasingan bagi setiap siri").
--   Migrasi ini melanjutkan corak yang sama kepada status pendaftaran.
--
-- BAHAYA — BACA SEBELUM MENJALANKAN
--   Backfill seragam `siri = 1` adalah SALAH. Data sedia ada sudah mempunyai
--   sekolah dengan peserta Siri 2 (Keris Emas 2026). Dengan backfill seragam,
--   peserta tersebut akan mencari kunci pengesahan `<badge>_<year>_2` yang tidak
--   pernah dicipta, lalu HILANG dari statistik — senyap, tanpa ralat.
--
--   Sebab itu Langkah 3 dipacu data: ia mencari sendiri siri yang wujud dan
--   mencipta baris yang hilang, mewarisi status serta cap masa asal.
--
-- URUTAN PENTING
--   Kunci unik lama digugurkan SEBELUM backfill. Memasukkan baris siri=2 semasa
--   kekangan (school_id, badge_id, year) masih aktif akan melanggar kekangan itu.
--
-- ⚠ KESERENTAKAN DENGAN KOD
--   Migrasi ini memecahkan SEMBILAN operasi upsert yang menyebut
--   onConflict: 'school_id,badge_id,year'. Jangan pasang ke produksi tanpa
--   perubahan kod yang seiring dalam deploy yang sama:
--     services/supabaseApi.ts  — baris 372, 611, 655, 678, 888, 1122, 1220, 1243
--     supabase/functions/submit-registration/index.ts — baris 130
--   Serta pembinaan kunci lockedBadges/approvedBadges (supabaseApi.ts:170-177)
--   dan semakan kunci pengesahan (utils/dataProcessing.ts:64).
-- ============================================================


-- ============================================================
-- LANGKAH 1: Tambah lajur siri
-- ============================================================
-- Default 1 supaya setiap baris sedia ada menjadi "Siri 1" — betul untuk
-- majoriti, dan Langkah 3 membetulkan yang selebihnya.

alter table public.school_badge_status
  add column if not exists siri smallint not null default 1 check (siri >= 1);

create index if not exists idx_sbs_siri on public.school_badge_status(siri);


-- ============================================================
-- LANGKAH 2: Gugurkan kunci unik lama
-- ============================================================
-- Dicari melalui katalog dan bukan mengikut nama tetap, kerana kekangan ini
-- diisytiharkan sebaris dalam 001_schema.sql dan namanya dijana Postgres.
-- Padanan dibuat pada set lajur sebenar, jadi ia betul walau apa pun namanya.

do $$
declare
  v_conname text;
begin
  select con.conname
    into v_conname
  from pg_constraint con
  join pg_class     rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'school_badge_status'
    and con.contype = 'u'
    and (
      -- attname bertype `name`, jadi array_agg menghasilkan name[]. Postgres tidak
      -- membanding name[] dengan text[] secara automatik — cast eksplisit diperlukan.
      select array_agg(att.attname::text order by att.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum   = k.attnum
    ) = array['badge_id', 'school_id', 'year']::text[];

  if v_conname is null then
    raise notice '027: kunci unik lama tidak dijumpai — mungkin migrasi sudah dijalankan';
  else
    execute format('alter table public.school_badge_status drop constraint %I', v_conname);
    raise notice '027: kekangan % digugurkan', v_conname;
  end if;
end $$;


-- ============================================================
-- LANGKAH 3: Backfill dipacu data
-- ============================================================
-- Bagi setiap (sekolah, program, tahun) yang mempunyai peserta dalam siri > 1,
-- cipta baris school_badge_status untuk siri tersebut, mewarisi SEPENUHNYA
-- status dan cap masa daripada baris asal (yang kini siri = 1).
--
-- Mewarisi status adalah inti keselamatan migrasi ini: apa yang dikira dalam
-- statistik hari ini mesti kekal dikira selepas migrasi. Jika baris asal
-- 'approved', baris siri baharu juga 'approved' — peserta tidak bergerak.
--
-- Nota: is_deleted ditapis kerana rekod terpadam memang tidak dikira.
-- float_status TIDAK ditapis dengan sengaja — baris status tambahan yang tidak
-- diperlukan tidak memudaratkan, tetapi baris yang hilang akan melenyapkan data.

do $$
declare
  v_count integer;
begin
  with baris_baharu as (
    insert into public.school_badge_status (
      school_id, badge_id, year, siri,
      status, submitted_at, approved_at, approved_by, locked_at, notes,
      daerah_approved, daerah_approved_at, daerah_approved_by,
      created_at, updated_at
    )
    select distinct
      s.school_id, s.badge_id, s.submission_year, sp.siri,
      sbs.status, sbs.submitted_at, sbs.approved_at, sbs.approved_by,
      sbs.locked_at, sbs.notes,
      sbs.daerah_approved, sbs.daerah_approved_at, sbs.daerah_approved_by,
      sbs.created_at, now()
    from public.submission_people sp
    join public.submissions s
      on s.id = sp.submission_id
    join public.school_badge_status sbs
      on  sbs.school_id = s.school_id
      and sbs.badge_id  = s.badge_id
      and sbs.year      = s.submission_year
      and sbs.siri      = 1          -- baris asal, sebelum migrasi ini
    where sp.is_deleted = false
      and sp.siri > 1
      -- Kunci unik baharu belum wujud pada ketika ini (ditambah di Langkah 4),
      -- jadi tiada ON CONFLICT untuk bergantung. Semakan eksplisit ini yang
      -- menjadikan migrasi selamat dijalankan semula selepas kegagalan separuh.
      and not exists (
        select 1 from public.school_badge_status sedia
        where sedia.school_id = s.school_id
          and sedia.badge_id  = s.badge_id
          and sedia.year      = s.submission_year
          and sedia.siri      = sp.siri
      )
    returning 1
  )
  select count(*) into v_count from baris_baharu;

  raise notice '027: % baris siri tambahan dicipta', v_count;
end $$;


-- ============================================================
-- LANGKAH 4: Kunci unik baharu
-- ============================================================

-- Dibalut dalam DO kerana Postgres tiada ADD CONSTRAINT IF NOT EXISTS —
-- tanpa ini, menjalankan semula migrasi selepas kegagalan separuh akan gagal.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.school_badge_status'::regclass
      and conname  = 'school_badge_status_school_badge_year_siri_key'
  ) then
    alter table public.school_badge_status
      add constraint school_badge_status_school_badge_year_siri_key
      unique (school_id, badge_id, year, siri);
    raise notice '027: kunci unik baharu (school_id, badge_id, year, siri) ditambah';
  else
    raise notice '027: kunci unik baharu sudah wujud';
  end if;
end $$;

comment on column public.school_badge_status.siri is
  'Siri pendaftaran. Setiap siri ialah pusingan berasingan dengan kitaran '
  'hantar/sahkan/kunci tersendiri. Default 1 untuk program yang tidak '
  'mengaktifkan siri. Rujuk docs/rancangan-payment-online.md §7.3.';


-- ============================================================
-- PENGESAHAN SELEPAS MIGRASI
-- ============================================================
-- Jalankan SEBELUM migrasi untuk merekod garis dasar, kemudian SELEPAS untuk
-- membandingkan. Setiap angka mesti serupa. Satu perbezaan = gulung semula.
--
--   select b.name as program, s.submission_year as tahun, sp.siri,
--          count(*) as peserta
--   from submission_people sp
--   join submissions s on s.id = sp.submission_id
--   join badges      b on b.id = s.badge_id
--   where sp.is_deleted = false
--   group by b.name, s.submission_year, sp.siri
--   order by b.name, s.submission_year, sp.siri;
--
-- Semak juga baris yang dicipta oleh Langkah 3 kelihatan munasabah:
--
--   select sc.name as sekolah, b.name as program, sbs.year, sbs.siri, sbs.status
--   from school_badge_status sbs
--   join schools sc on sc.id = sbs.school_id
--   join badges  b  on b.id  = sbs.badge_id
--   where sbs.siri > 1
--   order by b.name, sc.name, sbs.siri;
-- ============================================================
