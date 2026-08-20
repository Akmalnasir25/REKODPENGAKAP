# Rancangan: Statistik Kehadiran — siri dahulu, kemudian program

**Status:** DITUTUP — G1, G2, G3 dijawab (ikut cadangan). Kod ditulis selepas ini.

**Tarikh:** 20 Ogos 2026

Susulan kepada [rancangan-statistik-kehadiran-siri.md](rancangan-statistik-kehadiran-siri.md),
yang membetulkan penapis rosak tetapi mengekalkan aliran lama.

---

## 1. Permintaan

Aliran sepatutnya:

1. Pilih **siri** dahulu.
2. Kemudian pilih **program yang ada dalam siri itu** — atau **semua program**
   dalam siri tersebut sekaligus.
3. Boleh ditapis lagi mengikut **SR / SM**.
4. Kalau program itu tiada siri, pilih program terus.

## 2. Kenapa aliran sekarang menyusahkan

Sekarang program dipilih dahulu, dan penapis siri hanya muncul selepas itu —
sebagai penapis kecil di bawahnya. Tiga akibat:

- **Terbalik daripada cara petugas berfikir.** Di meja pendaftaran, yang
  diketahui dahulu ialah *hari ini Siri 2*. Program ialah pecahan di dalamnya,
  bukan sebaliknya.
- **Tiada pandangan seluruh siri.** Satu imbasan QR v4 mengesahkan **semua**
  program sekolah itu dalam siri berkenaan (migrasi 066). Tetapi skrin hanya
  boleh memaparkan satu program pada satu masa, jadi untuk melihat kesan satu
  imbasan petugas terpaksa menukar program satu per satu. Data ditulis
  serentak; paparannya sahaja yang berpecah.
- **Siri tersembunyi di dalam program.** Senarai siri dikira selepas program
  dipilih, jadi soalan "berapa sekolah Siri 2 belum sampai?" tidak boleh
  dijawab tanpa memeriksa setiap program satu-satu dan menjumlahkannya
  sendiri.

## 3. Aliran baharu

Tiga kawalan berturutan di atas statistik:

```
[ Siri 1 | Siri 2 | Siri 3 ]          ← disembunyikan jika hanya satu siri wujud
[ Program: Semua Program (3) ▾ ]      ← hanya program yang ada dalam siri itu
[ Jenis:  Semua | SR | SM ]
```

- **Siri** — daripada siri yang benar-benar mempunyai pendaftaran diluluskan
  dalam skop admin (daerah atau negeri), tahun semasa.
- **Program** — hanya badge yang mempunyai pendaftaran diluluskan dalam siri
  yang dipilih, ditambah pilihan pertama **"Semua Program"**.
- **Jenis** — `schools.school_type` (`rendah` / `menengah`), migrasi 031.
  Menapis penyebut dan kedua-dua senarai serentak.

## 4. Apa yang berubah pada pemuatan data

Hari ini `registeredSchools` dimuat bagi **satu badge** sahaja
(`AdminDaerahPanel.tsx:96-124`). Aliran baharu memerlukannya bagi **semua
badge dalam skop**, ditapis mengikut siri:

```
school_badge_status
  .eq(year, tahun semasa)
  .eq(status, 'approved')
  .eq(siri, siri dipilih)
  .in(badge_id, badge dalam skop admin)
  .select(school_id, badge_id, siri,
          school:school_id(id, name, school_code, school_type, daerah, negeri))
```

Hasil pertanyaan ini melakukan tiga kerja sekaligus: ia **penyebut**, ia
**senarai program** bagi siri itu, dan ia membawa **jenis sekolah** untuk
penapis SR/SM. Rekod imbasan dimuat sekali bagi seluruh skop (tanpa tapisan
badge) dan dipadankan di frontend.

Kos: satu pertanyaan lebih besar setiap kali siri bertukar, bukan setiap kali
program bertukar. Menukar program selepas itu ialah kerja frontend semata —
lebih pantas daripada sekarang.

## 5. Soalan yang perlu ditutup

| # | Soalan | Cadangan |
|---|---|---|
| **G1** ✅ | Dalam mod "Semua Program", bagaimana sekolah yang menyertai dua program dikira apabila baru satu disahkan? | **Tiga kumpulan: Penuh / Sebahagian / Belum.** Baris = sekolah, dengan lencana kecil setiap programnya (hijau = sudah, kelabu = belum). Petugas nampak terus sekolah yang tersangkut separuh |
| **G2** ✅ | Pemilih siri apabila hanya satu siri wujud | **Sembunyikan** — terus ke pemilih program, sama seperti sekarang. Skrin tidak menunjukkan pilihan yang tiada makna |
| **G3** ✅ | Sekolah berjenis `lain` (tiada SR/SM) | Muncul dalam **"Semua" sahaja**. Butang hanya tiga: Semua / SR / SM. Kiraan "Semua" sentiasa jumlah penuh |

## 6. Yang tidak berubah

- Cara imbasan bekerja. Migrasi 066 dan muatan QR v4 tidak disentuh.
- Panel "Senarai Scan Hari Ini" — ia sengaja mentah, dan ia yang mengesahkan
  punca pepijat semalam.
## 7. Satu komponen, bukan dua salinan

Sehingga kini logik ini wujud dua kali — `AdminDaerahPanel.tsx` dan
`AdminNegeriPanel.tsx` memegang salinan yang hampir sama perkataan demi
perkataan. Itulah sebabnya setiap pepijat semalam perlu dibetulkan dua kali,
dan sebabnya ia boleh menyimpang tanpa disedari.

Logik baharu ini lebih besar daripada yang lama (tiga kawalan, tiga kumpulan
status, penapis jenis sekolah). Menyalinnya dua kali menjamin ia menyimpang.
Ia diekstrak menjadi satu komponen kongsi, dengan skop diberi melalui prop:

- `components/ui/StatistikKehadiranProgram.tsx`
- Daerah menghantar `daerahCode`; Negeri menghantar `negeriCode` dan
  `tunjukDaerah` supaya barisnya memaparkan kod daerah.

Kesan sampingan yang ikut terbetul: kawalan "Siri untuk scan seterusnya"
mengambil had siri daripada program yang dipilih dalam **bahagian
statistik** — dua bahagian skrin yang tiada kaitan, terikat melalui satu
pemboleh ubah. Had itu kini diambil daripada tetapan program dalam skop.

## 8. Apa yang dilaksanakan

Komponen baharu `components/ui/StatistikKehadiranProgram.tsx`, dipanggil oleh
kedua-dua panel dengan skop melalui prop.

**Aliran:** Siri → Program → Jenis sekolah.

- Siri dipapar sebagai butang, disembunyikan bila hanya satu siri wujud (G2).
  Siri lalai ialah siri **imbasan terbaru** (rekod tiba disusun `verified_at`
  menurun); sebelum sebarang imbasan, siri tertinggi yang ada pendaftaran.
- Program menyenaraikan hanya badge yang ada pendaftaran diluluskan dalam
  siri itu, dengan **"Semua Program"** sebagai pilihan lalai.
- Jenis: Semua / SR / SM, dengan kiraan sekolah pada butangnya. Sekolah
  `lain` muncul dalam "Semua" sahaja (G3).

**Tiga kumpulan** (G1): Dah Scan Penuh / Sebahagian Sahaja / Belum Scan.
Setiap baris sekolah membawa lencana setiap programnya — hijau bertanda ✓
bila sudah disahkan, kelabu bila belum — dan nisbah `sah/jumlah` di
hujungnya. Bila satu program tertentu dipilih, setiap sekolah hanya ada satu
program, jadi kumpulan "Sebahagian" kosong dengan sendirinya dan
disembunyikan.

**Pemuatan data:** satu pertanyaan `school_badge_status` bagi seluruh skop
(tahun semasa, `approved`, badge dalam skop) memberi penyebut, senarai
program setiap siri, dan jenis sekolah sekaligus. Rekod kehadiran juga dimuat
sekali bagi seluruh skop — `getAttendanceVerifications` tidak lagi dipanggil
semula setiap kali program bertukar. Menukar siri, program atau jenis kini
kerja frontend semata.

**Dibuang daripada kedua-dua panel:** `registeredSchools`,
`selectedAttendanceBadgeId`, `selectedAttendanceSiri`,
`availableAttendanceSiris`, `attendanceRecordsFiltered`, `attendanceStats`
dan JSX statistiknya — kira-kira 180 baris salinan berkembar.

Disahkan: `npm run build` lulus. `tsc --noEmit` mengekalkan dua ralat sedia
ada projek (perbandingan tab `'floated'` dalam kedua-dua panel) — tiada yang
baharu.
