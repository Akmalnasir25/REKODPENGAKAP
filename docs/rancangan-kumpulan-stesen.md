# Rancangan: jadual kumpulan ujian stesen

**Status:** DITUTUP — §6 dijawab. Kod boleh ditulis.

**Tarikh:** 18 Ogos 2026

---

## 1. Permintaan

Bahagikan peserta kepada 12 kumpulan stesen untuk ujian. Mula dengan Keris
Perak Siri 2 2026.

## 2. Peraturan yang sudah ditetapkan

| Perkara | Keputusan |
|---|---|
| Bilangan kumpulan | 12 |
| Label | Bahagian A `1A`–`6A`, Bahagian B `1B`–`6B` |
| Sekolah dipecahkan? | **Tidak pernah.** Semua peserta satu sekolah duduk dalam satu stesen |
| Beberapa sekolah sestesen? | Ya |
| Sekolah lebih besar daripada purata | Terima ketidakseimbangan; jangan pecah |
| Kekal atau dikira semula? | **Disimpan.** Menambah peserta kemudian tidak mengocak semula stesen |
| Siapa dimasukkan | Peserta sahaja (PESERTA, PENERIMA RAMBU). Tiada pegawai |
| Status | `approved` sahaja |

## 3. Data sebenar (diambil 18 Ogos 2026)

Keris Perak Siri 2 2026, `approved`, peserta sahaja:

- **29 sekolah, 397 peserta**
- Sekolah terbesar **32** (SK Seri Ampang), terkecil 2
- Purata sekumpulan **33.1**

Sekolah terbesar berada di BAWAH purata, jadi 12 kumpulan seimbang boleh
dicapai tanpa memecahkan sesiapa. Itu bukan sesuatu yang boleh diandaikan —
kalau satu sekolah mempunyai 60 peserta, "jangan pecah" dan "seimbang" tidak
boleh dipenuhi serentak, dan agihan akan kelihatan pincang.

**Ada 8 sekolah lagi dengan 122 peserta berstatus `open`** — belum dihantar.
Ia dikecualikan atas keputusan di §2. Kalau mereka menghantar dan disahkan
kemudian, mereka perlu diselitkan ke dalam jadual yang sudah disimpan.

## 4. Algoritma

Ini masalah pembungkusan bekas: masukkan 29 item yang tidak boleh dipecah ke
dalam 12 bekas dengan jumlah sedekat mungkin.

Dua langkah:

1. **Longest Processing Time** — susun sekolah dari besar ke kecil, letak
   setiap satu ke dalam stesen yang paling kecil ketika itu. Cepat, dan
   memberi jurang 6 (31–37) pada data ini
2. **Carian tempatan** — cuba pindah atau tukar sekolah antara stesen
   terbesar dan terkecil selagi jurang mengecil. Ini menurunkan jurang
   kepada **2** (32–34)

Optimum teori ialah jurang 1 (sebelas stesen 33, satu stesen 34). Carian
tempatan berhenti pada 2, yang memadai — perbezaan seorang peserta antara
stesen tidak mengubah cara ujian dijalankan.

## 5. Agihan yang dikira

Julat 32–34. Tiada sekolah dipecahkan.

```
BAHAGIAN A — 202 peserta
  1A  34   SK Jati 18 · SK Sri Kinta 16
  2A  34   SK Chepor 18 · SK Pengkalan 13 · SR Islam Al Ummah 3
  3A  34   SK Marian Convent 16 · SK Pengkalan Pegoh 10 · SK Coronation Park 8
  4A  34   SK Sungai Rapat 15 · SK Tarcisian Convent 14 · SK Raja Dihilir Ekram 5
  5A  33   SJK(T) Chettiars 19 · SK Raja Chulan 14
  6A  33   SK Meru Raya 21 · SK Rapat Jaya 12

BAHAGIAN B — 195 peserta
  1B  33   SK Taman Bersatu 24 · SK Manjoi (Satu) 9
  2B  33   SK Pakatan Jaya 17 · SK Jln Panglima Bkt Gantang 8 · SK Dato' Ahmad Said Tmbhn 6 · SK Syed Idrus 2
  3B  33   SK La Salle 18 · SK Tasek 15
  4B  32   SK Seri Ampang 32
  5B  32   SK Seri Mutiara 18 · SK Rapat Setia 12 · SK Buntong 2
  6B  32   SK Cator Avenue 24 · SK Seri Kepayang 8
```

## 6. Soalan yang mesti ditutup

| # | Soalan | Keputusan |
|---|---|---|
| ~~**S1**~~ | ~~Kira dalam aplikasi atau masuk sekali?~~ | **Butang "Jana Kumpulan" dalam aplikasi.** Boleh diguna semula untuk mana-mana program, siri dan tahun |
| ~~**S2**~~ | ~~Boleh ubah manual?~~ | **Ya.** Algoritma memberi titik permulaan; admin melaras ikut keadaan sebenar |
| ~~**S3**~~ | ~~Dipaparkan di mana?~~ | **Tab admin dan muat turun PDF** |

## 7. Bentuk pelaksanaan

**Migrasi 061** — dua jadual:

- `station_group_runs` — satu baris per program x tahun x siri. Memegang
  bilangan kumpulan dan siapa menjananya
- `station_group_schools` — satu baris per sekolah, memaut sekolah kepada
  label stesen

Kekangan yang menguatkuasakan peraturan teras:

```sql
unique (run_id, school_id)
```

Itu menjadikan "sekolah tidak pernah dipecahkan" **mustahil dilanggar**, bukan
sekadar sesuatu yang algoritma cuba patuhi. Pelarasan manual yang tersilap pun
tidak boleh memecahkan sekolah.

`unique (badge_id, year, siri)` bermakna satu jadual aktif setiap program dan
siri. Menjana semula menggantikan yang lama, dan itu tindakan yang disengajakan
dengan amaran, bukan kejadian sampingan.

Bilangan peserta disimpan sebagai snapshot pada baris sekolah. Sebabnya sama
seperti snapshot bayaran: cetakan yang diedarkan mesti sepadan dengan apa yang
dilihat semasa ia dijana, walaupun seorang peserta ditarik balik selepas itu.

---

# Bahagian kedua: jadual penguji

**Tarikh:** 18 Ogos 2026

## 8. Permintaan

Jadual berasingan yang menyenaraikan penguji mengikut stesen. Setiap stesen
mempunyai **nama ujian** ("UJIAN KESETIAAN", "UJIAN IKATAN"), dan setiap baris
menunjukkan nama penguji, sekolahnya, serta dua lajur kosong — KEHADIRAN dan
CATATAN — untuk diisi tangan pada hari ujian.

## 9. Data sebenar (18 Ogos 2026)

Siri 2 2026, penguji diluluskan, merentas semua program:

- **65 baris, 54 orang unik, 5 program**
- Keris Perak **27** · Maju 15 · Jaya 9 · Kemahiran 8 · Keris Emas 6
- **8 orang** mendaftar sebagai penguji dalam lebih daripada satu program

Perlu diberi perhatian: 27 penguji untuk 12 stesen ialah kira-kira **2 setiap
stesen**, bukan 5 seperti dalam contoh. Contoh itu Keris Emas dengan 6 stesen.
Nisbah ini berbeza mengikut program dan tidak boleh ditetapkan dalam kod.

## 10. Keputusan

| # | Soalan | Keputusan |
|---|---|---|
| **P1** | Bagaimana penguji diletakkan? | **Jana seimbang, kemudian laras.** Sama seperti jadual peserta |
| **P2** | Penguji menguji sekolah sendiri? | **Biarkan.** Tiada kekangan. Dengan 2 penguji sestesen, kekangan itu selalunya mustahil dipenuhi |
| **P3** | Penguji dalam beberapa program? | **Satu jadual sahaja setiap siri.** Admin pilih program mana dia bertugas |

## 11. Bagaimana P3 dikuatkuasakan

Bukan dengan pemeriksaan dalam kod aplikasi — dengan kekangan:

```sql
unique (year, siri, person_ic)
```

Kekangan itu merentas SEMUA larian bagi siri itu, bukan satu larian sahaja.
Jadi memasukkan Cikgu X ke jadual Maju Siri 2 apabila dia sudah berada dalam
jadual Keris Perak Siri 2 akan ditolak oleh pangkalan data, tanpa mengira
skrin mana yang cuba melakukannya.

Itu sebabnya `year` dan `siri` disimpan pada baris penguji walaupun ia sudah
ada pada lariannya. Tanpa penyalinan itu, kekangan tidak dapat dinyatakan.

## 12. Stesen bernama

Nama ujian melekat pada stesen, bukan pada larian. Ia disimpan dalam jadual
berasingan supaya label yang tiada nama tetap berfungsi — nama ialah hiasan
pada cetakan, bukan syarat.

Nama berbeza mengikut program: Keris Emas mempunyai enam ujiannya sendiri,
Keris Perak dua belas. Kerana setiap larian sudah khusus kepada satu program,
tahun dan siri, itu terhasil dengan sendirinya.

**Migrasi 062.**
