# Rancangan: QR sekolah digabungkan mengikut siri

**Status:** DITUTUP — G1 dan G2 dijawab. Kod ditulis selepas ini.

**Tarikh:** 19 Ogos 2026

---

## 1. Permintaan

Satu sekolah yang menyertai beberapa program dalam satu siri diimbas
**sekali sahaja**. Skrin imbasan memecahkan datanya mengikut program dan
menunjukkan jumlah campuran.

## 2. Berapa besar masalahnya

Kiraan sebenar 2026, pendaftaran diluluskan:

| Siri | 1 program | 2 program | 3 program atau lebih |
|---|---|---|---|
| 1 | 33 sekolah | 24 | 0 |
| 2 | 35 sekolah | 10 | 8 |

Kira-kira 40% sekolah turun daripada dua atau tiga imbasan kepada satu.

## 3. QR sedia ada mengabaikan siri sepenuhnya

Ini yang paling penting, dan ia bukan sebahagian daripada permintaan.

`SchoolQRGenerator` mengumpulkan mengikut `sekolah | program` — **tiada
siri**. Muatannya (v3) juga tiada siri. Tetapi `attendance_verifications`
mempunyai lajur `siri`, dan `recordAttendanceVerification` menulis
`record.siri || 1`.

Maknanya setiap imbasan QR sekolah hari ini direkodkan sebagai **Siri 1**,
walau apa pun siri sebenarnya. Sekolah yang menyertai program yang sama
dalam dua siri hanya boleh disahkan sekali; imbasan kedua ditolak sebagai
pendua.

Menggabungkan mengikut siri membetulkan ini dengan sendirinya, kerana siri
menjadi sebahagian daripada muatan.

## 4. Kiraan sedia ada mengira semua orang

`participants` dalam kumpulan itu ialah setiap baris sekolah tersebut —
peserta, pemimpin, penolong, pembantu, penguji. Kad tercetak berkata
"36 peserta" sedangkan 36 itu termasuk guru.

Skrin imbasan baharu memaparkan **peserta dan pegawai berasingan**.
`participant_count` yang disimpan kekal jumlah semua orang, supaya lajur itu
bermakna perkara yang sama seperti setiap baris sejarah di dalamnya. Kalau
maksud lajur itu patut berubah, itu kerja berasingan yang menyentuh data
lama, bukan diselitkan di sini.

## 5. Keputusan

| # | Soalan | Keputusan |
|---|---|---|
| **G1** | Satu imbasan menandakan semua program, atau petugas pilih? | **Semua sekaligus.** Satu tekan, kehadiran ditulis untuk setiap program sekolah itu dalam siri tersebut |
| **G2** | QR membawa data atau penunjuk? | **Penunjuk sahaja.** `{ v:4, schoolCode, schoolName, year, siri }`. Senarai program dicari semasa imbasan |

### Akibat G1 yang mesti diterima

Kalau dua program dalam satu siri berjalan pada **hari berlainan**, satu
imbasan merekod kehadiran untuk hari yang belum berlaku. Sistem tidak
menyimpan tarikh acara di mana-mana, jadi ia tidak dapat menghalang perkara
itu — ia bergantung sepenuhnya pada program satu siri berjalan serentak.

Kalau itu berubah, tukar kepada versi tanda-dahulu; skrin imbasan sudah
memaparkan senarai program, jadi ia menambah kotak tick, bukan menulis
semula.

### Akibat G2 yang mesti diterima

Imbasan **memerlukan talian**. QR tidak lagi membawa jawapannya sendiri.
Sebagai pertukaran, program yang didaftar selepas kad dicetak tetap muncul,
dan itulah sebenarnya tujuan menggabungkan mengikut siri: kad tidak perlu
dicetak semula setiap kali sekolah menambah program.

## 6. QR v3 mesti terus berfungsi

Kad v3 sudah dicetak dan berada di tangan sekolah. Penghurai menerima
kedua-duanya: v3 dibaca seperti sebelum ini (satu program, tanpa siri,
direkod sebagai Siri 1), v4 mengikut laluan baharu. Tiada kad menjadi tidak
sah kerana perubahan ini.

## 7. Pendua

Satu program yang sudah disahkan **tidak menggagalkan** keseluruhan imbasan.
Ia dilangkau dan dinamakan pada skrin. Sekolah tiga program yang satu
daripadanya sudah diimbas semalam masih boleh disahkan untuk dua yang lain
dalam satu tekan.

## 8. Program mana yang dikira

Hanya pendaftaran `approved`. Pendaftaran yang masih `open` atau `reopened`
belum disahkan admin; merekod kehadirannya bermakna mengesahkan sesuatu yang
belum wujud secara rasmi.

## 9. Bentuk kerja

- **Migrasi 066** — `kehadiran_sekolah_siri(kod_sekolah, tahun, siri)`,
  `security definer`, hanya admin. Memulangkan satu baris per program:
  nama, bilangan peserta, bilangan pegawai, dan bila ia sudah disahkan
- **Muatan v4** dalam `SchoolQRGenerator`, dikumpulkan mengikut sekolah dan
  siri, bukan sekolah dan program
- **Skrin imbasan** — pecahan program, jumlah campuran, satu butang
- **Penulisan kehadiran** — satu baris `attendance_verifications` per
  program, dalam satu tindakan
