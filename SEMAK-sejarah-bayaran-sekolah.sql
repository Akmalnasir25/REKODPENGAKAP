-- SEMAK: sejarah pendaftaran dan bayaran bagi satu sekolah
--
-- Hanya BACAAN. Tiada apa-apa ditulis.
--
-- Tukar nama pada SATU tempat sahaja — baris 'SK SUNGAI ROKAM' di bawah —
-- untuk menggunakannya bagi sekolah lain. ilike dengan % di kedua-dua hujung,
-- jadi sebahagian nama sudah memadai.
--
-- Empat pertanyaan menjawab soalan yang berbeza:
--   1. Adakah sekolah ini wujud, dan di bawah daerah mana
--   2. Adakah mereka mendaftar sesiapa langsung
--   3. Adakah mereka pernah dibil, dan adakah wang pernah masuk
--   4. Di mana setiap pendaftaran berdiri sekarang


-- ============================================================
-- 1. Sekolah
-- ============================================================
-- Kalau ini kosong, nama itu tidak wujud dan ketiga-tiga pertanyaan lain
-- akan kosong juga atas sebab yang sama sekali berbeza.

select sc.id, sc.name, sc.school_code, sc.school_type, sc.is_active,
       d.name as daerah
  from public.schools sc
  left join public.daerah d on d.id = sc.daerah_id
 where sc.name ilike '%SUNGAI ROKAM%';


-- ============================================================
-- 2. Siapa yang didaftarkan
-- ============================================================

select b.name as program,
       s.submission_year as tahun,
       sp.siri,
       s.status as status_submission,
       count(*) filter (where sp.role in ('PESERTA', 'PENERIMA RAMBU')) as peserta,
       count(*) filter (where sp.role = 'PEMIMPIN')                     as pemimpin,
       count(*) filter (where sp.role = 'PENOLONG PEMIMPIN')            as penolong,
       count(*) filter (where sp.role = 'PEMBANTU')                     as pembantu,
       count(*) filter (where sp.role = 'PENGUJI')                      as penguji
  from public.submissions s
  join public.schools sc on sc.id = s.school_id
  join public.badges  b  on b.id  = s.badge_id
  join public.submission_people sp on sp.submission_id = s.id
 where sc.name ilike '%SUNGAI ROKAM%'
   and sp.is_deleted = false
   and coalesce(sp.is_withdrawn, false) = false
 group by b.name, s.submission_year, sp.siri, s.status
 order by s.submission_year desc, b.name, sp.siri;


-- ============================================================
-- 3. Setiap bil yang pernah dijana
-- ============================================================
-- Kosong bermakna sekolah ini TIDAK PERNAH sampai ke skrin bayaran —
-- bukan bahawa mereka gagal membayar.

select pb.id            as bil,
       pb.year, pb.siri,
       pb.method        as kaedah,
       pb.status        as status_bil,
       pb.total_amount  as jumlah,
       pb.reference_number as no_rujukan,
       pb.created_at,
       pb.paid_at,
       pb.confirmed_at,
       pb.expires_at,
       pb.rejected_reason,
       (select count(*) from public.attachments a
         where a.payment_id = pb.id and a.category = 'payment_proof') as bil_bukti
  from public.payment_bills pb
  join public.schools sc on sc.id = pb.school_id
 where sc.name ilike '%SUNGAI ROKAM%'
 order by pb.created_at desc;


-- ============================================================
-- 4. Keadaan pendaftaran sekarang
-- ============================================================

select b.name as program, sbs.year, sbs.siri,
       sbs.status, sbs.payment_status,
       sbs.submitted_at, sbs.approved_at
  from public.school_badge_status sbs
  join public.schools sc on sc.id = sbs.school_id
  join public.badges  b  on b.id  = sbs.badge_id
 where sc.name ilike '%SUNGAI ROKAM%'
 order by sbs.year desc, b.name, sbs.siri;
