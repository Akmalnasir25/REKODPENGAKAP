# Sistem Kuiz Pengakap (GAS) — Panduan Pemasangan

Kuiz hidup di **Google Apps Script + Google Sheets/Slides**. Ia ambil data peserta
berdaftar dari **scoutnadi (Supabase)** melalui satu edge function read-only
(`quiz-eligibility`). Ikut langkah ikut urutan.

---

## A. Bahagian Supabase (sekali sahaja) — endpoint peserta

Fail: `supabase/functions/quiz-eligibility/index.ts` (sudah ada dalam repo).

1. **Set rahsia** (pilih satu rentetan rawak yang kuat sebagai kunci kongsi):
   ```bash
   supabase secrets set QUIZ_API_KEY="<rahsia-rawak-panjang>"
   ```
   (`SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` sudah sedia ada untuk projek.)

2. **Deploy** fungsi:
   ```bash
   supabase functions deploy quiz-eligibility
   ```

3. Catat dua nilai dari **Supabase Dashboard**:
   - **Function URL**: `https://<ref>.functions.supabase.co/quiz-eligibility`
   - **anon key**: Project Settings ▸ API ▸ `anon public`

> Nota: GAS menghantar `apikey`/`Authorization: Bearer <anon>` (standard Supabase) +
> header `x-quiz-api-key: <QUIZ_API_KEY>`. Kunci API itulah perlindungan sebenar.

---

## B. Google Sheet — pangkalan data kuiz

Cipta **satu Google Sheet kosong** (https://sheets.new), namakan ikut suka. **Tidak perlu
buat tab manual** — Apps Script akan bina tab automatik (lihat C). Tab yang akan dibina:
`Tetapan`, `Soalan`, `Cubaan`, `Keputusan`.

Rujukan medan (untuk pengetahuan):
- `Tetapan`: `quizId | namaProgram | badgeName | tahun | ambangLulus | bilSoalan |
  verifyMethod | slidesTemplateId | aktif`
  - `badgeName` mesti **sama** dengan nama program di scoutnadi.
  - `verifyMethod`: `ic_last4` atau `membership`. `aktif`: TRUE untuk papar.
- `Soalan`: `quizId | soalan | A | B | C | D | E | jawapan | markah | aktif`
  - `jawapan` menerima **satu atau lebih** huruf. Satu huruf (`C`) → soalan
    bulatan. Lebih daripada satu (`A,C`) → soalan **kotak semak**, dipapar
    dengan kotak semak dan dinilai **semua atau tiada**: murid mesti menanda
    tepat set itu — tak lengkap atau lebih dikira salah.
  - Bentuk yang diterima: `A,C` · `AC` · `a, c` · `A dan C`. Semuanya
    dinormalkan kepada `A,C` apabila disimpan melalui Panel Admin.
- `Cubaan`, `Keputusan`: diisi automatik oleh sistem.

---

## C. Apps Script — kod kuiz

1. Dalam Sheet: **Extensions ▸ Apps Script**.
2. Cipta fail & tampal kandungan dari folder ini:
   - **Script (.gs):** `Code.gs`, `Setup.gs`, `Eligibility.gs`, `Quiz.gs`,
     `Certificate.gs`, `ImportForm.gs`, `AdminServer.gs`, `Teacher.gs`
   - **HTML** (nama mesti tepat): `Index` ← `Index.html`, `Admin` ← `Admin.html`,
     `Guru` ← `Guru.html`.
   > Nota: nama fail script & HTML mesti UNIK. Fail HTML wajib `Index`/`Admin`/`Guru`;
   > sebab itu fail script dinamakan `AdminServer` (bukan `Admin`) untuk elak pertembungan.
3. **Simpan**, muat semula (reload) Sheet → menu **Kuiz** muncul →
   **Kuiz ▸ ① Bina / Semak Tab** (atau Run fungsi `setupSheets` di editor) untuk bina
   keempat-empat tab automatik.
3. **Advanced Drive Service** (untuk import Word sahaja): Services ▸ tambah **Drive API**.

### Gambar inline (hanya jika gambar dilekat DI DALAM kotak soalan)

Tanpa langkah ini, import tetap berfungsi; cuma gambar **inline** tidak masuk.
Blok imej berasingan tidak terjejas langsung.

> **Skop OAuth tidak perlu diubah.** Versi awal dokumen ini mendakwa
> `forms.body.readonly` wajib ditambah. Itu **salah** — Forms API v1 `forms.get`
> menerima skop `drive`, yang `DriveApp` sudah minta secara automatik. Disahkan
> dengan **Kuiz ▸ Diagnos gambar Form** pada projek sebenar: skop lulus, yang
> gagal ialah API. Jangan tambah `oauthScopes` secara manual — sebaik ia wujud,
> inferens automatik Apps Script MATI, dan senarai yang tak lengkap akan
> memecahkan Drive, Slides atau Docs di tempat lain.

Yang sebenarnya perlu: **projek GCP standard** dengan Forms API diaktifkan.
Projek GCP **lalai** tidak boleh digunakan — ia diurus Google dan tiada sesiapa,
termasuk pemilik skrip, boleh membuka konsolnya (`resourcemanager.projects.get`
sentiasa ditolak).

1. `console.cloud.google.com` ▸ pilih projek sedia ada, **atau** cipta baharu.
   Akaun mesti **Owner** pada projek itu — peranan Editor tidak cukup untuk
   mengaktifkan API, dan kegagalannya muncul jauh kemudian sebagai
   *"Permission denied while enabling APIs"*.
2. **APIs & Services ▸ Library** ▸ aktifkan **SEMUA** yang berikut:

   | API | Diperlukan oleh |
   |---|---|
   | **Google Drive API** | `DriveApp` — simpan gambar soalan & sijil |
   | **Google Sheets API** | `SpreadsheetApp` — semua tab kuiz |
   | **Google Forms API** | import soalan + gambar inline |
   | **Google Docs API** | `DocumentApp` — template sijil & import Word |
   | **Google Slides API** | `SlidesApp` — template sijil |

   > ⚠ **Ini bahagian yang paling mudah tersilap.** Projek GCP **lalai** datang
   > dengan semua API ini sudah aktif, jadi ia tidak pernah menjadi isu sebelum
   > ini. Sebaik projek standard dilampirkan, tiada satu pun aktif secara
   > automatik — dan Apps Script **tidak** memberitahu semasa Akmal menukar
   > projek. Ia gagal kemudian, semasa kod menyentuh perkhidmatan itu:
   > *"Permission denied while enabling APIs: drive for GCP project …"*
   >
   > Mengaktifkan Forms API sahaja membetulkan pengesanan gambar tetapi
   > memecahkan **penyimpanan** gambar — dan mesej ralatnya tidak langsung
   > menyebut Google Cloud, jadi ia kelihatan seperti masalah Drive penuh.
3. **APIs & Services ▸ OAuth consent screen** ▸ isi nama app + emel sokongan.
4. ⚠ Tekan **PUBLISH APP** supaya status menjadi **In production**.
   Dalam mod *Testing*, token luput setiap **7 hari** dan kuiz mati seminggu
   sekali sehingga di-authorize semula.
5. Salin **Project number** ▸ Apps Script ▸ **Project Settings ▸ Google Cloud
   Platform (GCP) Project ▸ Change project** ▸ tampal ▸ Set project.
6. Jalankan **Kuiz ▸ Diagnos gambar Form…** sekali; Google minta kebenaran
   baharu. Terima (skrin "Google hasn't verified this app" ▸ **Advanced ▸
   Go to …** — normal untuk app sendiri).

Sahkan dengan **Kuiz ▸ Diagnos gambar Form…**:

```
FORMS API: HTTP 200
  gambar INLINE dijumpai: 5
```

`HTTP 403` + `SERVICE_DISABLED` bermakna langkah 2 atau 5 belum selesai.

> Bila Forms API tidak menjawab, `_inlineImagesFromApi` tidak lagi gagal secara
> senyap: pratonton import memaparkan sepanduk yang menamakan puncanya. Sebelum
> ini kad keluar tanpa gambar dan tiada apa membezakannya daripada Form yang
> memang tiada gambar.
4. **Set Script Properties**: Project Settings ▸ Script Properties, tambah:
   - `SUPABASE_FN_URL` = function URL (langkah A3)
   - `SUPABASE_ANON_KEY` = anon key (langkah A3)
   - `QUIZ_API_KEY` = nilai sama seperti langkah A1
   - `LOGO_URL` = URL imej logo Kinta Utara (lihat di bawah) — boleh dikosongkan dahulu.
   (Atau guna menu **Kuiz ▸ Set Script Properties** selepas Sheet dibuka semula.)

### Logo header (Kinta Utara)
Header sistem memaparkan logo + "PERSEKUTUAN PENGAKAP MALAYSIA · Negeri Perak ·
Daerah Kinta Utara". Untuk paparkan logo:
1. Muat naik `logo-kinta-utara.png` (ada dalam folder ini) ke Google Drive.
2. Klik kanan ▸ Share ▸ **Anyone with the link** (Viewer).
3. Ambil ID fail dari URL `.../file/d/<ID>/view`, dan set `LOGO_URL` =
   `https://lh3.googleusercontent.com/d/<ID>` (paparan imej terus).
Jika `LOGO_URL` kosong, header tetap papar teks tanpa logo.

---

## D. Sijil — template Google Docs ATAU Slides

Sistem auto-kesan jenis template (Google **Docs** atau **Slides**).

1. Buka template sijil anda (Doc/Slides). Reka format ikut kehendak.
2. Letak teks **placeholder** di tempat nilai patut muncul (taip betul-betul):
   - `<<NAMA PENUH>>` — nama penuh calon
   - `<<IC>>` — nombor kad pengenalan
   - `<<NO AHLI>>` — nombor keahlian
   - `<<SEKOLAH>>` — nama sekolah
   - `<<MARKAH>>` — keputusan (cth `9/10 (90%)`)
   - (Pilihan: `{{program}}`, `{{tarikh}}`, `{{no_sijil}}`)
   > IC, No. Ahli & nama sekolah diambil dari scoutnadi semasa jana sijil — jadi
   > tepat & terkini, tanpa disimpan dalam Sheet kuiz.
3. Salin **ID fail** dari URL → letak dalam lajur `slidesTemplateId` pada tab `Tetapan`:
   - Google Doc: `.../document/d/<ID>/edit`
   - Google Slides: `.../presentation/d/<ID>/edit`
4. Pastikan fail template dimiliki / boleh diakses oleh akaun Google yang sama dengan
   skrip (atau dikongsi kepadanya).

> Contoh: template Doc tuan `1B4frK6QdTcAbRlfZkdb4ByxVM6198emwYvC9RzCtKc8` —
> tambah 4 placeholder di atas, kemudian letak ID itu di `slidesTemplateId`.

---

## E. Import soalan

Ada **dua jalan** import dari Google Form, dan ia berkelakuan berbeza:

| Jalan | Kelakuan |
|---|---|
| **Panel Admin ▸ Soalan ▸ ⬇ Import dari Google Form** | **Pratonton dahulu.** Soalan dipapar seperti murid akan nampak, dengan amaran per soalan. Tiada apa-apa ditulis sehingga tuan tekan **Simpan**. Ini jalan yang disyorkan. |
| **Menu Sheet ▸ Kuiz ▸ Import dari Google Form…** | **Terus tulis** semua soalan, termasuk yang rosak. Cepat, tetapi tiada jalan batal. |

Kedua-duanya menerima **URL EDIT** (`.../forms/d/<ID>/edit`) atau ID sahaja. Jika Form
ialah kuiz berkunci jawapan, lajur Jawapan diisi automatik; jika tidak, isi A–E sendiri.

### Pratonton (panel admin)

Selepas membaca Form, setiap soalan dipapar sebagai kad dengan kotak semak **"Ambil
soalan ini"**. Soalan yang bermasalah **tidak ditanda secara lalai** — tuan masih boleh
menandanya sendiri kalau mahu menyimpannya dan membetulkannya kemudian.

| Amaran | Maksudnya |
|---|---|
| Form ada lebih 5 pilihan | Pilihan ke-6 dan seterusnya dibuang (tab `Soalan` hanya A–E). Soalan masih boleh dijawab. |
| Jawapan betul ialah pilihan ke-6+ | Kunci hilang sepenuhnya. **Soalan tidak akan keluar dalam kuiz.** |
| Sebahagian jawapan betul dipotong | Kotak semak sahaja. Kunci **tidak lengkap** — murid yang jawab betul akan ditanda salah. Paling bahaya. |
| Tiada kunci jawapan | Form bukan jenis **Kuiz**. Soalan tidak akan keluar sehingga jawapan diisi. |
| Soalan serupa sudah wujud | Import berulang. Menyimpannya menggandakan soalan. |
| Gambar gagal disimpan | Form ada gambar untuk soalan itu tetapi ia tidak dapat diambil. |

Tekan **Batal** dan tiada apa-apa disimpan — gambar yang sempat dimuat turun ke Drive
turut dibuang. Tekan **Simpan** dan hanya soalan yang ditanda ditulis; gambar bagi
soalan yang ditolak dibuang.

> Kalau **semua** soalan menunjukkan "tiada kunci jawapan", Form itu bukan jenis Kuiz.
> Tuan boleh tekan **Tanda semua** dan menyimpannya, kemudian isi jawapan di tab
> `Soalan` atau melalui **Panel Admin ▸ Soalan ▸ Edit**.

### Jenis soalan yang diimport
| Jenis di Google Form | Hasil dalam tab `Soalan` |
|---|---|
| Aneka pilihan (bulatan) | satu huruf, cth `C` |
| **Kotak semak** | huruf berbilang, cth `A,C` |
| Menu jatuh (dropdown) | satu huruf, cth `C` |
| Grid (kotak semak / aneka pilihan) | **tidak disokong** — dilangkau |

> Had **5 pilihan** setiap soalan, kerana tab `Soalan` hanya ada lajur A–E.
> Soalan dengan 6 pilihan atau lebih akan dipotong, dan import akan memberi
> amaran berapa soalan terjejas. Semak soalan tersebut sebelum kuiz dibuka.
> Pratonton panel admin menunjukkan soalan **mana** yang terjejas, dan yang lebih
> penting, sama ada **jawapan betulnya** yang dipotong.

### Gambar pada soalan
- **Blok imej berasingan** (toolbar Form "Tambah imej" 🖼️, sebelum soalan) →
  **auto-import**: disimpan ke folder Drive "Kuiz Pengakap - Gambar" & dikaitkan dengan
  soalan selepasnya (lajur `gambar`).
- **Gambar inline** (lekat terus pada soalan) → `FormApp` tidak boleh membacanya
  (had Google). Sistem cuba mengambilnya melalui **Forms REST API**; kalau API itu
  belum diaktifkan, import tetap berjalan tanpa gambar inline — **tiada ralat**,
  jadi semak lajur `gambar` selepas import kalau tuan menjangkakannya.
  Untuk mengaktifkan, lihat "Gambar inline" di §C.
- **Sandaran manual** (sentiasa berfungsi): **Panel Admin ▸ Soalan ▸ Edit ▸
  "Gambar Soalan" ▸ pilih fail imej** — sistem muat naik ke Drive & isi URL
  automatik. (Atau tampal URL sendiri pada lajur `gambar`.)
- **Import dari Word (.docx)** — muat naik .docx ke Drive, beri ID fail. Format:
  soalan bernombor `1.`, pilihan `A.`–`E.`, jawapan ditanda `*` atau baris `Jawapan: C`.
- **CSV/Excel** — guna `File ▸ Import` Google Sheets terus ke tab `Soalan`
  (lihat `soalan-template.csv`).
- **Manual** — taip terus dalam tab `Soalan`.

---

## F. Deploy web app (URL untuk pelajar & admin)

1. Apps Script ▸ **Deploy ▸ New deployment ▸ Web app**.
2. **Execute as:** Me (pemilik).  **Who has access:** Anyone.
3. Salin **Web app URL** — **cukup kongsi SATU link ini** (untuk pelajar):
   - **Pelajar** → guna URL itu terus.
   - **Guru & Admin** → ada pautan halus **"🔑 Log Masuk Guru · Admin"** di bawah
     paparan pelajar. (Atau terus: `?page=guru` / `?page=admin`.)
   - Pautan footer berfungsi automatik kerana `Code.gs` menghantar
     `ScriptApp.getService().getUrl()` ke paparan.

> Setiap kali tukar kod, **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New**.

### Panel Admin (web)
- Buka `…/exec?page=admin` → **log masuk guna ID & kata laluan admin daerah scoutnadi**
  anda (disahkan di Supabase melalui `quiz-eligibility` → `admin_login`; peranan
  dibenarkan: `daerah_admin`, `negeri_admin`, `admin`, `developer`).
- Tab **Kuiz**: tambah/edit program, ambang lulus, bil. soalan, kaedah sahkan, ID
  template sijil, aktif/tidak.
- Tab **Soalan**: tambah/edit/padam soalan, atau **Import dari Google Form** dengan
  pratonton (lihat §E).
  - **Padam pukal**: tanda kotak di sebelah kiri setiap soalan (atau kotak di kepala
    jadual untuk memilih semua), kemudian **Padam N soalan**. Butang perlu ditekan
    **dua kali** untuk mengesahkan — tekanan pertama menukarnya kepada *"Sah padam N
    soalan?"* selama 4 saat.
  - Kalau senarai di skrin sudah lapuk (sesi lain memadam atau menyunting soalan
    dalam masa yang sama), padaman **dibatalkan sepenuhnya** dan tiada apa-apa
    dipadam. Muat semula senarai dan cuba lagi. Ini disengajakan: nombor baris
    beranjak apabila baris dipadam, dan padam pukal yang teranjak memusnahkan
    puluhan soalan yang salah, bukan satu.
- Tab **Keputusan**: lihat markah/lulus/sijil setiap peserta.
- Pengubahan tetap menulis ke tab Sheet yang sama — jadi tuan boleh guna panel **atau**
  edit Sheet terus, ikut keselesaan.

### Semakan Guru (web)
- Buka `…/exec?page=guru` → guru **log masuk guna akaun SEKOLAH scoutnadi** (email +
  kata laluan yang sama untuk daftar peserta; disahkan melalui `teacher_login`).
- Guru hanya nampak **murid sekolahnya sendiri** (auto-tapis ikut sekolah akaun).
- Untuk murid yang **LULUS**, guru boleh **Cetak Semula Sijil** bila-bila masa — sesuai
  jika murid lupa cetak / tutup browser. Sijil dijana semula dari data tersimpan
  (nama + no. sijil) tanpa murid perlu hadir.

> **Pratonton tanpa deploy:** buka `preview.html` (pelajar), `admin-preview.html`
> (login demo: kata laluan `admin`), dan `guru-preview.html` (login demo: kata laluan
> `guru`) untuk lihat rupa/aliran dahulu.

---

## G. Uji hujung-ke-hujung

1. Buka URL → pilih program → pilih sekolah → nama peserta berdaftar muncul.
2. Sahkan dengan 4 digit akhir IC betul (uji juga salah → ditolak).
3. Jawab markah rendah → **Cuba Lagi**; jawab cukup → **LULUS** → **Claim Sijil** → PDF
   dengan nama betul atas template anda.
4. Semak tab `Cubaan` & `Keputusan` terisi.

## Had & prestasi (beban 30–100 serentak)
- Tulisan guna **LockService**; klien ada **retry automatik**.
- Akaun Google biasa: ~30 pelaksanaan serentak + kuota harian UrlFetch. Untuk puncak
  tinggi berterusan, guna **Google Workspace** atau pertimbang versi Supabase.
