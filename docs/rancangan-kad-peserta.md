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
| 7b | **Peranan mana dapat kad** | Peserta sahaja, atau termasuk Pemimpin, Penolong Pemimpin dan Penguji? Mereka juga memakai lanyard, tetapi tidak pernah "tarik diri" |
| 7c | **Kaedah cetakan** | Cetakan pelayar (seperti `handlePrintAll` sekarang) atau jsPDF. Pelayar lebih mudah tetapi warna latar sering digugurkan oleh tetapan lalai pencetak — dan kad tanpa warna mengalahkan tujuan reka bentuk ikut program. jsPDF mengawal sepenuhnya tetapi setiap elemen perlu diletak secara manual |
| 7d | **Siri dalam muatan QR** | Muatan tidak membawa `siri`. Menambahnya selamat (pengimbas mengabaikan medan tambahan) dan berguna jika pengimbasan masa depan perlu membezakan siri. Tambah sekarang atau biarkan? |

---

## 8. Yang TIDAK termasuk

**Gambar peserta.** Sistem tidak menyimpan gambar, dan mengumpulkannya untuk ribuan peserta ialah projek berasingan yang jauh lebih besar daripada kad.

**Penjejakan cetakan.** Siapa mencetak dan bila tidak direkodkan. Kad boleh dicetak semula bila-bila; tiada nombor siri, tiada pembatalan.

**Kad untuk peserta belum disahkan.** Keputusan 2b.
