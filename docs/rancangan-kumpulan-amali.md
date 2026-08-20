# Rancangan: jadual kumpulan ujian amali (ikatan)

**Status:** DILAKSANAKAN — migrasi 069, modul `PracticalGroupsTab`.

**Tarikh:** 20 Ogos 2026

---

## 1. Permintaan

Senarai kumpulan ujian amali ikatan untuk peserta Keris Emas. Lapan orang
sekumpulan. Satu sekolah satu kumpulan; kalau tidak cukup atau terlebih,
bergabung dengan sekolah lain.

Bentuk cetakan yang diminta:

```
KUMPULAN 1 — SJK(T) CHETTIARS (8 orang)
BIL  NAMA PESERTA              SERAYA  SILANG  TUNGKU  CATATAN
1    DESHNA KUMARES
2    EMANUELRAJ A/L MELVIN SELVARAJ
...
```

## 2. Kenapa ini BUKAN kumpulan stesen

Modul `StationGroupsTab` (migrasi 061) sudah membahagikan peserta kepada
kumpulan. Ia tidak boleh digunakan semula di sini kerana andaian terasnya
bertentangan:

| Perkara | Kumpulan stesen (061) | Kumpulan amali (069) |
|---|---|---|
| Unit agihan | **Sekolah** | **Orang** |
| Sekolah dipecahkan? | Tidak pernah | **Ya, mesti** |
| Saiz kumpulan | ~33, seimbang | **Tepat 8** |
| Baris disimpan | Satu per sekolah | Satu per **orang** |
| Cetakan | Senarai rujukan | **Borang kerja** dengan petak tanda |

Had lapan orang datang daripada penguji: seorang penguji ikatan hanya boleh
memerhati lapan peserta serentak. Sekolah 20 orang MESTI dipecahkan. Kerana
itu jadual ini menyimpan baris seorang, bukan baris sekolah — nama peserta
muncul pada borang, jadi ia perlu wujud dalam pangkalan data.

## 3. Peraturan yang ditetapkan

| Perkara | Keputusan |
|---|---|
| Saiz kumpulan | 8 (boleh ubah 2–20) |
| Sekolah dipecahkan? | Ya, selepas memberi semua kumpulan penuhnya |
| Baki sekolah | Digabungkan menjadi kumpulan **CAMPUR** |
| Peserta PPKI | Diasingkan ke kumpulan sendiri (boleh dimatikan) |
| Lajur ikatan | **Kosong** — penguji tanda pada hari ujian |
| Siapa dimasukkan | `PESERTA` dan `PENERIMA RAMBU` sahaja, tiada pegawai |
| Status | `approved` sahaja |
| Kekal atau dikira semula? | **Disimpan**, sama seperti 061 |

## 4. Algoritma

Tiga fasa, dalam `bahagikanPeserta`:

1. **Kumpulan penuh setiap sekolah.** Sekolah 20 orang memberi dua kumpulan 8,
   tinggal baki 4. Sekolah disusun mengikut abjad supaya jana semula memberi
   hasil yang sama.
2. **Padatkan baki menjadi CAMPUR.** Setiap baki sekolah ialah satu blok
   (1–7 orang). Bakul semasa mengambil blok **utuh terbesar** yang masih muat;
   hanya apabila tiada blok utuh yang muat, blok terbesar dipecahkan untuk
   menghabiskan ruang.
3. **PPKI di hujung**, melalui fasa 1 dan 2 yang sama atas kolamnya sendiri.

Fasa 2 ialah bahagian yang penting. Menghiris senarai baki secara berturutan
juga memberi padatan ketat, tetapi memecahkan sekolah setiap kali ia melintasi
sempadan bakul. Memilih blok utuh terbesar dahulu mengelakkan kebanyakan
pecahan itu tanpa membazir tempat:

Ambil baki `P=7, Q=5, R=4, S=3, T=1` dengan saiz 8:

| | Hirisan berturutan | Pilih blok utuh dahulu |
|---|---|---|
| Kumpulan 1 | `P7 + Q1` | `P7 + T1` |
| Kumpulan 2 | `Q4 + R4` | `Q5 + S3` |
| Kumpulan 3 | `S3 + T1` | `R4` |
| Sekolah dipecah | **Q dan R** | **tiada** |

Kedua-duanya memberi 3 kumpulan dan padatan yang sama ketat. Bezanya, hirisan
berturutan memecahkan SK Q antara dua kumpulan semata-mata kerana ia kebetulan
melintasi sempadan bakul.

**Bilangan kumpulan sentiasa `ceil(jumlah / saiz)`** — tiada kumpulan separuh
kosong di tengah. Hanya kumpulan terakhir setiap kolam boleh kurang daripada 8.

## 5. Tajuk kumpulan diterbitkan, bukan disimpan

`tajukKumpulan(ahli)` mengira tajuk daripada ahli semasa:

- semua satu sekolah → nama sekolah itu
- lebih satu sekolah → `CAMPUR`
- semua unit PPKI → `... (PPKI)`

Kalau tajuk disimpan, memindahkan seorang peserta secara manual akan
meninggalkan tajuk `SK X` pada kumpulan yang sudah bercampur — dan tiada
sesiapa perasan sehingga borang dicetak.

## 6. Kekangan pangkalan data

- `unique (badge_id, year, siri)` pada `practical_group_runs` — satu jadual
  aktif setiap program × tahun × siri. Menjana semula MENGGANTIKAN yang lama.
- `unique (run_id, person_id)` pada `practical_group_members` — seorang peserta
  hanya boleh berada dalam satu kumpulan. Ini peraturan teras, dikuatkuasakan
  oleh pangkalan data dan bukan diharapkan daripada algoritma.
- Peserta dipautkan melalui `submission_people.id`, **bukan** nombor kad
  pengenalan. IC boleh kosong (migrasi 016) dan boleh dibetulkan kemudian;
  id baris tidak.
- Nama, sekolah dan unit disimpan sebagai **snapshot**. Borang yang sudah
  diedarkan kepada penguji mesti sepadan dengan apa yang dilihat ketika ia
  dijana, walaupun seorang peserta ditarik balik keesokannya.

## 7. Saiz tidak dikuatkuasakan pada pelarasan manual

`pindahPeserta` tidak menolak kumpulan kesembilan. Admin yang memindahkan
peserta tahu apa yang dia buat — selalunya kerana adik-beradik atau
pengangkutan. Skrin menandakan kumpulan yang tersasar daripada saiz sasaran
dengan lencana kuning, supaya lebihan itu **kelihatan**, bukan disekat.

## 8. Cetakan

`muatTurunPdfAmali` menghasilkan borang kerja, bukan senarai rujukan:

- Petak tanda dibiarkan kosong dengan saiz yang cukup untuk ditanda pen.
- Satu kumpulan tidak pernah dipecahkan antara dua halaman — borang separuh
  muka surat tidak boleh dipegang oleh seorang penguji di padang.
- Lajur `SEKOLAH` muncul **hanya** pada kumpulan CAMPUR. Untuk kumpulan satu
  sekolah, tajuk kumpulan sudah membawanya dan lajur itu hanya merampas lebar
  daripada nama yang panjang.
- Setiap halaman membawa cap masa dan nombor halaman, kerana helaian ini
  diedarkan berasingan kepada penguji berlainan.

## 8a. Lajur borang boleh ditetapkan (migrasi 070)

`SERAYA`, `SILANG`, `TUNGKU` ialah lalai, bukan peraturan. Ujian lain menguji
kemahiran lain, dan bilangannya pun berbeza.

| Perkara | Keputusan |
|---|---|
| Boleh ditetapkan | Lajur tanda: **1 hingga 6**, nama bebas |
| Tetap | `BIL`, `NAMA PESERTA` |
| Automatik | `SEKOLAH` — muncul pada kumpulan CAMPUR sahaja |
| Pilihan | `CATATAN` boleh dimatikan |
| Disimpan | Pada baris larian, satu set per program x tahun x siri |

**Kenapa BIL dan NAMA tidak boleh ditetapkan.** Borang tanpa nama peserta bukan
borang. Membenarkannya bermakna membenarkan admin mencetak sesuatu yang tidak
berguna, dan sistem tidak dapat memberitahu mereka sebelum kertas itu sampai ke
padang.

**Kenapa lajur dihantar melalui RPC dan bukan dikemas kini berasingan.** Menjana
semula ialah PADAM dan SISIP baris larian. Kalau lajur hanya disimpan pada baris
itu tanpa dihantar semasa menjana, setiap kali admin menjana semula lajurnya
kembali kepada lalai dan kerja menaipnya hilang. Bentuk lama
`simpan_kumpulan_amali` DIGUGURKAN dan bukan dibiarkan bersama yang baharu —
dua bentuk serentak bermakna pemanggil yang terlupa menghantar lajur akan
senyap-senyap memilih bentuk lama.

**Mengubah lajur tidak memerlukan jana semula.** `simpanLajurBorang` mengemas
kini baris larian sahaja. Menukar kepala lajur tidak menyentuh siapa berada
dalam kumpulan mana, jadi memaksa jana semula untuk membetulkan satu ejaan akan
memusnahkan setiap pelarasan manual yang sudah dibuat.

**Had 6 datang daripada lebar kertas, bukan pilihan sewenang-wenang.** Pada A4
potret, kes paling sempit (6 lajur + kumpulan CAMPUR + CATATAN) memberi petak
tanda 11mm dan lajur nama 46mm. Lebih daripada itu, petak menjadi terlalu kecil
untuk ditanda pen — iaitu satu-satunya kerja borang ini.

**Kekangan menggunakan fungsi, bukan ungkapan terus.** Postgres menolak subquery
dalam `CHECK`, dan memeriksa setiap elemen array memerlukan `unnest`. Kerana itu
`chk_lajur_tanda` memanggil `lajur_tanda_sah(text[])` yang IMMUTABLE.

**Nota kaki borang menamakan lajur sebenar.** Menyenaraikan Seraya/Silang/Tungku
pada borang yang menguji sesuatu yang lain akan mengarahkan penguji membuat
ujian yang salah.

## 9. Yang belum dibuat

- **Penguji belum diagihkan kepada kumpulan amali.** Modul stesen mempunyai
  kolam penguji dikongsi (migrasi 062–064); tiada yang setara di sini lagi.
  Kalau diperlukan, ikut corak yang sama.
- Tiada eksport Excel — hanya PDF.
