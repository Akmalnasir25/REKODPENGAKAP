# RANCANGAN: Kad Peserta Auto-Jana

> Status: **Rancangan · belum implementasi** · Tarikh: 2026-08-10 · Skop: ScoutNadi
>
> ⚠ Tiada kod ditulis sehingga §7 tertutup sepenuhnya.

---

## 1. Apa yang SUDAH wujud

Ini bukan sistem baharu. Tiga daripada empat bahagiannya sudah berjalan dalam pengeluaran:

| Sudah ada | Di mana |
|---|---|
| Muatan QR peserta | `components/ui/QRVerification.tsx` → `buildQrPayload()` |
| Pengimbas yang menghuraikannya | `components/WithdrawalScanner.tsx` → `parseQR()` |
| Helaian cetakan QR | `QRVerification.tsx` → `handlePrintAll()`, 3 sebaris |
| Logo ikut skop | `hooks/useResolvedLogo(negeriCode, daerahCode)` |
| Penjana QR & PDF | `qrcode`, `jspdf` — sudah dalam kebergantungan |

Muatan semasa, tepat seperti pengimbas jangka:

```json
{ "v": "1", "type": "participant", "participantId": "...",
  "schoolCode": "...", "schoolName": "...", "badge": "...",
  "year": 2026, "name": "...", "icNumber": "..." }
```

**Muatan ini TIDAK boleh berubah bentuk.** `WithdrawalScanner.parseQR` menolak apa-apa yang tiada `type === 'participant'`, `participantId`, `schoolCode` dan `badge`. Kad yang membawa format lain tidak akan boleh diimbas untuk tarik diri — iaitu tujuan utama QR itu wujud.

**Yang tiada:** logo, warna ikut program, saiz lanyard, siri, dan pagar kelayakan.

---

## 1b. Prinsip penentu: muatan beku selepas dicetak

Kad ialah artifak **fizikal**. Sebaik seribu kad dilaminate dan digantung pada lanyard, muatan QR di dalamnya tidak boleh diubah — mengubahnya bermakna mencetak semula kesemuanya.

Itu menjadikan setiap keputusan medan sebagai keputusan **sekali sahaja**, dan ia mesti dibuat dengan kegunaan masa depan dalam kiraan, bukan hanya kegunaan hari ini.

Medan `v: '1'` dalam muatan ialah jalan keluar: pengimbas masa depan boleh menerima v1 dan v2 serentak. Tetapi kad v1 yang sudah dicetak kekal v1 selama-lamanya — jalan keluar itu melindungi *sistem*, bukan *kad*.

### Kegunaan masa depan yang sudah diketahui

Kad akan digunakan untuk **kehadiran**: pemimpin dan penolong pemimpin mengimbas masuk, kemudian mengimbas semula untuk log waktu keluar.

Ini bermakna dua perkara untuk rancangan ini:

**Semua peranan memerlukan kad**, bukan peserta sahaja. Pemimpin tidak pernah "tarik diri", tetapi mereka akan mengimbas untuk kehadiran.

**Sistem kehadiran sedia ada tidak mencukupi.** `QRVerification` menjana QR peringkat SEKOLAH dan `recordAttendanceVerification` merekod satu baris untuk keseluruhan kumpulan. Kehadiran per orang dengan waktu masuk dan keluar ialah kerja baharu — jadual peristiwa imbasan, dan pengimbas yang tahu sama ada imbasan itu masuk atau keluar.

Kerja itu **tidak perlu siap sebelum kad dicetak**. Yang perlu siap ialah muatan QR yang mencukupi untuknya, kerana muatan itulah yang beku.

---

## 2. Keputusan yang sudah dibuat

| # | Soalan | Keputusan |
|---|---|---|
| 2a | Isi QR | **Muatan sedia ada**, tidak diubah. Kad mesti boleh diimbas oleh pengimbas tarik diri yang sudah digunakan |
| 2b | Bila kad boleh dijana | **Selepas pendaftaran disahkan admin sahaja.** Sekolah dan admin kedua-duanya boleh cetak |
| 2c | Saiz | **54 × 86 mm menegak**, 8 sehelai A4 dengan garis potong |
| 2d | Warna ikut program | **Ditetapkan admin** dalam tetapan program; program tanpa pilihan mendapat warna neutral |

---

## 3. Kelayakan

Kad hanya untuk peserta yang **pendaftarannya sudah `approved`**.

Ini menggunakan semula pagar yang sudah ada dan bukan mencipta yang baharu: `school_badge_status.status = 'approved'` ialah pintu statistik, dan kad ialah bukti fizikal penyertaan. Kedua-duanya patut melalui pintu yang sama.

Akibatnya yang disengajakan: peserta yang belum dibayar tidak boleh mendapat kad, kerana bayaran ialah syarat pengesahan.

Peserta yang **sudah tarik diri** (`is_withdrawn`) dilangkau — mencetak kad untuk mereka mengundang kekeliruan di pintu masuk.

**Semua peranan mendapat kad** — Peserta, Pemimpin, Penolong Pemimpin dan Penguji. Pemimpin tidak pernah tarik diri, tetapi mereka mengimbas untuk kehadiran, dan lanyard tanpa kad mengalahkan tujuan keseluruhan sistem.

Peranan dipaparkan pada kad supaya pegawai di pintu masuk boleh membezakannya tanpa mengimbas.

---

## 4. Bentuk kad

```
┌─────────────────────────┐  54 mm
│   ▓▓▓ jalur warna ▓▓▓   │  ← warna program
│         [logo]          │  ← daerah atau negeri, ikut skop program
│                         │
│   NUR AISYAH BINTI      │  ← nama, dibalut 2 baris
│   RAHMAN                │
│                         │
│   Keris Perak · Siri 2  │  ← program + siri
│   SK Pengkalan          │  ← sekolah
│                         │
│      ┌─────────┐        │
│      │   QR    │        │  ← muatan sedia ada
│      └─────────┘        │
│   PPM Kinta Utara 2026  │
└─────────────────────────┘  86 mm
```

**Nama ialah elemen terbesar.** Kad lanyang dibaca dari jarak satu meter oleh orang yang mencari seseorang — bukan dibaca rapat. Segala yang lain kecil.

**Logo diselesaikan mengikut skop PROGRAM, bukan sekolah.** Program berskop daerah membawa logo daerah; program berskop negeri membawa logo negeri. `useResolvedLogo` sudah melakukan penyelesaian itu.

**Siri hanya dipaparkan bila program mengaktifkan siri.** Menulis "Siri 1" pada program yang tidak berperingkat hanyalah bunyi.

---

## 5. Warna ikut program

Lajur baharu pada `program_settings`:

```
card_color text  -- kunci palet, bukan hex
```

**Kunci palet, bukan nilai hex.** Menyimpan hex bermakna admin boleh memilih warna yang teksnya tidak terbaca, atau yang bertembung dengan warna status. Palet tertutup — lapan hingga sepuluh pilihan yang setiap satunya sudah disemak kontrasnya dalam cetakan hitam-putih dan berwarna.

Cadangan palet awal, dinamakan mengikut dunia pengakap dan bukan kod warna:

`gangsa · perak · emas · hutan · laut · nyala · senja · neutral`

Program tanpa pilihan mendapat `neutral`.

---

## 6. Di mana ia hidup

**Sekolah** — papan pemuka, pada program yang sudah disahkan. Butang menjana kad untuk pesertanya sendiri sahaja.

**Admin** — panel daerah/negeri, dengan penapis program, siri dan sekolah. Boleh menjana untuk satu sekolah atau semua sekolah sekaligus.

Kedua-duanya menghasilkan **PDF yang sama**. Satu penjana, bukan dua yang boleh menyimpang.

---

## 7. Jurang yang MESTI ditutup sebelum kod

| # | Jurang | Kenapa ia penting |
|---|---|---|
| 7a | **No. KP dalam QR** | Muatan sedia ada membawa `icNumber`. Sesiapa yang mengimbas kad di tanah perkhemahan boleh membacanya. Pengimbas tarik diri hanya memerlukan `participantId`, `schoolCode` dan `badge` — jadi `icNumber` boleh digugurkan dari kad tanpa memecahkan apa-apa. **Gugurkan atau kekalkan?** |
| 7b | ~~Peranan mana dapat kad~~ | **Ditutup.** Semua peranan — kehadiran memerlukannya |
| 7c | **Kaedah cetakan** | Cetakan pelayar (seperti `handlePrintAll` sekarang) atau jsPDF. Pelayar lebih mudah tetapi warna latar sering digugurkan oleh tetapan lalai pencetak — dan kad tanpa warna mengalahkan tujuan reka bentuk ikut program. jsPDF mengawal sepenuhnya tetapi setiap elemen perlu diletak secara manual |
| 7d | **Siri dalam muatan QR** | Muatan tidak membawa `siri`. Kehadiran masa depan hampir pasti memerlukannya — perkhemahan Siri 2 tidak sepatutnya menerima kad Siri 1. Menambahnya selamat: pengimbas sedia ada mengabaikan medan tambahan. Memandangkan muatan beku selepas dicetak, **cenderung tambah sekarang** |
| 7e | **`role` dalam muatan QR** | Kehadiran mungkin perlu membezakan pemimpin daripada peserta tanpa memanggil pangkalan data. Medan yang sama beku selepas dicetak — tambah sekarang atau bergantung pada carian? |

---

## 8. Yang TIDAK termasuk

**Gambar peserta.** Sistem tidak menyimpan gambar, dan mengumpulkannya untuk ribuan peserta ialah projek berasingan yang jauh lebih besar daripada kad.

**Penjejakan cetakan.** Siapa mencetak dan bila tidak direkodkan. Kad boleh dicetak semula bila-bila; tiada nombor siri, tiada pembatalan.

**Sistem kehadiran per orang.** Jadual peristiwa imbasan, waktu masuk dan keluar, dan pengimbas yang mengetahui arah — kerja berasingan. Rancangan ini hanya memastikan muatan QR mencukupi untuknya.

**Kad untuk peserta belum disahkan.** Keputusan 2b.
