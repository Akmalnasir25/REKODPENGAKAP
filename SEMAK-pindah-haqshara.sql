-- SEMAK: pindah HAQSHARA RANEA BT KARTIGEN — Kemahiran -> Jaya
--
-- Hanya BACAAN. Tiada apa-apa ditulis.
--
-- Memindahkan seorang peserta antara program bukan satu baris sahaja. Ia
-- menyentuh empat perkara, dan ketiga-tiga pertanyaan di bawah menyemaknya:
--
--   1. Baris orang itu sendiri — siri mana, submission mana
--   2. Adakah SMK CONVENT sudah ada baris submissions untuk Jaya tahun itu.
--      Kalau tiada, ia perlu dicipta; peserta tidak boleh menggantung
--   3. Status pendaftaran kedua-dua program. Kalau Kemahiran sudah 'approved',
--      mengeluarkan orang daripadanya menukar statistik yang sudah disahkan
--   4. Bayaran. Kalau Kemahiran sudah dibayar untuk orang ini dan Jaya
--      mewajibkan bayaran, memindahkannya memindahkan hutang juga


-- ============================================================
-- 1. Orang itu
-- ============================================================

select sp.id            as person_id,
       sp.name, sp.ic_number, sp.membership_id,
       sp.role, sp.category, sp.unit, sp.siri,
       b.name           as program,
       s.submission_year, s.id as submission_id, s.status as status_submission,
       sc.name          as sekolah
  from public.submission_people sp
  join public.submissions s on s.id = sp.submission_id
  join public.badges  b     on b.id = s.badge_id
  join public.schools sc    on sc.id = s.school_id
 where sp.ic_number like '%110922%'
    or upper(sp.name) like '%HAQSHARA%';


-- ============================================================
-- 2. Submission Jaya bagi sekolah itu
-- ============================================================
-- Kosong bermakna ia perlu dicipta semasa pemindahan.

select s.id as submission_id, b.name as program, s.submission_year,
       s.status,
       count(sp.id) filter (where sp.is_deleted = false) as bil_orang
  from public.submissions s
  join public.badges  b  on b.id = s.badge_id
  join public.schools sc on sc.id = s.school_id
  left join public.submission_people sp on sp.submission_id = s.id
 where sc.name = 'SMK CONVENT'
   and b.name in ('Jaya', 'Kemahiran')
 group by s.id, b.name, s.submission_year, s.status
 order by b.name, s.submission_year;


-- ============================================================
-- 3. Status pendaftaran & bayaran kedua-dua program
-- ============================================================

select b.name as program, sbs.year, sbs.siri, sbs.status, sbs.payment_status,
       ps.default_category, ps.fee_peserta,
       public.siri_payment_required(ps.id, sbs.siri::smallint) as perlu_bayar
  from public.school_badge_status sbs
  join public.schools sc on sc.id = sbs.school_id
  join public.badges  b  on b.id  = sbs.badge_id
  left join public.program_settings ps
    on ps.badge_id = sbs.badge_id and ps.year = sbs.year
 where sc.name = 'SMK CONVENT'
   and b.name in ('Jaya', 'Kemahiran')
 order by b.name, sbs.siri;


-- ============================================================
-- 4. Baki tempat Siri 2
-- ============================================================
-- baki_tempat_siri(tahun, siri) memulangkan satu baris per program, jadi ia
-- dipanggil sekali dan ditapis — bukan per baris status.

select * from public.baki_tempat_siri(2026, 2::smallint)
 where badge_name in ('Jaya', 'Kemahiran');
