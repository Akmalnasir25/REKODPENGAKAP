-- SEMAK: SMK TAMBUN · Maju · 2026 · Siri 2 — peranan mana yang bertambah,
--        dan adakah peranan itu dicaj
--
-- Hanya BACAAN. Tiada apa-apa ditulis.
--
-- Uji kering menunjukkan dilindungi_penuh = false: bilangan orang hari ini
-- melebihi snapshot bil RM510 yang sudah dibayar, sekurang-kurangnya pada satu
-- peranan. Yang belum diketahui ialah peranan mana, dan berapa yuran peranan
-- itu. Kalau yuran peranan itu NULL, sekolah tidak berhutang sesen pun dan
-- pengawal liputan dalam skrip pemulihan terlalu ketat.
--
-- Ini juga menerangkan bagaimana laluan RM0 dimasuki: baki bukan sifar (jadi
-- pintu "sudah dibayar" di baris 312 terlepas) tetapi jumlahnya tetap RM0
-- (kerana yuran peranan itu NULL), jadi ia jatuh ke `terusHantar` di baris 339
-- dan menulis ganti 'paid' dengan 'not_required'.

with sasaran as (
  select sbs.school_id, sbs.badge_id, sbs.year, sbs.siri, sc.school_type
    from public.school_badge_status sbs
    join public.schools sc on sc.id = sbs.school_id
    join public.badges  b  on b.id  = sbs.badge_id
   where sc.name = 'SMK TAMBUN' and b.name = 'Maju'
     and sbs.year = 2026 and sbs.siri = 2
),
kini as (
  select count(*) filter (where sp.role in ('PESERTA', 'PENERIMA RAMBU')) as peserta,
         count(*) filter (where sp.role = 'PEMIMPIN')                     as pemimpin,
         count(*) filter (where sp.role = 'PENOLONG PEMIMPIN')            as penolong,
         count(*) filter (where sp.role = 'PEMBANTU')                     as pembantu,
         count(*) filter (where sp.role = 'PENGUJI')                      as penguji
    from sasaran t
    join public.submissions s
      on s.school_id = t.school_id and s.badge_id = t.badge_id
     and s.submission_year = t.year
    join public.submission_people sp on sp.submission_id = s.id
   where sp.siri::int = t.siri
     and sp.is_deleted = false
     and coalesce(sp.is_withdrawn, false) = false
),
liputan as (
  select sum(coalesce(p.snapshot_peserta,  0)) as peserta,
         sum(coalesce(p.snapshot_pemimpin, 0)) as pemimpin,
         sum(coalesce(p.snapshot_penolong, 0)) as penolong,
         sum(coalesce(p.snapshot_pembantu, 0)) as pembantu
    from sasaran t
    join public.payments p
      on p.school_id = t.school_id and p.badge_id = t.badge_id
     and p.year = t.year and p.siri = t.siri
   where p.status = 'paid'
),
yuran as (
  select f.*
    from sasaran t
    cross join lateral public.resolve_program_fees(
      public.resolve_program_setting(t.school_id, t.badge_id, t.year),
      t.siri::smallint,
      coalesce(t.school_type, 'lain')
    ) f
)
select 'PESERTA'  as peranan, k.peserta  as kini, l.peserta  as diliputi,
       k.peserta - l.peserta as beza, y.fee_peserta as yuran_seorang,
       case when y.fee_peserta is null then 'tidak dicaj'
            else 'dicaj' end as caj
  from kini k, liputan l, yuran y
union all
select 'PEMIMPIN', k.pemimpin, l.pemimpin, k.pemimpin - l.pemimpin, y.fee_pemimpin,
       case when y.fee_pemimpin is null then 'tidak dicaj' else 'dicaj' end
  from kini k, liputan l, yuran y
union all
select 'PENOLONG PEMIMPIN', k.penolong, l.penolong, k.penolong - l.penolong, y.fee_penolong,
       case when y.fee_penolong is null then 'tidak dicaj' else 'dicaj' end
  from kini k, liputan l, yuran y
union all
select 'PEMBANTU', k.pembantu, l.pembantu, k.pembantu - l.pembantu, y.fee_pembantu,
       case when y.fee_pembantu is null then 'tidak dicaj' else 'dicaj' end
  from kini k, liputan l, yuran y
union all
select 'PENGUJI', k.penguji, 0, k.penguji, null,
       'tiada lajur yuran'
  from kini k;
