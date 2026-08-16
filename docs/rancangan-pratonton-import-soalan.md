# Rancangan: Pratonton Soalan Selepas Import dari Google Form

Status: **selesai dilaksanakan** (16 Ogos 2026). Semua keputusan di §8 dijawab; §7 diuji dengan harness luar talian (98 ujian lulus) — lihat §9 untuk apa yang berubah semasa pelaksanaan.

Keputusan yang sudah ditutup (16 Ogos 2026):

- Pratonton berlaku **sebelum** apa-apa ditulis ke tab Soalan (dry-run → semak → simpan).
- Paparan pratonton ialah **kad soalan macam murid nampak**, bukan jadual ringkas.
- Duplikat dibanding dengan teks soalan dalam **quizId yang sama sahaja**.
- Pratonton ialah **tanda-dan-simpan sahaja** — tiada pengeditan dalam kad.
- Saiz jangkaan **30–60 soalan** satu Form → bar ringkasan melekat di atas skrin.

---

## 1. Keperluan

Import dari Google Form hari ini ialah tembakan dalam gelap. Admin tampal URL, tekan Import, dan dapat satu ayat: *"✔ 12 soalan diimport."* Apa yang sebenarnya masuk ke Sheet hanya diketahui selepas keluar dari skrin import dan membelek jadual soalan satu per satu — atau lebih teruk, selepas murid mula menjawab.

Yang lebih memburukkan: **import yang rosak tetap mengotorkan tab Soalan**. Tiada jalan batal. Import dua kali = soalan berganda, dan admin kena padam satu per satu (`adminDeleteQuestion`, satu baris satu klik).

Admin mahu melihat dahulu apa yang akan masuk, buang yang tak dikehendaki, baru simpan.

---

## 2. Keadaan kod hari ini

### 2.1 Parse dan tulis bercampur dalam satu fungsi

`ImportForm.gs:42` — `importFormToSheet(formRef, quizId)` membaca Form, membina `rows`, dan menulisnya dalam blok kunci yang sama:

```js
var lock = LockService.getScriptLock(); lock.waitLock(15000);
try {
  var sh = _sheet(SHEET_SOALAN);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { imported: rows.length, withImage: withImage, dipotong: dipotong };
} finally { lock.releaseLock(); }
```

Tiada titik masuk yang memulangkan `rows` tanpa menulisnya. Ini gap pertama dan terbesar.

### 2.2 Panel admin membuang amaran yang server sudah kira

`importFormToSheet` memulangkan tiga medan: `imported`, `withImage`, `dipotong`. `AdminServer.gs:197` menapisnya menjadi dua:

```js
function adminImportFromForm(token, formUrlOrId, quizId) {
  _requireAdmin(token);
  var r = importFormToSheet(formUrlOrId, quizId);
  return { ok: true, imported: r.imported };
}
```

`dipotong` — bilangan soalan yang pilihan ke-6 dan seterusnya **dibuang** kerana tab Soalan hanya ada lajur A–E — tidak pernah sampai ke panel admin. Menu Sheet memaparkannya dengan amaran penuh (`ImportForm.gs:255-259`); panel admin senyap. Dua jalan masuk, dua tahap maklumat.

### 2.3 Selepas import, admin dilempar ke jadual ringkas

`Admin.html:290`:

```js
call('adminImportFromForm',[TOKEN,url,_rememberedQuiz],function(r){
  if(msg){ msg.className='ok'; msg.textContent='✔ '+r.imported+' soalan diimport.'; }
  setTimeout(function(){ showTab('soalan'); }, 900);
},…
```

Jadual yang menyambutnya (`Admin.html:198-203`) memaparkan teks soalan + kunci jawapan sahaja. Pilihan A–E, gambar, dan status "boleh dijawab atau tidak" tidak kelihatan tanpa membuka Edit satu per satu.

### 2.4 quizId boleh kosong tanpa disedari

`importForm()` menangkap kuiz semasa melalui `curQuizRemembered()` (`Admin.html:276`) yang membaca `<select id="qz">`. Kalau senarai kuiz kosong, `tabSoalan()` tidak pernah memaparkan butang import (`Admin.html:184`), jadi keadaan ini tidak boleh dicapai hari ini — tetapi `doImportForm` tetap menghantar `_rememberedQuiz` tanpa semakan. Server pula membaling ralat yang betul (`ImportForm.gs:44`). Selamat, cuma mesejnya sampai lambat.

### 2.5 Soalan yang masuk pun belum tentu boleh dijawab

`pickQuestions` (`Quiz.gs:52`) **membuang senyap** soalan yang:

| Syarat | Baris |
|---|---|
| Kurang daripada 2 pilihan berteks | `Quiz.gs:73` |
| Kunci jawapan kosong | `Quiz.gs:75` |
| Kunci menunjuk huruf yang teks pilihannya kosong | `Quiz.gs:82` |

Jadi "12 soalan diimport" boleh bermakna 9 soalan sebenarnya boleh keluar dalam kuiz. Admin tidak pernah diberitahu. Pratonton ialah tempat paling murah untuk memberitahunya.

### 2.6 Perangkap yang paling senyap: jawapan betul yang dipotong

`_soalanDariPilihan` (`ImportForm.gs:131`):

```js
choices.forEach(function (c, i) {
  if (i < 5) pilihan.push(_stripChoiceLabel(c.getValue(), i));
  try {
    if (c.isCorrectAnswer() && i < LETTERS.length) betul.push(LETTERS[i]);
  } catch (e) {}
});
```

Kalau Form ada 7 pilihan dan yang **betul ialah pilihan ke-7**, `i < LETTERS.length` menolaknya. Hasilnya: soalan masuk dengan lajur Jawapan **kosong**, dan `dipotong` bertambah satu. Dua gejala, satu punca — tetapi amaran sedia ada ("ada lebih 5 pilihan") tidak memberitahu bahawa **jawapannya yang hilang**. Pratonton mesti membezakan dua kes ini.

---

## 3. Bentuk yang dicadangkan

### 3.1 Pecahkan parse daripada tulis

`ImportForm.gs` dipecah kepada tiga:

| Fungsi | Tugas |
|---|---|
| `_parseFormQuestions(formRef, quizId)` | Baca Form → pulang `{ items:[…], withImage, dipotong }`. **Tidak menulis apa-apa ke Sheet.** |
| `importFormToSheet(formRef, quizId)` | Panggil parse, tulis semua. Kekal untuk menu Sheet — tandatangan dan nilai pulangan **tidak berubah**. |
| `_writeQuestionRows(rows)` | Tulis dalam kunci. Dikongsi oleh `importFormToSheet` dan commit panel admin. |

Menu Sheet (`importFromGoogleForm`, `ImportForm.gs:243`) kekal terus-tulis. Dialog `ui.prompt` tidak boleh memapar kad soalan, dan menulis skrin HtmlService kedua untuk menu itu ialah kerja yang tidak setimpal — panel admin sudah menjadi jalan utama.

### 3.2 Bentuk satu item pratonton

`_parseFormQuestions` memulangkan objek per soalan, bukan array baris mentah:

```js
{
  idx: 0,                    // kedudukan dalam Form (untuk susunan & kunci klien)
  soalan: 'Apakah simpulan…',
  options: [{key:'A', text:'…'}, {key:'B', text:'…'}],   // yang berteks sahaja
  jawapan: ['A','C'],        // sudah melalui _normKunci
  gambar: 'https://drive.google.com/thumbnail?id=…',      // URL Drive (untuk simpan)
  gambarPapar: 'data:image/png;base64,…',                 // untuk pratonton sahaja
  gambarFileId: '1AbC…',     // untuk buang kalau ditolak
  jumlahPilihanAsal: 7,      // sebelum dipotong ke 5
  amaran: ['dipotong', 'kunci-dipotong'],
  boleh: false,              // lulus semakan pickQuestions?
  duplikat: true,            // teks soalan sudah wujud dalam quizId ini
}
```

`gambarPapar` **tidak** dihantar balik semasa commit — lihat §5.

### 3.3 Senarai amaran

| Kod | Maksud | Kesan | Tanda lalai |
|---|---|---|---|
| `dipotong` | Form ada >5 pilihan; pilihan ke-6+ dibuang | Soalan masih boleh dijawab | ☑ ditanda |
| `kunci-dipotong` | Jawapan betul ialah pilihan ke-6+ → kunci jadi kosong | **Tidak boleh dijawab** | ☐ tidak |
| `kunci-separa` | Kotak semak: SEBAHAGIAN jawapan betul jatuh pada pilihan yang dibuang | Boleh dijawab, tetapi **kuncinya salah** | ☐ tidak |
| `tiada-kunci` | Lajur Jawapan kosong (Form bukan jenis Kuiz) | **Tidak boleh dijawab** | ☐ tidak |
| `kunci-tanpa-teks` | Kunci menunjuk huruf yang teksnya kosong | **Tidak boleh dijawab** | ☐ tidak |
| `pilihan-kurang` | Kurang daripada dua pilihan berteks | **Tidak boleh dijawab** | ☐ tidak |
| `duplikat` | Teks soalan sama sudah wujud dalam quizId ini | Boleh dijawab, tetapi berganda | ☐ tidak |
| `tiada-gambar` | Blok/inline imej dikesan tetapi gagal disimpan | Soalan tanpa gambar | ☑ ditanda |

> **`kunci-separa` tidak dijangka semasa merancang** dan muncul semasa menulis kod.
> Soalan kotak semak dengan 9 pilihan yang jawapan betulnya ialah pilihan 1 **dan** 7
> menghasilkan kunci `A` sahaja — soalan yang lulus setiap semakan, keluar dalam kuiz,
> dan **menanda salah murid yang menjawabnya betul-betul ikut Form asal**. Ia lebih
> bahaya daripada soalan yang dibuang, kerana soalan yang dibuang sekurang-kurangnya
> senyap. Ia satu-satunya amaran di mana `boleh` benar tetapi tanda lalai tetap kosong.

`kunci-dipotong` dan `tiada-kunci` dibezakan dengan memeriksa sama ada mana-mana `choice.isCorrectAnswer()` benar pada indeks ≥5 — maklumat yang sudah ada dalam gelung `_soalanDariPilihan` tetapi dibuang hari ini.

Semakan `boleh` menggunakan **syarat yang sama persis** dengan `pickQuestions` (`Quiz.gs:73-83`), diekstrak menjadi satu fungsi `_soalanBolehDijawab(options, kunci)` yang dipanggil oleh kedua-dua tempat. Kalau dua tempat mentafsir "boleh dijawab" secara berbeza, pratonton menjadi pembohong.

### 3.4 Fungsi baharu di AdminServer.gs

```js
adminPreviewFormImport(token, formUrlOrId, quizId)   // → { items:[…], ringkasan:{…} }
adminCommitImport(token, quizId, items)              // → { ok, ditulis, gambarDibuang }
adminDiscardPreview(token, fileIds)                  // → { ok, dibuang }
```

`adminImportFromForm` yang sedia ada **dikekalkan** sebagai pembalut nipis (satu baris) — ia jalan pintas "import terus tanpa pratonton" yang mungkin masih berguna, dan mengeluarkannya tidak memberi apa-apa. Ia dikemas kini untuk memulangkan `dipotong` juga (§2.2).

`adminCommitImport` mengesahkan semula token, menapis `items` kepada yang ditanda, membina baris `SOALAN_COLS`, dan menulis dalam satu `setValues` di bawah `LockService` — sama seperti `ImportForm.gs:109-114`. Ia **tidak** mempercayai medan `boleh`/`amaran` dari klien; medan itu hanya untuk paparan. Yang dibaca daripada klien ialah teks soalan, pilihan, kunci, gambar, dan tanda pilih.

> Nota keselamatan: klien boleh mengarang `items` sesuka hati. Itu bukan lubang baharu — admin yang sama sudah boleh menulis apa-apa melalui `adminSaveQuestion` (`AdminServer.gs:74`). Yang penting ialah `_requireAdmin` dipanggil semula dalam commit, bukan dipercayai daripada langkah preview.

---

## 4. Aliran skrin

```
Tab Soalan
  └─ [⬇ Import dari Google Form]
       └─ kotak URL  → [Pratonton]
            └─ SKRIN PRATONTON  (menggantikan panel, bukan kotak kecil)
                 ├─ ringkasan:  12 soalan · 9 boleh dijawab · 3 ada amaran · 4 bergambar
                 ├─ [Tanda semua boleh dijawab] [Buang tanda semua]
                 ├─ kad 1…12 (macam murid nampak, jawapan betul hijau)
                 └─ [Simpan 9 soalan ke Sheet]   [Batal]
                        │                              │
                        ▼                              ▼
                  tulis → tab Soalan            buang gambar Drive
                                                 → balik tab Soalan
```

### 4.1 Rupa satu kad

Kad meminjam gaya `Index.html` (paparan murid) supaya "macam murid nampak" itu benar, bukan kiasan:

```
┌──────────────────────────────────────────┐
│ 2 / 12                    ⚠ 2 amaran     │
│ [gambar soalan, kalau ada]               │
│ Pilih alat yang sesuai untuk…            │
│                                          │
│  ☐ A. Kompas                             │
│  ☑ B. Pita pengukur                  ✓   │
│  ☐ C. Pisau                              │
│  ☑ D. Tali                           ✓   │
│                                          │
│ ⚠ Form ada 7 pilihan — pilihan ke-6 dan  │
│   ke-7 dibuang (tab Soalan hanya A–E).   │
│ ⚠ Soalan serupa sudah wujud dalam kuiz.  │
│                                          │
│ [☑ Ambil soalan ini]                     │
└──────────────────────────────────────────┘
```

- Kotak semak vs bulatan mengikut `kunci.length > 1` — sama seperti `multi` di `Quiz.gs:91`.
- Jawapan betul: latar hijau lembut + `✓`. Ini paparan admin; kunci jawapan memang sepatutnya kelihatan.
- Kad yang **tidak boleh dijawab** dilorekkan kelabu dengan jalur merah di kiri, dan mesejnya menyatakan akibat: *"Soalan ini tidak akan keluar dalam kuiz walaupun disimpan."*
- Kad `duplikat` menunjukkan baris Sheet yang bertindih: *"Sama dengan soalan di baris 34."*

### 4.2 Bar ringkasan melekat

Satu Form dijangka membawa **30–60 soalan**, jadi skrol pratonton panjang dan butang Simpan di hujung terlalu jauh. Bar ringkasan melekat di atas skrin (`position:sticky; top:0`):

```
┌──────────────────────────────────────────────────┐
│ 9 daripada 12 ditanda · 3 tidak boleh dijawab    │
│ [Tanda semua boleh]  [Buang tanda]  [Simpan 9]   │
└──────────────────────────────────────────────────┘
```

Kiraan dikemas kini setiap kali kotak ditanda. Butang Simpan membawa nombornya sendiri supaya admin tidak perlu mengira, dan **dimatikan** apabila 0 ditanda.

Dua butang pukal sahaja: **Tanda semua boleh dijawab** dan **Buang tanda semua**. Tiada penapis, tiada susunan — setiap kawalan tambahan ialah satu lagi benda untuk salah tekan.

### 4.3 Kes Form-bukan-kuiz

Bila Form bukan jenis Kuiz, **semua** soalan masuk tanpa kunci (`ImportForm.gs:135` menelan pengecualian `isCorrectAnswer`). Dengan tanda lalai di §3.3, itu bermakna 0 soalan ditanda dan skrin nampak macam jalan mati.

Ia bukan jalan mati: **tanda lalai ≠ tidak boleh disimpan**. Admin boleh menekan "Tanda semua boleh dijawab" — atau menanda kad satu per satu — dan menyimpannya tanpa kunci, kemudian mengisi jawapan melalui editor soalan sedia ada. Supaya ini jelas, pratonton memaparkan sepanduk di atas apabila **setiap** soalan membawa `tiada-kunci`:

> ⚠ Form ini bukan jenis **Kuiz**, jadi tiada kunci jawapan langsung. Anda boleh tetap menyimpan soalan-soalan ini dan mengisi jawapan kemudian di tab Soalan — tetapi kuiz **tidak akan** memaparkan soalan tanpa jawapan kepada murid.

Dalam keadaan ini butang "Tanda semua boleh dijawab" bertukar menjadi "Tanda semua" (tiada satu pun yang "boleh"), supaya butang itu tidak menjadi butang mati.

---

## 5. Gambar: masalah paling merepek dan penyelesaiannya

Gambar mesti disimpan ke Drive **semasa parse**, bukan semasa commit. Sebabnya bukan pilihan reka bentuk:

- Blok imej berasingan datang sebagai `Blob` daripada `FormApp` (`ImportForm.gs:66`) — blob itu tidak boleh dihantar ke klien dan dikembalikan.
- Gambar inline datang sebagai `contentUri` daripada Forms REST API (`ImportForm.gs:183`) yang memerlukan `ScriptApp.getOAuthToken()` untuk dibaca (`ImportForm.gs:196`). Klien tidak boleh mengambilnya sendiri.

Jadi: **parse simpan ke Drive**, dan pratonton menanggung akibatnya — kalau admin tekan Batal, fail Drive menjadi yatim dalam folder `Kuiz Pengakap - Gambar` (`ImportForm.gs:222`).

Penyelesaian: setiap item pratonton membawa `gambarFileId`. Bila admin tekan **Batal**, klien memanggil `adminDiscardPreview(token, fileIds)` yang memindahkan fail berkenaan ke sampah (`setTrashed(true)`). Bila admin **Simpan**, `adminCommitImport` membuang fail bagi item yang **tidak** ditanda. Yang tinggal hanyalah gambar yang benar-benar dipakai.

Kalau admin menutup tab tanpa menekan apa-apa, fail kekal yatim. Itu diterima — ia fail dalam folder Drive sendiri, bukan data rosak.

**Paparan dalam pratonton** menggunakan `_imageForClient` (`Quiz.gs:134`) yang menukar URL Drive → data URI, sama seperti murid. Ini mengelak isu perkongsian/CDN Drive yang sudah didokumen di sana. Kosnya: payload besar. Had yang dikenakan — kalau jumlah `gambarPapar` bagi satu pratonton melebihi **~2 MB**, item selebihnya jatuh kembali kepada URL `thumbnail?id=…` biasa (fail sudah anyone-with-link, `ImportForm.gs:218`) dan pratonton memaparkan nota kecil. `gambarPapar` **tidak pernah** dihantar balik semasa commit — commit hanya membawa `gambar` (URL) dan `gambarFileId`.

---

## 6. Fail yang disentuh

| Fail | Perubahan |
|---|---|
| `docs/quiz-gas/ImportForm.gs` | Pecah `importFormToSheet` → `_parseFormQuestions` + `_writeQuestionRows`; tambah pengesanan amaran; `_soalanDariPilihan` pulang `jumlahPilihanAsal` + `kunciDipotong` |
| `docs/quiz-gas/Quiz.gs` | Ekstrak `_soalanBolehDijawab(options, kunci)` daripada `pickQuestions`; `pickQuestions` memanggilnya |
| `docs/quiz-gas/AdminServer.gs` | Tambah `adminPreviewFormImport`, `adminCommitImport`, `adminDiscardPreview`; `adminImportFromForm` pulang `dipotong` |
| `docs/quiz-gas/Admin.html` | `doImportForm` → pratonton; fungsi baharu `renderPreview`, `previewCard`, `commitImport`, `discardPreview`; CSS kad |
| `docs/quiz-gas/README-setup.md` | Nota aliran import baharu |

Tiada perubahan pada Supabase, tiada migrasi SQL, tiada sentuhan pada app React. Ciri ini hidup sepenuhnya dalam Apps Script.

---

## 7. Ujian yang mesti lulus sebelum siap

Diuji terhadap Form sebenar, bukan andaian:

1. Form kuiz biasa, 10 soalan bulatan berkunci → 10 kad, semua ditanda, semua `boleh`, simpan → 10 baris.
2. Form dengan soalan kotak semak dua jawapan → kad memapar kotak semak, dua pilihan hijau, kunci `A,C` masuk betul.
3. Form dengan soalan 7 pilihan, betul = pilihan ke-3 → amaran `dipotong` sahaja, ditanda, `boleh` benar.
4. Form dengan soalan 7 pilihan, betul = pilihan ke-7 → amaran `kunci-dipotong`, **tidak** ditanda, kad kelabu.
5. Form **bukan** jenis Kuiz → semua kad `tiada-kunci`, tiada yang ditanda, sepanduk §4.3 muncul, butang Simpan dimatikan; tekan "Tanda semua" → semua ditanda dan boleh disimpan.
5b. Form 45 soalan → bar ringkasan kekal kelihatan sepanjang skrol dan kiraannya betul.
6. Form dengan blok imej + gambar inline → gambar betul pada soalan betul (regresi `ImportForm.gs:97-101`).
7. Import Form yang sama dua kali → kali kedua semua kad `duplikat`, tiada yang ditanda.
8. Tekan **Batal** selepas pratonton bergambar → fail Drive masuk sampah, tab Soalan tidak berubah.
9. Simpan sebahagian (5 daripada 12) → 5 baris ditulis, 7 gambar dibuang.
10. Menu Sheet `Import dari Google Form…` masih berkelakuan sama seperti sebelum ini.

---

## 8. Keputusan yang ditutup

**S1 — Duplikat dibanding dengan apa?** → **Teks soalan dalam quizId yang sama sahaja.**
Perbandingan menggunakan teks yang dinormalkan: ruang berlebihan dimampatkan, huruf kecil, tanda baca hujung dibuang. Soalan yang sama dalam kuiz lain **bukan** duplikat — dua kuiz memang boleh berkongsi bank soalan. Kad duplikat menyebut baris Sheet yang bertindih supaya admin boleh menyemaknya.

**S2 — Bolehkah admin edit dalam pratonton?** → **Tidak. Tanda-dan-simpan sahaja.**
Pembetulan dibuat selepas simpan melalui editor soalan sedia ada (`Admin.html:209`) yang sudah lengkap dengan muat naik gambar dan kotak semak kunci berbilang. Membina medan boleh-edit dalam kad bermakna editor kedua yang mesti kekal selari dengan yang pertama selama-lamanya. Kes Form-bukan-kuiz yang membimbangkan dikendalikan oleh §4.3, bukan oleh editor.

**S3 — Berapa banyak soalan satu Form?** → **30–60.**
Kad penuh dikekalkan (itu maksud "macam murid nampak"), dengan bar ringkasan melekat di §4.2 supaya butang Simpan sentiasa dalam jangkauan. Togol paparan jadual **tidak** dibina sekarang — ia ditambah hanya kalau saiz sebenar melepasi 60 dan skrol menjadi masalah nyata.

---

## 9. Yang berubah semasa pelaksanaan

Empat perkara berbeza daripada rancangan asal. Semuanya ditemui dengan menulis kod atau ujian, bukan dengan membaca semula doc.

**9.1 Amaran ketujuh: `kunci-separa`** — lihat kotak di §3.3. Rancangan menganggap jawapan betul yang dipotong sentiasa menghasilkan kunci kosong. Itu benar untuk soalan bulatan sahaja; kotak semak boleh kehilangan *sebahagian* kunci dan tetap kelihatan sihat.

**9.2 `pilihan-kurang` dinaikkan menjadi amaran sebenar.** Rancangan menyebutnya sebagai mustahil (`_soalanDariPilihan` menolak item dengan <2 pilihan). Ia masih mustahil melalui laluan Form, tetapi `_soalanBolehDijawab` memulangkannya sebagai sebab, dan membuangnya bermakna kes itu jatuh senyap. Ia kini dipapar.

**9.3 `_optionsDariBaris` diekstrak bersama `_soalanBolehDijawab`.** Bukan dirancang, tetapi tanpanya pratonton membina senarai pilihan dengan cara sendiri — dan cara yang salah senang: lajur B kosong dengan lajur C berisi mesti menghasilkan `[A, C]`, bukan `[A, B]`, kerana kunci jawapan menunjuk kepada **huruf**. Diuji ([11]).

**9.4 Kuiz yang dipilih dikekalkan selepas kembali dari pratonton.** `showTab('soalan')` melukis semula panel dari kosong, jadi dropdown melompat balik ke kuiz pertama sementara mesej berkata "5 soalan disimpan" — merujuk kuiz lain. Mekanisme `flash()` + `selected` pada `<option>` menutupnya.

### Ujian

Dua harness luar talian (dalam scratchpad, tidak dikomit — Apps Script tiada pelari ujian):

| Harness | Liputan | Keputusan |
|---|---|---|
| `uji-import.js` | Stub `FormApp`/`DriveApp`/`SpreadsheetApp`, muat `.gs` sebenar, jalankan kes §7 (1–12) | 63 lulus |
| `uji-render.js` | Jalankan `renderPreview` dengan DOM olokan; semak struktur, escaping, kiraan bar, `markAll` | 35 lulus |

Yang **belum** diuji dan hanya boleh disahkan pada Apps Script sebenar: gambar inline melalui Forms REST API (§2 `_inlineImagesFromApi` memerlukan skop OAuth), penukaran data URI oleh `_imageForClient`, dan bar melekat pada skrin telefon sebenar.
