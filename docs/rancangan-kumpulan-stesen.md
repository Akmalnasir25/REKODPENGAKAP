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

## 13. Kolam penguji merentas beberapa program

Dua program yang berjalan pada hari yang sama berkongsi pemimpin. Admin
menanda program mana digabungkan; penguji kedua-duanya menjadi satu senarai.

Dua soalan ditutup sebelum kod ditulis:

| # | Soalan | Keputusan |
|---|---|---|
| **G1** | Apa yang ditanda untuk membuat senarai gabungan? | **Program.** Tanda Keris Perak + Keris Emas, dan SEMUA penguji kedua-duanya menjadi satu kolam. Bukan tanda seorang demi seorang |
| **G2** | Selepas digabung, stesen bagaimana? | **Setiap program kekal stesennya sendiri.** Keris Perak 12 stesen, Keris Emas stesennya sendiri. Kolam 34 orang itu dibahagikan antara dua set stesen yang berasingan |

Angka sebenar Siri 2 2026: Keris Perak 27 penguji, Keris Emas 7, tiada
pertindihan antara keduanya — kolam 34.

### Yang digabungkan ialah senarai, bukan penempatan

Ini perbezaan yang menjadikannya selamat. Kedua-dua program **melihat** 34
orang yang sama. Hanya satu boleh **mengambil** seseorang.

Kekangan `unique (year, siri, person_ic)` daripada migrasi 062 sudah
menguatkuasakannya, dan ia tidak dilonggarkan. Menggabungkan kolam hanya
meluaskan senarai yang boleh dipilih; ia tidak menyentuh siapa yang boleh
diletakkan di mana. Seorang penguji yang diambil oleh jadual Keris Perak
muncul dalam skrin Keris Emas sebagai **sudah ditempatkan**, dan pangkalan
data menolak percubaan untuk meletakkannya sekali lagi.

Susunan kerja yang terhasil: jana Keris Perak dahulu, ia mengambil bahagiannya
daripada kolam; kemudian jana Keris Emas, ia mendapat yang selebihnya.

### `program_lain` melaporkan lebih daripada gabungan

Lajur itu menyenaraikan **setiap** program siri ini yang seseorang daftar,
bukan hanya yang ditanda. Kalau Cikgu X juga penguji Maju sedangkan Maju tidak
ditanda, admin tetap nampak — kerana Maju masih boleh mengambilnya kemudian,
dan itu maklumat yang diperlukan sebelum meletakkannya.

### Tandaan itu disimpan

`station_group_runs.program_gabung text[]` — program TAMBAHAN, tidak termasuk
program larian itu sendiri. Disimpan supaya tandaan kekal selepas muat semula
dan supaya sesiapa yang membuka jadual itu kemudian nampak dari mana penguji
datang. Tandaan hanya boleh disimpan selepas jadual peserta wujud; sebelum itu
tiada larian untuk menyimpannya.

**Migrasi 063.**

## 14. Kuota penguji setiap program

Kolam dikongsi tidak bermakna satu program menelan keseluruhannya. Admin
menetapkan **berapa penguji program itu perlukan**, dan hanya sebanyak itu
diambil dari kolam. Selebihnya kekal untuk program yang lain.

Contoh Siri 2: kolam 34 (Keris Perak 27 + Keris Emas 7). Keris Perak
ditetapkan 24, jadi 10 kekal. Keris Emas ditetapkan 10 dan mengambil
selebihnya — termasuk penguji yang mendaftar di bawah Keris Perak.

Dua keputusan ditutup sebelum kod ditulis:

| # | Soalan | Keputusan |
|---|---|---|
| **K1** | Kuota itu jumlah setiap program atau bilangan setiap stesen? | **Jumlah setiap program.** Skrin memaparkan akibatnya secara langsung — `24 orang · 12 stesen · 2 setiap stesen` — supaya tidak perlu mengira sendiri |
| **K2** | Bila kuota lebih kecil daripada kolam, siapa dipilih? | **Penguji program itu sendiri dahulu, baru dipinjam.** Keris Perak memenuhi 24 daripada 27 orangnya sendiri dan tidak meminjam langsung; hanya kekurangan yang diambil dari program yang digabungkan |

### Kenapa program sendiri dahulu

Peminjaman sepatutnya menampung kekurangan, bukan menggantikan orang yang
sudah ada. Kalau pemilihan mencampurkan kedua-duanya secara rawak, Keris
Perak boleh mengambil penguji Keris Emas sedangkan pengujinya sendiri
menganggur — dan Keris Emas kemudiannya kekurangan orang untuk stesennya.

Susunan itu juga menjadikan hasil boleh diramal: selagi program mempunyai
cukup orang sendiri, menanda program lain untuk digabungkan **tidak mengubah
apa-apa**. Ia hanya membuka simpanan untuk digunakan bila diperlukan.

### Kuota lebih besar daripada yang ada

Ditempatkan sebanyak yang ada dan dinyatakan kekurangannya. Ia tidak
dihalang — stesen dengan seorang penguji masih boleh berjalan, dan admin
perlu tahu angkanya untuk mencari orang tambahan.

### Disimpan bersama larian

`station_group_runs.penguji_diperlukan integer`. Kosong bermakna belum
ditetapkan; pengagihan mengambil seluruh kolam yang ada, seperti sebelum ini.

**Migrasi 064.**

## 15. Sembunyikan kiraan, dan pindah penguji merentas program

Dua perubahan kecil yang diminta selepas jadual digunakan sebenar.

### Kiraan peserta boleh disembunyikan

Satu kotak tick. Bila ditanda, bilangan peserta tidak dipaparkan dalam
senarai — nama sekolah sahaja.

Tandaan itu terpakai pada **skrin dan PDF sekali**. Kalau ia menyembunyikan
kiraan pada skrin tetapi mencetaknya juga, kotak itu berbohong tentang apa
yang akan keluar dari pencetak. Apa yang kau nampak ialah apa yang kau
cetak.

Jumlah keseluruhan pada bar ringkasan di atas kekal. Yang disembunyikan
ialah kiraan setiap baris dan setiap stesen, bukan fakta bahawa jadual itu
mempunyai peserta.

### Penguji boleh dipindahkan ke stesen program lain

Sebelum ini menu stesen hanya menyenaraikan stesen larian itu sendiri, jadi
penguji hanya boleh bergerak dalam programnya. Kini menu itu menyenaraikan
stesen **setiap program** siri tersebut, dikumpulkan mengikut program.

Ini pasangan yang hilang bagi kolam yang dikongsi (§13). Kolam membenarkan
seorang penguji dipilih oleh mana-mana program; tanpa pemindahan merentas
program, membetulkan pilihan itu bermakna reset kedua-dua jadual.

**Kenapa ia mesti RPC, bukan padam-dan-sisip di sebelah aplikasi.**
Kekangan `unique (year, siri, person_ic)` bermakna baris lama mesti hilang
sebelum baris baharu boleh wujud. Dua panggilan berasingan dari pelayar
mempunyai celah antara keduanya: kalau sisipan gagal — talian putus, tab
ditutup — penguji itu lenyap daripada kedua-dua jadual dan tiada apa
memberitahu sesiapa. Satu fungsi pangkalan data melakukan kedua-duanya
dalam satu transaksi, atau tidak langsung.

Nama dan sekolah dibawa bersama dari baris lama; ia tidak dicari semula,
kerana penguji yang sama sudah disahkan layak ketika dia mula-mula
ditempatkan.

**Migrasi 067.**

## 16. Label dipilih admin, dan pepijat 18-jadi-12

### Pepijat: bilangan kumpulan tidak diikut

Admin menetapkan 18 kumpulan; 12 terhasil. Puncanya satu baris:

```ts
onChange={e => setBilKumpulan(... Number(e.target.value) || 12)}
```

Medan itu terkawal. Memadam '12' untuk menaip '18' menghasilkan rentetan
kosong seketika, `Number('')` ialah 0, dan `|| 12` menulis semula **12** ke
dalam kotak pada ketukan kekunci itu juga. Tiada apa yang kelihatan salah,
dan 12 itulah yang dihantar ke pangkalan data.

Medan kini dibenarkan kosong semasa menaip dan hanya kembali kepada 12 bila
fokus keluar. Nilai lalai tidak lagi menulis ganti apa yang admin taip.

### Label menjadi data

Empat pilihan format:

| Format | 18 kumpulan menghasilkan |
|---|---|
| `bahagian` | 1A…6A, 1B…6B, 1C…6C (asal) |
| `nombor` | 1, 2, 3 … 18 |
| `huruf` | A, B, C … R (dan AA, AB selepas Z) |
| `tersuai` | apa sahaja yang ditaip, dipisah koma |

Yang disimpan ialah **senarai label itu sendiri**, bukan nama formatnya.
Dua sebab: format tersuai tidak boleh dijana semula daripada nama, dan label
yang sudah dicetak tidak boleh berubah kerana seseorang menukar tetapan
kemudian. Larian lama mempunyai NULL dan terus menggunakan formula asal,
jadi tiada jadual sedia ada berubah labelnya.

Jana menolak senarai yang salah bilangan atau mempunyai label berulang.
Kekangan yang sama ditegakkan sekali lagi di dalam
`simpan_kumpulan_stesen`, kerana menu pemindahan stesen dibina daripada
label ini — label yang kurang bermakna baris tanpa tempat untuk dipindahkan.

### Bahagian hanya wujud bila label berbentuk nombor+huruf

Pemisahan halaman cetakan (§ sebelum ini) mengumpulkan mengikut huruf akhir.
Kalau peraturan itu dibiarkan, format A-B-C dengan 18 stesen akan mencetak
**18 halaman**, satu label setiap helaian.

Jadi bahagian dikenal pasti hanya daripada corak nombor+huruf: `1A` ada
bahagian A, manakala `7` dan `C` tiada. Tanpa bahagian, cetakan mengalir
sebagai satu senarai. Disahkan dengan merender: 18 stesen menghasilkan 3
halaman bagi format bahagian, satu halaman bagi nombor dan huruf.

**Migrasi 068.**

## 17. Sunting penguji tanpa menjana semula

Penguji berubah selepas jadual dibuat: seorang menarik diri, sekolah
menghantar nama ganti, seorang lagi ditambah lewat. Satu-satunya alat yang
ada ialah **Agih Penguji**, yang membuang segalanya dan mengagih semula —
jadi setiap pelarasan manual yang sudah dibuat hilang, dan kerja itu perlu
diulang.

Tiga tindakan bersasar ditambah, semuanya pada baris penguji itu sendiri:

| Tindakan | Kesan |
|---|---|
| **Ganti** | Penguji itu keluar, orang lain dari kolam masuk ke stesen yang SAMA |
| **Tambah** | Seorang dari kolam masuk ke stesen tertentu |
| **Buang** | Penguji itu keluar dan kembali ke kolam |

Susunan setiap stesen lain tidak disentuh. Menjana semula kekal wujud untuk
bila jadual memang perlu dibina semula dari awal.

### Siapa yang boleh dipilih sebagai ganti

Hanya penguji yang **layak dan belum ditempatkan** — layak bermakna dia
mendaftar dalam salah satu program yang digabungkan (§13), dan belum
ditempatkan bermakna tiada jadual lain dalam siri itu sudah mengambilnya.

Senarai itu sudah dibaca oleh skrin (`penguji_layak_stesen`); yang berubah
hanyalah ia kini ditawarkan sebagai pilihan, bukan hanya dikira.

### Kenapa Ganti mesti satu fungsi pangkalan data

Ganti ialah padam-dan-sisip, dan kekangan `unique (year, siri, person_ic)`
tidak menghalangnya kerana dua orang berbeza terlibat. Jadi masalahnya bukan
kekangan — ia kegagalan separuh jalan. Kalau sisipan gagal selepas padaman
berjaya, stesen itu kehilangan seorang penguji dan tiada apa memberitahu
sesiapa. Satu transaksi menutup celah itu.

Tambah dan Buang masing-masing satu operasi, jadi ia tidak memerlukan
perlindungan yang sama.

### Nama dan sekolah diambil dari kolam

Bukan ditaip. Penguji yang masuk mesti orang sebenar dalam pendaftaran siri
itu, bukan nama yang ditaip bebas — jika tidak, jadual penguji akan
mengandungi orang yang tiada dalam sistem, dan tiada apa yang boleh
menyemaknya kemudian.

**Migrasi 071.**
