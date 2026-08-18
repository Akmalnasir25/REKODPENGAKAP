# Rancangan: kad peserta dengan QR kekal

**Status:** DITUTUP — §6 dijawab. Kod boleh ditulis apabila diminta.

**Tarikh:** 18 Ogos 2026

---

## 1. Permintaan

Kad fizikal untuk setiap peserta: nama, nama sekolah, logo, dan satu QR.

Bila QR diimbas, ia menunjukkan nama peserta, umur, sekolah, dan **setiap
program yang pernah dia sertai**. Peserta menyimpan kad yang sama; tahun depan
dia menyertai program lain, membawa kad yang sama, dan imbasan menunjukkan
program baharu itu telah bertambah.

## 2. Ini bukan lanjutan QR sedia ada — ia bertentangan dengannya

Sistem sudah mempunyai dua penjana QR dalam `components/ui/QRVerification.tsx`:
`SchoolQRGenerator` dan `ParticipantQRGenerator`. Kedua-duanya sudah tersedia
kepada admin **dan** sekolah (`UserDashboard.tsx:2007`).

Tetapi QR itu bekerja dengan cara yang bertentangan dengan apa yang diminta.
Muatannya ialah **JSON lengkap yang dibenamkan ke dalam QR itu sendiri**
(`QRVerification.tsx:40-53`):

```ts
const payload: SchoolQRData = {
  v: 3, schoolCode, schoolName, badge, year,
  totalParticipants: group.participants.length,
  generatedAt: new Date().toISOString(), ref,
};
return JSON.stringify(payload);
```

Itu **gambar snapshot**, dibekukan pada saat QR dijana. Ia tidak boleh berubah,
kerana datanya berada dalam corak hitam-putih itu sendiri. Mencetak semula
adalah satu-satunya cara mengemas kininya.

Yang diminta ialah kebalikannya: QR yang mengandungi **penunjuk sahaja**, dan
data sebenar dicari semasa imbasan. Itulah satu-satunya cara program tahun
depan boleh muncul pada kad yang dicetak tahun ini.

Jadi ini komponen ketiga yang baharu, bukan suntingan kepada dua yang sedia
ada. Kedua-dua yang lama kekal untuk kegunaan masing-masing.

## 3. Masalah identiti

Tiada jadual `participants` dalam sistem ini. Seorang pelajar wujud sebagai
banyak baris `submission_people` — satu bagi setiap program, setiap tahun.
Tiada apa yang mengikat baris itu bersama kecuali nombor IC.

Kad kekal memerlukan pengenal yang kekal. Tiga pilihan:

| Pilihan | Kelebihan | Masalah |
|---|---|---|
| QR mengandungi nombor IC | Tiada jadual baharu | Sesiapa yang mengimbas kad memperoleh nombor IC seorang kanak-kanak |
| QR mengandungi cincangan IC | Tiada jadual baharu, IC tidak terdedah | IC boleh diteka semula daripada cincangan — ruang nombor IC kecil |
| QR mengandungi token legap, jadual pemetaan baharu | Tiada apa boleh dibaca daripada QR itu sendiri | Perlu satu jadual dan satu migrasi |

Cadangan: **token legap**. Nombor IC kanak-kanak tidak sepatutnya boleh dibaca
daripada sekeping kad yang jatuh di padang perkhemahan.

## 4. Masalah privasi — ini yang paling penting

Kad ini akan hilang. Kad sentiasa hilang.

Kalau imbasan membuka halaman awam, sesiapa yang menjumpai kad itu — atau
sesiapa yang memotret kad seorang kanak-kanak dari jauh — memperoleh **nama,
umur, sekolah, dan sejarah penyertaan** seorang kanak-kanak. Nama sekolah dan
umur bersama-sama memberitahu orang asing di mana kanak-kanak itu berada pada
waktu pagi.

Ini bukan kebimbangan teori; ia sebab utama sistem seperti ini ditarik balik.

Tiga aras yang mungkin:

1. **Awam sepenuhnya** — sesiapa mengimbas, nampak semuanya. Mudah, dan aku
   tidak syorkan
2. **Awam tetapi minimum** — imbasan menunjukkan nama pertama dan senarai
   program sahaja. Tiada umur, tiada nama sekolah. Cukup untuk mengesahkan
   "kad ini sah dan inilah lencananya"
3. **Perlu log masuk** — imbasan membuka skrin yang memerlukan akaun sekolah
   atau admin. Butiran penuh, tetapi hanya kepada orang yang sudah dipercayai
   dengan data itu

## 5. "Program yang disertai" bermaksud apa

Dua takrifan wujud dalam sistem, dan ia memberi jawapan berbeza:

- **Pendaftaran diluluskan** — `school_badge_status.status = 'approved'`.
  Bermakna sekolah mendaftarkannya dan admin mengesahkan
- **Kehadiran disahkan** — jadual `attendance_verifications`. Bermakna seseorang
  benar-benar mengimbas dan mengesahkan kehadiran pada hari program

Kad yang berkata "program yang dihadiri" sedangkan ia menyenaraikan pendaftaran
akan berbohong tentang mana-mana peserta yang mendaftar tetapi tidak hadir.

Perlu diberi perhatian: `attendance_verifications` merekod `participant_count`
bagi satu sekolah, **bukan** kehadiran individu. Jadi kehadiran per orang tidak
wujud dalam sistem hari ini. Kalau kad mesti menunjukkan kehadiran sebenar, itu
kerja tambahan yang besar dan berasingan.

## 6. Soalan yang mesti ditutup

| # | Soalan | Keputusan |
|---|---|---|
| ~~**Q1**~~ | ~~Siapa boleh melihat hasil imbasan?~~ | **AWAM SEPENUHNYA.** Nama penuh, umur, sekolah, semua program. Lihat §4b untuk apa yang ini bermakna dan apa yang tetap dibina untuk mengehadkan kesannya |
| ~~**Q2**~~ | ~~Pendaftaran atau kehadiran?~~ | **Pendaftaran diluluskan** (`school_badge_status = 'approved'`). Data sudah wujud dan tepat |
| ~~**Q3**~~ | ~~Siapa mencetak?~~ | **Admin sahaja** |
| ~~**Q4**~~ | ~~Peserta tanpa IC lengkap?~~ | **DITUTUP dengan andaian:** kad hanya dijana untuk peserta yang mempunyai IC 12 digit penuh. Yang lain disenaraikan sebagai laporan untuk sekolah betulkan. Tanpa pengenal stabil, kad mereka tidak boleh dipadankan tahun depan — jadi mencetaknya hanya mencipta kad yang rosak senyap. Beritahu kalau kau mahu sebaliknya |

## 4b. Keputusan Q1 dan apa yang tetap dibina

Kau pilih awam sepenuhnya. Itu keputusan kau dan aku bina mengikutnya.

Yang perlu direkodkan dengan jelas: sesiapa yang memegang kad itu, atau
mempunyai gambarnya, boleh melihat nama penuh, umur dan sekolah seorang
kanak-kanak. Kad yang jatuh di padang perkhemahan memberikan maklumat itu
kepada sesiapa yang menjumpainya.

Tiga perkara tetap dibina, kerana ia tidak mengurangkan kegunaan langsung:

- **Token 22 aksara rawak**, bukan nombor berjujukan dan bukan berdasarkan IC.
  Bermakna tiada sesiapa boleh meneka token atau mengembara dari satu kad ke
  kad lain. Hanya orang yang benar-benar memegang kad itu boleh melihat
  pemiliknya — dan itu memang niat kad ini
- **Nombor IC tidak pernah muncul** dalam QR mahupun pada halaman imbasan.
  Ia kekal sebagai kunci dalaman sahaja
- **Token boleh dibatalkan.** Kalau kad hilang dan sekolah melaporkannya, admin
  menjana token baharu dan yang lama berhenti berfungsi. Tanpa ini, kad yang
  hilang kekal hidup selama-lamanya

Kalau kau mahu menukar Q1 kemudian, aras butiran hidup dalam SATU fungsi
carian. Menukarnya daripada penuh kepada minimum ialah suntingan satu fungsi,
bukan tulis semula.

## 7. Bentuk kerja selepas soalan ditutup

Anggaran kasar, supaya kau tahu saiznya:

- **Migrasi** — jadual `participant_cards` (token, ic_number, dicipta bila),
  dengan indeks unik pada IC supaya satu orang = satu kad
- **Fungsi carian** — `security definer`, menerima token, memulangkan nama,
  umur, sekolah, dan senarai program. Aras butiran bergantung pada Q1
- **Halaman imbasan** — laluan baharu yang menerima token dari URL QR
- **Penjana kad** — PDF cetakan, beberapa kad sehalaman, dengan logo
- **Pengimbas** — `jsqr` sudah digunakan dalam `WithdrawalScanner`; boleh diguna
  semula

Migrasi seterusnya ialah **058**.
