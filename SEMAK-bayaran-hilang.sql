-- SEMAK: pendaftaran yang wangnya diterima tetapi payment_status bukan 'paid'
--
-- Hanya BACAAN. Tiada apa-apa ditulis.
--
-- Latar: sekolah membayar, admin mengesahkan, admin menolak semula pendaftaran
-- kerana ada nama tertinggal. Selepas guru menghantar semula, pengesahan gagal
-- dengan "Pendaftaran ini belum dibayar (status: not_required)".
--
-- 'not_required' hanya ditulis di SATU tempat dalam keseluruhan sistem:
-- create-payment-bill baris 415, laluan `terusHantar`. Soalan yang tiga
-- pertanyaan di bawah menjawab ialah: adakah baris bayaran itu masih ada, dan
-- kalau ada, kenapa gelung pembilan tidak nampak ia sudah dibayar.


-- ============================================================
-- 1. Baris rosak: ada wang, tetapi status tidak mengatakannya
-- ============================================================
-- Ini senarai kerja. Setiap baris di sini ialah sekolah yang tidak boleh
-- disahkan walaupun sudah membayar.

select sc.name                as sekolah,
       sc.code                as kod,
       b.name                 as program,
       sbs.year,
       sbs.siri,
       sbs.status,
       sbs.payment_status     as status_bayaran_sbs,
       count(p.id)            as bil_baris_bayaran,
       string_agg(distinct p.status, ', ')          as status_bayaran_sebenar,
       sum(coalesce(p.snapshot_peserta, 0))         as snap_peserta,
       sum(coalesce(p.snapshot_pemimpin, 0))        as snap_pemimpin,
       sum(coalesce(p.snapshot_penolong, 0))        as snap_penolong,
       sum(coalesce(p.snapshot_pembantu, 0))        as snap_pembantu,
       sum(coalesce(p.amount, 0))                   as jumlah_rm
  from public.school_badge_status sbs
  join public.schools sc on sc.id = sbs.school_id
  join public.badges  b  on b.id  = sbs.badge_id
  join public.payments p
    on p.school_id = sbs.school_id
   and p.badge_id  = sbs.badge_id
   and p.year      = sbs.year
   and p.siri      = sbs.siri
   and p.status in ('paid', 'pending_review')
 where sbs.payment_status is distinct from 'paid'
 group by sc.name, sc.code, b.name, sbs.year, sbs.siri, sbs.status, sbs.payment_status
 order by sc.name, b.name, sbs.siri;


-- ============================================================
-- 2. Bayaran yatim: wang diterima, tiada baris status yang sepadan
-- ============================================================
-- Kalau baris bayaran mempunyai badge_id, siri atau year yang berlainan
-- daripada baris status, pertanyaan (1) tidak akan nampaknya langsung — dan
-- gelung pembilan juga tidak, kerana ia memadan pada empat kunci yang sama.
-- Itulah sebab paling mungkin `dilindungi` kosong walaupun wang sudah masuk.

select sc.name           as sekolah,
       b.name            as program,
       p.year,
       p.siri,
       p.status          as status_bayaran,
       p.amount,
       p.paid_at,
       p.snapshot_peserta, p.snapshot_pemimpin,
       p.snapshot_penolong, p.snapshot_pembantu,
       (select sbs.status || ' / ' || sbs.payment_status
          from public.school_badge_status sbs
         where sbs.school_id = p.school_id
           and sbs.badge_id  = p.badge_id
           and sbs.year      = p.year
           and sbs.siri      = p.siri)  as baris_status_sepadan
  from public.payments p
  join public.schools sc on sc.id = p.school_id
  left join public.badges b on b.id = p.badge_id
 where p.status in ('paid', 'pending_review')
   and not exists (
     select 1 from public.school_badge_status sbs
      where sbs.school_id = p.school_id
        and sbs.badge_id  = p.badge_id
        and sbs.year      = p.year
        and sbs.siri      = p.siri
        and sbs.payment_status = 'paid'
   )
 order by p.paid_at desc nulls last
 limit 50;


-- ============================================================
-- 3. Garis masa bil bagi sekolah yang muncul dalam (1)
-- ============================================================
-- audit_logs tiada lajur school_id, jadi jejaknya diambil daripada bil dan
-- bayaran itu sendiri. Urutan yang dicari: bil dibayar → pendaftaran ditolak →
-- guru hantar semula → payment_status jatuh ke 'not_required'.

with rosak as (
  select distinct sbs.school_id
    from public.school_badge_status sbs
    join public.payments p
      on p.school_id = sbs.school_id and p.badge_id = sbs.badge_id
     and p.year = sbs.year and p.siri = sbs.siri
     and p.status in ('paid', 'pending_review')
   where sbs.payment_status is distinct from 'paid'
)
select sc.name          as sekolah,
       pb.created_at,
       pb.siri,
       pb.status        as status_bil,
       pb.amount        as jumlah_bil,
       pb.paid_at,
       pb.expires_at,
       left(coalesce(pb.notes, ''), 120) as nota
  from public.payment_bills pb
  join rosak r on r.school_id = pb.school_id
  join public.schools sc on sc.id = pb.school_id
 order by sc.name, pb.created_at desc
 limit 100;
