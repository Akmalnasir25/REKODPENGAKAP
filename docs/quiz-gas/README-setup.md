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

Buka semula Sheet → menu **Kuiz** muncul:
- **Import dari Google Form** — tampal **URL EDIT** (`.../forms/d/<ID>/edit`) atau ID +
  `quizId`. Jika Form ialah kuiz berkunci jawapan, lajur Jawapan diisi automatik; jika
  tidak, isi A–E sendiri.

### Gambar pada soalan
- **Blok imej berasingan** (toolbar Form "Tambah imej" 🖼️, sebelum soalan) →
  **auto-import**: disimpan ke folder Drive "Kuiz Pengakap - Gambar" & dikaitkan dengan
  soalan selepasnya (lajur `gambar`).
- **Gambar inline** (lekat terus pada soalan) → tidak boleh dibaca FormApp (had Google).
  Cara mudah: **Panel Admin ▸ Soalan ▸ Edit ▸ "Gambar Soalan" ▸ pilih fail imej** —
  sistem muat naik ke Drive ("Kuiz Pengakap - Gambar") & isi URL automatik. Kuiz akan
  paparkannya. (Atau tampal URL sendiri pada lajur `gambar`.)
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
- Tab **Soalan**: tambah/edit/padam soalan, atau **Import dari Google Form**.
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
