-- SEMAK: taburan peserta Keris Perak Siri 2 2026, mengikut sekolah
--
-- Hanya BACAAN.
--
-- Ini menentukan sama ada 12 kumpulan yang seimbang boleh dicapai langsung.
-- Sekolah ialah unit yang TIDAK dipecahkan, jadi saiz sekolah TERBESAR ialah
-- lantai bagi stesen terbesar. Kalau sekolah terbesar melebihi purata, jurang
-- itu tidak boleh dihapuskan tanpa memecahkan sekolah.

-- ============================================================
-- 1. Setiap sekolah, dan statusnya
-- ============================================================

select sc.name           as sekolah,
       sbs.status        as status_pendaftaran,
       count(*)          as peserta
  from public.submission_people sp
  join public.submissions s on s.id = sp.submission_id
  join public.badges  b     on b.id = s.badge_id
  join public.schools sc    on sc.id = s.school_id
  join public.school_badge_status sbs
    on sbs.school_id = s.school_id and sbs.badge_id = s.badge_id
   and sbs.year = s.submission_year and sbs.siri = sp.siri
 where b.name = 'Keris Perak'
   and s.submission_year = 2026
   and sp.siri = 2
   and sp.role in ('PESERTA', 'PENERIMA RAMBU')
   and sp.is_deleted = false
   and coalesce(sp.is_withdrawn, false) = false
 group by sc.name, sbs.status
 order by peserta desc;

-- ============================================================
-- 2. Bolehkah 12 kumpulan seimbang?
-- ============================================================
-- purata     = jumlah / 12
-- terbesar   = sekolah tunggal terbesar
--
-- Kalau terbesar > purata, stesen yang memuatkan sekolah itu MESTI lebih
-- besar daripada purata. Itu bukan pepijat; itu akibat "jangan pecahkan
-- sekolah" yang kau pilih.

with asas as (
  select sc.name as sekolah, count(*) as peserta
    from public.submission_people sp
    join public.submissions s on s.id = sp.submission_id
    join public.badges  b     on b.id = s.badge_id
    join public.schools sc    on sc.id = s.school_id
    join public.school_badge_status sbs
      on sbs.school_id = s.school_id and sbs.badge_id = s.badge_id
     and sbs.year = s.submission_year and sbs.siri = sp.siri
   where b.name = 'Keris Perak'
     and s.submission_year = 2026
     and sp.siri = 2
     and sbs.status = 'approved'
     and sp.role in ('PESERTA', 'PENERIMA RAMBU')
     and sp.is_deleted = false
     and coalesce(sp.is_withdrawn, false) = false
   group by sc.name
)
select count(*)                              as bil_sekolah,
       sum(peserta)                          as jumlah_peserta,
       round(sum(peserta) / 12.0, 1)         as purata_sekumpulan,
       max(peserta)                          as sekolah_terbesar,
       min(peserta)                          as sekolah_terkecil,
       (max(peserta) > sum(peserta) / 12.0)  as terbesar_melebihi_purata
  from asas;
