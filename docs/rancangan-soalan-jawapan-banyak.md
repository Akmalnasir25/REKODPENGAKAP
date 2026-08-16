# RANCANGAN: Soalan Jawapan Berbilang (Kotak Semak)

> Status: **Rancangan tertutup · kod ditulis 2026-08-16** · Skop: Kuiz GAS (`docs/quiz-gas/`)
>
> §8 ditutup oleh pemilik sistem ("betulkan semuanya") — semua item diambil.
> Belum diuji: kuiz hidup di Apps Script, jadi ujian §9 perlu dijalankan oleh
> pemilik selepas menampal fail dan Deploy versi baharu.

---

## 1. Masalah yang dilaporkan

Import dari Google Form melangkau soalan yang perlu tanda lebih daripada satu jawapan. Kalau Form itu **hanya** mengandungi soalan jenis tersebut, import gagal terus dengan mesej "Tiada soalan aneka pilihan dijumpai dalam Form."

---

## 2. Punca

`ImportForm.gs:51-74` — gelung `items.forEach` hanya mengendali dua jenis item:

| Baris | Jenis dikendali |
|---|---|
| `ImportForm.gs:54` | `FormApp.ItemType.IMAGE` |
| `ImportForm.gs:60` | `FormApp.ItemType.MULTIPLE_CHOICE` |

`FormApp.ItemType.CHECKBOX` tidak disebut langsung. Item jenis itu jatuh ke hujung gelung tanpa `else`, jadi ia dilangkau **senyap** — tiada ralat, tiada amaran, cuma hilang. Kemudian `ImportForm.gs:76` membaling ralat kalau `rows` kosong.

---

## 3. Kenapa membetulkan import sahaja tidak memadai

Menambah cawangan `CHECKBOX` akan memasukkan soalan itu ke tab `Soalan`, tetapi ia masih tidak berfungsi, kerana seluruh sistem menganggap satu soalan = satu huruf jawapan:

| Lapisan | Fail · baris | Andaian sekarang |
|---|---|---|
| Kunci jawapan | `Quiz.gs:33` | `answerKey[qid] = String(r.jawapan).trim().toUpperCase()` — satu rentetan |
| Pemarkahan | `Code.gs:161-166` | `given === answerKey[qid]` — banding rentetan tunggal |
| Paparan murid | `Index.html:194` | `<input type="radio" name="qid">` — satu pilihan sahaja |
| Simpan jawapan | `Index.html:261-267` | `S.answers[qid] = key` — tulis ganti, bukan kumpul |
| Kira progres | `Index.html:269, 275` | `Object.keys(S.answers).length` |
| Editor admin | `Admin.html:219-220` | `<select>` satu huruf A–E |
| Normalisasi admin | `AdminServer.gs:67, 84` | `.toUpperCase()` atas satu huruf |

Jadi kerja ini menyentuh **lima fail**: `ImportForm.gs`, `Quiz.gs`, `Code.gs`, `Index.html`, `Admin.html`, `AdminServer.gs`.

---

## 4. Keputusan yang sudah ditutup

Ditetapkan oleh pemilik sistem pada 2026-08-16:

**4.1 Pemarkahan: semua atau tiada.** Soalan dikira betul hanya jika set pilihan murid sama persis dengan kunci. Tick tak lengkap = 0. Tick lebih = 0. Ini sepadan dengan cara Google Forms sendiri menilai soalan kotak semak, jadi markah kuiz kekal selari dengan Form asal.

**4.2 Jenis soalan disimpulkan daripada kunci jawapan.** Tiada lajur baharu pada tab `Soalan`. Kunci dengan lebih daripada satu huruf → kotak semak. Satu huruf → bulatan. Soalan sedia ada terus berfungsi tanpa disentuh dan tiada migrasi Sheet diperlukan.

> Risiko diterima: soalan yang di Google Form ialah kotak semak tetapi hanya ada **satu** jawapan betul akan dipapar sebagai bulatan. Kesan pemarkahan tiada — jawapan betul tetap satu — cuma rupa berbeza daripada Form asal.

**4.3 Lajur `markah` kekal diabaikan.** `Code.gs:161-166` memberi 1 markah setiap soalan tanpa membaca lajur `markah`. Itu isu sedia ada dan **di luar skop** kerja ini. Tidak disentuh supaya ambang lulus dan keputusan murid sedia ada tidak berubah.

---

## 5. Kontrak kunci jawapan

Satu fungsi penormalan menjadi sumber kebenaran tunggal, digunakan oleh kelima-lima fail.

```
_normKunci(v) -> array huruf, unik, tersusun

  terima : rentetan ATAU array
  proses : huruf besar → ambil [A-E] sahaja → buang pendua → susun
  pulang : ['A','C']
```

Bentuk kanonik untuk disimpan dalam sel: huruf dipisah koma — `A,C`.

Penormal ini sengaja longgar pada input supaya admin boleh menaip ikut selesa; ia ketat pada output supaya perbandingan sentiasa boleh dipercayai:

| Ditaip dalam sel | Ditafsir sebagai |
|---|---|
| `C` | `['C']` → bulatan |
| `A,C` | `['A','C']` → kotak semak |
| `AC` | `['A','C']` |
| `a, c` | `['A','C']` |
| `C,A` | `['A','C']` (tersusun) |
| `A,A` | `['A']` (pendua dibuang) |

Penentuan jenis: `_normKunci(jawapan).length > 1` → kotak semak.

Lokasi: `Quiz.gs` (ruang nama global GAS menjadikannya boleh dicapai semua fail).

---

## 6. Perubahan ikut fail

### 6.1 `ImportForm.gs` — baca item CHECKBOX

Cawangan `MULTIPLE_CHOICE` (baris 60-73) dan cawangan `CHECKBOX` baharu hampir serupa, jadi kedua-duanya dicantum menjadi satu pembina baris berkongsi. Beza tunggal: `MULTIPLE_CHOICE` mengambil huruf betul **pertama**, `CHECKBOX` mengumpul **semua** huruf betul.

```
asCheckboxItem().getChoices() → kumpul setiap c.isCorrectAnswer()
→ jawapan = kumpulan.join(',')
```

Juga:
- Baris 76: mesej ralat dikemas kini — sebut kotak semak, bukan "aneka pilihan" sahaja.
- Baris 137-139: teks amaran selepas import sebut soalan kotak semak diimport sebagai `A,C`.

### 6.2 `Quiz.gs` — kunci berbilang + bendera jenis

- Baris 33: `answerKey[qid] = _normKunci(r.jawapan)` — simpan array.
- Objek soalan yang dihantar ke klien dapat medan baharu `multi: true/false`.

> Bendera `multi` mendedahkan bahawa soalan itu ada lebih daripada satu jawapan betul, tetapi **tidak** mendedahkan berapa banyak atau yang mana. Ini sama seperti Google Form yang memaparkan kotak semak. Kunci sebenar kekal di server, seperti sedia ada.

- Pengetatan baharu: langkau soalan yang mana-mana huruf kuncinya tiada teks pilihan (contoh `jawapan = E` tetapi lajur E kosong). Sekarang soalan begitu mustahil dijawab betul; lebih baik ia dilangkau daripada menjatuhkan markah murid secara senyap.

### 6.3 `Code.gs` — pemarkahan set

Baris 161-166 ditukar kepada perbandingan set semua-atau-tiada:

```
kunci  = _normKunci(a.answerKey[qid])
diberi = _normKunci(answers[qid])
betul  = kunci.length > 0 && diberi.join(',') === kunci.join(',')
```

Kedua-dua belah dinormalkan, bukan kunci sahaja. Sebabnya di §7.1.

### 6.4 `Index.html` — kotak semak + jawapan terkumpul

- Baris 194: jenis input ikut `q.multi` — `checkbox` atau `radio`.
- Baris 193: soalan `multi` panggil `toggle(qid, key)`; soalan biasa kekal `pick(qid, key)`.
- `toggle()` baharu: tambah/buang huruf daripada array `S.answers[qid]`, kemudian kemas kini kelas `.sel` bagi pilihan itu sahaja.
- Baris 269 & 275: pengiraan "dijawab" tidak lagi boleh guna `Object.keys().length` — lihat §7.2. Ganti dengan pembantu:

```
answered(qid) = Array.isArray(v) ? v.length > 0 : !!v
```

### 6.5 `Admin.html` — editor jawapan berbilang

- Baris 219-220: `<select id="s_jawapan">` diganti lima kotak semak `A`–`E`.
- Baris 236: `saveQ()` mengumpul yang ditanda → `A,C`.
- Baris 211: `editQ()` menanda semula daripada `_normKunci(q.jawapan)`.
- Baris 199 (senarai soalan) tidak berubah — ia hanya memapar rentetan `jawapan`, jadi `Jwp: A,C` terus betul.

### 6.6 `AdminServer.gs` — normalisasi baca/tulis

Baris 67 dan 84 guna `_normKunci(...).join(',')` menggantikan `.toUpperCase()`.

### 6.7 Dokumentasi

- `README-setup.md:44` — terangkan `jawapan` boleh berbilang huruf.
- `README-setup.md:110` — sebut soalan kotak semak kini diimport.
- `soalan-template.csv` — tambah satu baris contoh berjawapan `A,C`.

---

## 7. Kes tepi

**7.1 Cubaan yang sedang berjalan semasa kemas kini.** `Code.gs:143` menyimpan cubaan dalam `CacheService` selama 6 jam. Murid yang mula sebelum kemas kini dan menghantar selepasnya akan mempunyai `answerKey` bentuk **lama** (rentetan) dalam cache. Kerana §6.3 menormalkan kedua-dua belah, `'C'` dan `['C']` menghasilkan `['C']` yang sama — cubaan lama terus dinilai betul. Tanpa langkah ini, setiap cubaan dalam tetingkap 6 jam itu akan mendapat markah sifar.

**7.2 Array kosong dikira sebagai "dijawab".** `Index.html:269` mengira `Object.keys(S.answers).length`. Kalau murid menanda kemudian membuang semula semua tanda, kunci `S.answers[qid]` masih wujud membawa array kosong — progres akan menunjukkan soalan itu dijawab dan `submitQuiz` (baris 275) akan membenarkan hantar. Pembantu `answered()` di §6.4 menutupnya.

**7.3 Pilihan "Lain-lain" pada Google Form.** Item kotak semak berpilihan *Other* memulangkan pilihan berteks kosong. Ia akan menjadi lajur kosong dan huruf yang tiada teks — ditapis oleh pengetatan §6.2.

**7.4 Had lima pilihan kekal.** `ImportForm.gs:69` memotong pada 5 pilihan (`i < 5`) kerana tab `Soalan` hanya ada lajur A–E. Form dengan 6 pilihan atau lebih akan dipotong **senyap**, sama seperti sekarang. Tidak diubah oleh rancangan ini, tetapi perlu diketahui semasa menyemak soalan yang diimport.

**7.5 Grid masih tidak disokong.** `CHECKBOX_GRID` dan `MULTIPLE_CHOICE_GRID` kekal dilangkau. Ia tidak muat dalam skema A–E satu baris dan berada di luar skop.

**7.6 Form bukan jenis Kuiz.** `isCorrectAnswer()` tidak memulangkan apa-apa yang berguna kalau Form tidak dijadikan Kuiz berkunci. Soalan tetap diimport dengan lajur `jawapan` kosong, dan amaran sedia ada (`ImportForm.gs:139`) sudah memberitahu admin mengisinya manual. Tidak berubah.

---

## 8. Titik tutup — semua diambil

Ditutup 2026-08-16. Ketiga-tiga item diluluskan sekali gus:

**8.1 Import Word — DIAMBIL.** `parseWordText` kini mengumpul tanda `*` berbilang, dan baris `Jawapan:` menerima senarai (`Jawapan: A, C`) bukan satu huruf sahaja.

**8.2 Ujian — senarai semak disediakan di §9.**

**8.3 Susunan — diterima.** Dilaksanakan mengikut urutan yang dicadang.

**Skop tambahan yang diambil semasa pelaksanaan** (di luar rancangan asal, kerana "betulkan semuanya"):

- **Kebocoran `pendingImg`** — punca sebenar gambar hilang; lihat §10.
- **Gambar inline melalui Forms REST API** — had `FormApp` yang direkod dalam README selama ini, kini ada jalan keluar sebenar.
- **Soalan menu jatuh (`LIST`)** — satu lagi jenis yang dilangkau senyap.
- **Amaran pemotongan 5 pilihan** — dahulu senyap, kini dilaporkan selepas import.

---

## 9. Senarai semak ujian

Jalankan selepas menampal fail ke Apps Script dan **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New**.

**9.1 Import**

| # | Langkah | Jangkaan |
|---|---|---|
| 1 | Import Form yang ada soalan kotak semak | Soalan itu masuk; sel `jawapan` berbentuk `A,C` |
| 2 | Susun Form: blok gambar → soalan kotak semak → soalan bulatan | Gambar melekat pada soalan **kotak semak**, bukan soalan bulatan |
| 3 | Import Form dengan soalan berpilihan 6+ | Amaran "⚠ N soalan ada LEBIH 5 pilihan" muncul |
| 4 | Import Form bukan jenis Kuiz | Soalan masuk, `jawapan` kosong, amaran sedia ada muncul |

**9.2 Pemarkahan** — kunci `A,C`, ambang lulus seperti biasa

| # | Murid menanda | Jangkaan |
|---|---|---|
| 5 | A dan C | **betul** |
| 6 | A sahaja | salah (tak lengkap) |
| 7 | A, C, D | salah (lebih) |
| 8 | B sahaja | salah |
| 9 | Tiada apa-apa, cuba Hantar | "Sila jawab semua soalan dahulu" |
| 10 | Tanda A, kemudian buang tanda A | Progres turun semula; Hantar disekat |

**9.3 Panel Admin**

| # | Langkah | Jangkaan |
|---|---|---|
| 11 | Edit soalan berjawapan `A,C` | Kotak A dan C sudah bertanda |
| 12 | Simpan tanpa menanda apa-apa | Ditolak: "Sila tanda sekurang-kurangnya satu jawapan betul" |
| 13 | Tanda E sedangkan pilihan E kosong | Ditolak dengan sebutan huruf terlibat |
| 14 | Tanda A dan C, Simpan | Sel Sheet menjadi `A,C`; senarai memapar `Jwp: A,C` |

**9.4 Gambar inline** (hanya jika §C README diikut)

| # | Langkah | Jangkaan |
|---|---|---|
| 15 | Import Form bergambar inline | Lajur `gambar` terisi; gambar muncul semasa menjawab |
| 16 | Tanpa mengaktifkan Forms API | Import tetap berjaya, lajur `gambar` kosong, **tiada ralat** |

---

## 10. Punca sebenar gambar hilang (ditemui semasa pelaksanaan)

Ini tidak ada dalam rancangan asal kerana ia hanya kelihatan selepas membaca gelung import baris demi baris.

`pendingImg` menyimpan gambar blok berasingan untuk dilekatkan pada soalan berikutnya. Ia dikosongkan pada **satu** tempat sahaja — di dalam cawangan `MULTIPLE_CHOICE`. Soalan kotak semak tidak pernah sampai ke cawangan itu, jadi:

```
[Blok gambar]  [Soalan kotak semak]  [Soalan bulatan]
      │               (dilangkau)            │
      └────────── gambar melimpah ───────────┘
                                    melekat pada soalan SALAH
```

Kalau tiada soalan bulatan selepasnya, gambar itu hilang terus. Jadi "soalan bergambar tak diimport" dan "soalan kotak semak tak diimport" ialah **satu bug yang sama**, bukan dua.

Pembetulan: `pendingImg = ''` dipindahkan supaya ia berlaku selepas **mana-mana** baris soalan ditulis, dan sengaja **tidak** dikosongkan untuk item bukan soalan (tajuk bahagian, pemisah halaman) supaya gambar masih boleh merentasinya.
