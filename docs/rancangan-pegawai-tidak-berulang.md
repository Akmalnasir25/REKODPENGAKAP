# Rancangan: Pegawai Tidak Berulang Dalam Satu Siri

Status: **rancangan · belum implementasi**. Dua soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

---

## 1. Keperluan

Satu siri lazimnya mengandungi beberapa program, dan sekolah mendaftarkan pegawai yang **sama** untuk setiap satu — pemimpin yang sama, penguji yang sama. Hari ini setiap pendaftaran itu ialah baris berasingan, jadi nama yang sama muncul berulang kali dalam senarai, dalam cetakan, dan dikira berulang kali dalam statistik.

Bila paparan ditapis mengikut **siri** (tanpa memilih program), setiap pegawai sepatutnya muncul **sekali sahaja**. Bila ditapis mengikut **program**, paparan kekal seperti sekarang.

---

## 2. Apa yang ditemui dalam kod

### 2.1 Dedup sedia ada buta terhadap siri

`deduplicateRecords` (`utils/dataProcessing.ts:122`) membina kuncinya begini:

```ts
const uniqueKey = cleanIC && cleanIC.length > 4
  ? `${cleanIC}_${item.badge}_${year}`
  : `${cleanName}_${item.school}_${item.badge}_${year}`;
```

Kunci itu mengandungi program dan tahun, tetapi **tidak mengandungi siri**.

Akibatnya bertentangan dengan yang diminta: orang yang sama didaftarkan dalam Siri 1 **dan** Siri 2 bagi program yang sama runtuh menjadi satu baris, dan salah satu sirinya lenyap daripada papan pemuka admin tanpa amaran. Ini bukan teori — pemimpin yang mengiringi kedua-dua pusingan ialah kes biasa.

Menambah dedup merentas program di atas kunci yang buta-siri menghasilkan hasil yang tidak menentu. Kunci itu mesti dibetulkan dahulu, dalam kerja yang sama.

### 2.2 Hanya satu tempat menggunakannya

`deduplicateRecords` dipanggil di **satu** tempat sahaja: `AdminDashboard.tsx:70`. Papan pemuka sekolah, cetakan dan rumusan program masing-masing menapis sendiri tanpa melaluinya.

Jadi kerja ini bukan menukar satu fungsi. Ia memperkenalkan satu peraturan kepada empat tempat yang selama ini tidak berkongsi satu pun.

### 2.3 Wang dikira per program, bukan per orang

`create-payment-bill` mengira peranan **bagi setiap program**, dan `fee_pemimpin` dikenakan pada setiap kiraan itu. Seorang pemimpin yang didaftarkan untuk dua program dalam satu siri dicaj **dua kali** hari ini, dan mengambil **dua tempat**.

Ini bermakna dedup paparan semata-mata akan menghasilkan percanggahan yang boleh dilihat: jubin statistik berkata 1 pemimpin, bil berkata 2. Soalan S1 di bawah memutuskan sama ada itu diterima atau wang turut dinyahduakan.

---

## 3. Keputusan

**K1 — Dedup hanya untuk PEGAWAI, bukan peserta.**

PEMIMPIN, PENOLONG PEMIMPIN, PEMBANTU dan PENGUJI dinyahduakan. PESERTA tidak.

Sebabnya: seorang murid yang muncul dalam dua program dalam satu siri ialah **dua pendaftaran sebenar** — dua tempat, dua yuran. Menyembunyikannya daripada paparan menyembunyikan sama ada kesilapan pendaftaran atau kos sebenar. Pegawai berbeza: seorang guru yang mengiringi tiga program tetap seorang guru.

**K2 — Dedup hanya bila TIADA program dipilih.**

Penapis program bermakna "tunjukkan program ini", dan dalam konteks itu setiap baris ialah pendaftaran program tersebut. Dedup hanya masuk apabila paparan merentas program dalam satu siri.

**K3 — Kunci identiti mengikut peraturan sedia ada.**

Nombor KP bila panjangnya melebihi 4 aksara; jika tidak, nama + sekolah. Peraturan yang sama sudah digunakan oleh `deduplicateRecords`, dan memperkenalkan peraturan kedua bermakna dua definisi "orang yang sama" yang akan menyimpang.

**K4 — Kunci dedup mesti mengandungi siri.**

Dibetulkan tanpa mengira apa yang diputuskan tentang selebihnya. Kunci baharu: `<identiti>_<tahun>_<siri>` bagi pegawai yang dinyahduakan merentas program, dan `<identiti>_<program>_<tahun>_<siri>` bagi baris yang tidak.

**K5 — Baris yang dikekalkan mesti menunjukkan ia mewakili beberapa program.**

Kalau seorang penguji dinyahduakan daripada tiga baris kepada satu, lajur Program pada baris itu tidak boleh berbohong dengan menamakan satu program sahaja. Ia menyenaraikan ketiga-tiganya, atau menunjukkan kiraan.

---

## 4. Keputusan lanjut

**K6 — Paparan sahaja. Wang tidak disentuh.**

Bil dan tempat kekal dikira per program. Seorang pemimpin yang didaftarkan untuk tiga program dalam satu siri masih dicaj tiga kali dan mengambil tiga tempat.

Ini bermakna jubin statistik dan bil akan **berbeza dengan sengaja**, dan perbezaan itu mesti boleh dijelaskan. Rumusan Bayaran kekal per program dan tidak dinyahduakan langsung — ia laporan wang, dan setiap barisnya ialah caj sebenar.

Alternatifnya menyentuh `create-payment-bill`, kiraan snapshot dan pengiraan tempat serentak — lapisan paling berisiko dalam sistem — sedang Siri 2 sedang mengutip wang sebenar.

**K7 — Lajur Program menyenaraikan setiap program.**
`Keris Emas, Keris Perak, Keris Gangsa`. Bukan kiraan, bukan label siri.

**K8 — Baris yang digabungkan tidak boleh disunting atau dipadam.**

Ini bukan pilihan, ia akibat. Baris gabungan mewakili tiga pendaftaran; butang Padam di atasnya hanya boleh memadam satu daripadanya, dan tiada cara memberitahu pengguna yang mana. Butang tindakan dilumpuhkan pada baris gabungan, dengan nota menyuruh mereka menapis mengikut program untuk menyunting.

Baris pegawai yang hanya wujud dalam **satu** program tidak digabungkan, jadi ia kekal boleh disunting seperti biasa.
