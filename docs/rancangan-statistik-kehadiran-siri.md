# Rancangan: Statistik Kehadiran Mengikut Program — penapis siri

**Status:** DITUTUP — G1, G2, G3 dijawab (ikut cadangan). Kod ditulis selepas ini.

**Tarikh:** 19 Ogos 2026

---

## 1. Laporan

Pada tab **Kehadiran → Statistik Kehadiran Mengikut Program**: pilih program,
pilih siri, tiada data muncul — walhal sudah ada sekolah yang diimbas. Dan
sebaik siri dipilih, medan **Penapis Siri** itu sendiri hilang.

Berlaku pada Panel Daerah dan Panel Negeri — kedua-duanya salinan logik yang
sama (`AdminDaerahPanel.tsx:126-166`, `AdminNegeriPanel.tsx:128-166`).

## 2. Punca — penapis tersembunyi tetapi masih hidup

Tiga baris ini bergabung menjadi perangkap:

| Baris | Kelakuan |
|---|---|
| `AdminDaerahPanel.tsx:126-130` | Senarai siri dibina daripada **rekod imbasan** yang sudah dimuat |
| `:720` | Dropdown siri hanya dipapar bila `availableAttendanceSiris.length > 1` |
| `:710` | `selectedAttendanceSiri` di-reset **hanya** bila program bertukar |

Urutan yang mematikan skrin:

1. Tab dibuka. Belum ada program dipilih, jadi rekod yang dimuat ialah
   **semua program** dalam daerah — mengandungi Siri 1 dan Siri 2. Dropdown
   siri dipapar.
2. Pengguna pilih program. `loadAttendanceRecords` dimuat semula secara
   **tak segerak** (`:83-93`), jadi buat seketika dropdown masih memaparkan
   siri daripada data lama.
3. Pengguna pilih **Siri 2**.
4. Muatan selesai. Rekod bagi program itu hanya ada Siri 1 → senarai siri
   menjadi `[1]` → **dropdown hilang**, tetapi `selectedAttendanceSiri`
   kekal `2`.
5. `attendanceRecordsFiltered` (`:132-135`) menapis semuanya keluar →
   Dah Scan 0, Jumlah Peserta 0, senarai kosong. Tiada cara memulihkannya
   selain menukar program, kerana kawalan untuk mengosongkannya sudah tiada
   di skrin.

Gejala yang dilaporkan — "pilih siri → data hilang → medan siri hilang" —
padan tepat dengan urutan ini.

## 3. Punca kedua — senarai siri datang daripada sumber yang salah

Senarai siri dibina daripada apa yang **sudah diimbas**, bukan daripada siri
yang **wujud** bagi program itu. Akibatnya:

- Siri 2 yang belum ada sebarang imbasan **tiada dalam senarai langsung**.
  Maka mustahil membuka senarai "Belum Scan" bagi Siri 2 — iaitu justru
  senarai yang paling diperlukan pada pagi pertama Siri 2.
- Program berperingkat yang baru bermula (kosong) tidak menunjukkan penapis
  siri sama sekali, jadi angka yang dipapar ialah campuran semua siri tanpa
  memberitahu sesiapa.

## 4. Punca ketiga — penyebut tidak mengenal siri

`registeredSchools` (`:96-119`) menanya `school_badge_status` dengan
`badge_id` + `year` + status sahaja — **tanpa `siri`**, sedangkan lajur itu
wujud sejak migrasi 027 dan setiap siri ialah barisnya sendiri.

Dua kesan:

- Sekolah yang mendaftar program sama dalam dua siri menghasilkan **dua
  baris**, jadi `total` mengira sekolah itu dua kali dan peratus kemajuan
  jatuh separuh.
- Bila penapis Siri 2 dipilih, senarai "Belum Scan" masih memasukkan sekolah
  yang hanya mendaftar Siri 1 — sekolah itu dilabel "belum hadir" untuk siri
  yang ia memang tidak sertai.

Nota berkaitan: status yang diterima ialah `submitted`, `approved`, `locked`,
`reopened`, sedangkan imbasan QR hanya merekod yang `approved`
(migrasi 066). Sekolah `submitted` kekal dalam "Belum Scan" selama-lamanya
kerana ia memang tidak boleh diimbas. Perlu diputuskan sama ada penyebut
patut `approved` sahaja.

## 5. Punca keempat — padanan rekod ambil yang pertama

`AdminDaerahPanel.tsx:811` mencari rekod sekolah dengan `.find()` pada kod
sekolah sahaja. Sekolah yang diimbas dalam dua siri mempunyai dua rekod;
mod "Semua Siri" memaparkan bilangan peserta dan waktu daripada rekod
pertama sahaja, senyap.

## 6. Soalan yang perlu ditutup

| # | Soalan | Cadangan |
|---|---|---|
| **G1** ✅ | Senarai siri dalam penapis diambil dari mana? | Daripada **pendaftaran** (`school_badge_status.siri` bagi program itu), digabung dengan siri yang ada dalam rekod imbasan. Siri yang wujud tetapi kosong tetap boleh dipilih |
| **G2** ✅ | Penapis dipapar bila? | **Sentiasa** apabila program itu berperingkat (`siri_enabled`) atau mempunyai lebih daripada satu siri berdaftar. Bukan bergantung pada apa yang sudah diimbas |
| **G3** ✅ | Penyebut "Belum Scan" | Ikut siri dipilih. Mod "Semua Siri" mengira **sekolah unik**, bukan baris sekolah×siri. Status penyebut: `approved` sahaja, selari dengan apa yang QR boleh rekod |

Tambahan yang tidak memerlukan keputusan (pembetulan terus):

- Kosongkan `selectedAttendanceSiri` secara automatik apabila nilainya tiada
  lagi dalam senarai pilihan — supaya penapis tersembunyi tidak boleh
  mengosongkan skrin.
- Padankan rekod imbasan mengikut **kod sekolah + siri**, bukan kod sahaja.
- Kedua-dua panel (Daerah dan Negeri) dibetulkan serentak; logiknya sama
  perkataan demi perkataan.

## 7. Pengesahan — SELESAI

Panel **"Senarai Scan Hari Ini"** (`:873`) memaparkan rekod mentah tanpa
menapis siri. Ia **ada isi** sementara statistik di atasnya kosong:

```
SK PENGKALAN — Keris Perak (Siri 2) | 13 peserta | 09:54 PTG
SK PENGKALAN — Keris Emas  (Siri 2) | 23 peserta | 09:54 PTG
```

Maka §2 disahkan sebagai punca. Rekod sampai ke pangkalan data dan lulus
tapisan daerah; hanya paparan statistik yang menapisnya keluar. Tiada kerja
pemulihan data diperlukan.

Bukti sokongan: sebelum sebarang program dipilih, penapis siri **dipapar** —
bermakna rekod tahun ini mengandungi Siri 1 dan Siri 2. Sebaik program yang
rekodnya Siri 2 sahaja dipilih, senarai mengecut kepada satu, dropdown
lenyap, dan pilihan siri terdahulu tersangkut tanpa kawalan untuk
mengosongkannya — tepat seperti urutan §2.

## 8. Apa yang dilaksanakan

Kedua-dua panel diubah serentak dan seiras: `AdminDaerahPanel.tsx` dan
`AdminNegeriPanel.tsx`.

1. **Penapis tersembunyi dimatikan.** `useEffect` baharu mengosongkan
   `selectedAttendanceSiri` sebaik nilainya tiada dalam senarai pilihan.
   Skrin tidak boleh lagi ditapis sifar oleh kawalan yang tidak kelihatan.
2. **Senarai siri daripada pendaftaran + rekod imbasan** (G1), bukan rekod
   sahaja. Siri yang belum diimbas kini boleh dipilih.
3. **Penapis dipapar untuk setiap program berperingkat** (G2), melalui
   `siriEnabled` dalam `program_settings` — bukan bergantung pada jumlah siri
   yang kebetulan sudah wujud dalam rekod.
4. **Penyebut mengikut siri** (G3). `school_badge_status` kini ditanya dengan
   lajur `siri` dan ditapis mengikut siri dipilih. Mod "Semua Siri" menyahdua
   mengikut kod sekolah, jadi sekolah dua siri dikira sekali.
5. **Status penyebut `approved` sahaja.** Selain menyelaraskannya dengan apa
   yang QR sanggup rekod, ini membuang kesan sampingan `locked`: penguncian
   badge secara pukal (`supabaseApi.ts:1869-1878`) mencipta baris `locked`
   untuk **setiap sekolah aktif**, jadi senarai "Belum Scan" dahulunya boleh
   menyenaraikan sekolah yang langsung tidak mendaftar program itu.
6. **Padanan rekod mengikut semua rekod sekolah**, bukan `.find()` pertama.
   Sekolah yang diimbas dalam dua siri memaparkan jumlah campuran dan label
   "Siri 1, 2", dengan waktu imbasan terakhir.

Disahkan: `npm run build` lulus (15.66s). `tsc --noEmit` mengekalkan ralat
sedia ada projek sahaja — tiada yang baharu daripada perubahan ini.
