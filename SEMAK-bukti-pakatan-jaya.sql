-- SEMAK: adakah SK PAKATAN JAYA memuat naik bukti bayaran?
--
-- Hanya BACAAN. Tiada apa-apa ditulis.
--
-- Bukti bayaran disimpan dalam public.attachments dengan
-- category = 'payment_proof', dan payment_id menunjuk kepada payment_bills
-- (BUKAN payments — lihat migrasi 042). Satu slip meliputi keseluruhan bil,
-- iaitu semua program dalam satu siri.


-- ============================================================
-- 1. Setiap bil, dengan bilangan bukti yang dilampirkan
-- ============================================================
-- Kalau bil berstatus 'pending_review' tetapi bil_bukti = 0, sekolah menekan
-- Hantar Bukti tanpa fail berjaya dimuat naik — itu keadaan yang mustahil
-- diselesaikan admin, dan perlu diketahui.

select sc.name                     as sekolah,
       pb.id                       as bil,
       pb.year, pb.siri,
       pb.method                   as kaedah,
       pb.status                   as status_bil,
       pb.total_amount             as jumlah,
       pb.reference_number         as no_rujukan,
       pb.created_at,
       pb.paid_at,
       pb.confirmed_at,
       pb.rejected_reason,
       count(a.id)                 as bil_bukti
  from public.payment_bills pb
  join public.schools sc on sc.id = pb.school_id
  left join public.attachments a
    on a.payment_id = pb.id and a.category = 'payment_proof'
 where sc.name ilike '%PAKATAN JAYA%'
 group by sc.name, pb.id, pb.year, pb.siri, pb.method, pb.status,
          pb.total_amount, pb.reference_number, pb.created_at,
          pb.paid_at, pb.confirmed_at, pb.rejected_reason
 order by pb.created_at desc;


-- ============================================================
-- 2. Fail bukti itu sendiri
-- ============================================================
-- Kosong bermakna tiada apa-apa dimuat naik.

select sc.name          as sekolah,
       pb.siri,
       pb.status        as status_bil,
       a.file_name,
       a.mime_type,
       a.file_size,
       a.created_at     as dimuat_naik,
       a.file_path
  from public.attachments a
  join public.payment_bills pb on pb.id = a.payment_id
  join public.schools sc on sc.id = pb.school_id
 where sc.name ilike '%PAKATAN JAYA%'
   and a.category = 'payment_proof'
 order by a.created_at desc;


-- ============================================================
-- 3. Keadaan pendaftaran sekolah itu
-- ============================================================

select b.name as program, sbs.year, sbs.siri, sbs.status, sbs.payment_status
  from public.school_badge_status sbs
  join public.schools sc on sc.id = sbs.school_id
  join public.badges  b  on b.id  = sbs.badge_id
 where sc.name ilike '%PAKATAN JAYA%'
   and sbs.payment_status <> 'not_required'
 order by b.name, sbs.siri;
