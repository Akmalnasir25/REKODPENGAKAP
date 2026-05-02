# Audit Tindakan Segera

Tarikh audit: 2026-05-03  
Skop: Kod frontend React/TypeScript, Apps Script backend, dan workbook `Sistem Pendaftaran Pengakap.xlsx`.

## Status Ringkas

Sistem belum selamat untuk dianggap stabil production kerana terdapat mismatch kolum Google Sheet, endpoint backend kritikal tanpa authorization server-side yang konsisten, dan TypeScript compile error. Keutamaan utama ialah betulkan backend Apps Script dan data sheet sebelum tambah feature baru.

## Dapatan Daripada Workbook Sebenar

Fail dibaca: `Sistem Pendaftaran Pengakap.xlsx`

Sheet yang dijumpai:

- `USERS`
- `DATA`
- `SCHOOLS`
- `NEGERI`
- `DAERAH`
- `ADMINS`
- `USER_PROFILES`
- `BADGES`
- `Config`
- `DATA_OLD 1`
- `DATA_OLD`
- `SCHOOLS_OLD`
- `USER_PROFILES_OLD`

### Header Sheet Semasa

`DATA`

```text
Date | School | SchoolCode | NegeriCode | DaerahCode | Badge | Student | Gender | Race | ID | IC | SPhone | Role | Remarks
```

`SCHOOLS`

```text
SchoolName | SchoolCode | NegeriCode | DaerahCode | AllowStud | AllowAsst | AllowExam | LockedBadges | ApprovedBadges | CreatedDate
```

`USERS`

```text
SchoolName | SchoolCode | NegeriCode | DaerahCode | PasswordHash | Salt | SecretKey | CreatedDate
```

`USER_PROFILES`

```text
SchoolCode | SchoolName | Phone | GroupNumber | PrincipalName | PrincipalPhone | LeaderName | LeaderPhone | LeaderIC | LeaderGender | LeaderMembershipId | LeaderRace | Remarks | LastUpdated
```

`BADGES`

```text
BADGE_NAME | IS_OPEN
```

## Isu Kritikal

### 1. Kolum `NegeriCode` dan `DaerahCode` dalam `DATA` rosak

Semua 1,859 rekod `DATA` mempunyai `NegeriCode` yang salah. Nilai yang ada ialah `Keris Perak` atau `Keris Emas`, bukan kod negeri seperti `PRK`.

Semua 1,859 rekod `DATA` mempunyai `DaerahCode` kosong.

Contoh masalah:

```text
SchoolCode: ABB2082
NegeriCode: Keris Perak
DaerahCode: kosong
Badge: Keris Perak
```

Kesan:

- Admin negeri/daerah tidak boleh filter data dengan tepat.
- Analitik mengikut hierarki negeri/daerah akan salah.
- Akses berperingkat boleh kelihatan kosong atau bocor data bergantung kepada fallback frontend/backend.

Tindakan segera:

- Pulihkan `DATA.NegeriCode` dan `DATA.DaerahCode` daripada sheet `SCHOOLS` berdasarkan `SchoolCode`.
- 1,775 daripada 1,859 rekod boleh dipadankan terus.
- 84 rekod tidak boleh dipadankan sehingga kod sekolah ini disemak:
  - `ABA 2073`
  - `ABA2082`
  - `ABA2053`
  - `ABA2072`

### 2. `updateParticipantId` menulis ke kolum salah

Dalam `apps_script_secure.gs`, `updateParticipantId()` menulis `newId` ke kolum 8. Berdasarkan header `DATA`, kolum 8 ialah `Gender`, bukan `ID`.

Kesan:

- Bila pengguna edit No. Keahlian, sistem boleh menukar jantina peserta.
- Data peserta menjadi rosak tanpa disedari.

Tindakan segera:

- Tukar write target kepada kolum `ID`, iaitu kolum 10 dalam sheet `DATA`.
- Tambah validasi `rowIndex` dan semak `schoolCode` sebelum update.

### 3. Fungsi padam rekod guna perbandingan kolum salah

Frontend `deleteSubmission()` tidak menghantar `rowIndex`; backend fallback `deleteData()` membandingkan kolum yang salah.

Kesan:

- Rekod mungkin gagal dipadam.
- Risiko padam rekod salah jika nilai kebetulan sepadan.

Tindakan segera:

- Hantar `rowIndex` dari frontend ke backend untuk delete.
- Backend perlu verify `rowIndex`, `schoolCode`, `student`, `ID`, dan `IC` sebelum delete.
- Betulkan fallback supaya banding kolum `ID` dan `Student`, bukan `Gender`/`DaerahCode`.

### 4. Lock/approve lencana menulis ke kolum permission

Sheet `SCHOOLS` meletakkan:

- `LockedBadges` di kolum 8
- `ApprovedBadges` di kolum 9

Tetapi `updateSchoolBadgeStatus()` dalam Apps Script baca/tulis kolum 5 dan 6, iaitu `AllowStud` dan `AllowAsst`.

Kesan:

- Final submit sekolah boleh merosakkan permission.
- Admin approve/unlock tidak mengemaskini kolum lock sebenar.
- Status pendaftaran boleh tidak konsisten.

Tindakan segera:

- Betulkan `updateSchoolBadgeStatus()` kepada kolum 8 dan 9.
- Semak semula semua row `SCHOOLS` selepas fix untuk pastikan permission tidak pernah tertulis nilai lencana.

### 5. Banyak endpoint backend kritikal tiada authorization server-side

CSRF hanya digunakan pada sebahagian action. Banyak action admin/developer terus boleh dipanggil jika seseorang tahu Apps Script URL.

Contoh action berisiko:

- `change_admin_password`
- `migrate_year`
- `add_school`
- `delete_school`
- `update_school_permission`
- `toggle_school_edit_batch`
- `lock_school_badge`
- `unlock_school_badge`
- `approve_school_badge`
- `setup_database`
- `clear_sheet_data`
- `add_badge_type`
- `delete_badge_type`
- `toggle_registration`
- `add_negeri`
- `delete_negeri`
- `add_admin`
- `delete_admin`

Kesan:

- Data boleh dipadam/diubah melalui POST manual.
- Password admin boleh ditukar tanpa session admin yang sah jika endpoint diketahui.
- Kawalan UI sahaja tidak cukup.

Tindakan segera:

- Wujudkan token session server-side selepas login admin/regional/developer.
- Semua endpoint mutasi wajib semak role dan scope di backend.
- Pisahkan capability:
  - user sekolah
  - admin daerah
  - admin negeri
  - developer
- Jangan bergantung pada `localStorage` atau query string sebagai authorization.

### 6. Developer login tidak selamat

Developer login frontend menggunakan username `DEVELOPER` dan password default `Dev@123456` dari `localStorage`.

Kesan:

- Ini hanya kawalan frontend.
- Mudah diteka jika default password belum ditukar.
- Tidak patut digunakan untuk kawalan production.

Tindakan segera:

- Buang developer auth daripada frontend production.
- Pindahkan developer/admin session ke backend.
- Wajibkan password kuat dan rotation.
- Elakkan default password dalam kod.

### 7. Schema `USER_PROFILES` bercanggah antara workbook dan `setupDatabase()`

Workbook semasa guna format 14 kolum:

```text
SchoolCode | SchoolName | Phone | GroupNumber | PrincipalName | PrincipalPhone | LeaderName | LeaderPhone | LeaderIC | LeaderGender | LeaderMembershipId | LeaderRace | Remarks | LastUpdated
```

Tetapi `setupDatabase()` dalam Apps Script boleh cipta format 16 kolum dengan `NegeriCode` dan `DaerahCode`.

Kesan:

- Jika database baru dijana, pembacaan profil boleh tersalah offset.
- Profil guru/pemimpin/principal boleh bercampur lajur.

Tindakan segera:

- Pilih satu schema rasmi.
- Kemas kini semua fungsi baca/tulis `USER_PROFILES`.
- Jika mahu tambah `NegeriCode`/`DaerahCode`, buat migration eksplisit dan update frontend/backend bersama.

### 8. `BADGES` tiada lajur `Deadline`

Workbook semasa `BADGES` hanya ada:

```text
BADGE_NAME | IS_OPEN
```

Kod backend/frontend ada sokongan `deadline`.

Kesan:

- Fungsi deadline tidak boleh bekerja penuh.
- UI notifikasi tarikh tutup mungkin kosong atau tidak tepat.

Tindakan segera:

- Tambah lajur `Deadline` atau buang sementara feature deadline.
- Seragamkan nama header kepada satu format, contohnya `BadgeName | IsOpen | Deadline`.

### 9. TypeScript compile gagal

Arahan `npx tsc --noEmit` gagal dengan 15 error.

Kategori error:

- Props `AdminHistory` tidak lengkap di `AdminDaerahPanel` dan `AdminNegeriPanel`.
- Props `AdminDashboard` tidak sepadan kerana `badges` dihantar tetapi interface tidak menerima.
- `AdminDashboard` guna field `principalName`, `leader`, `groupNumber` yang tiada dalam `SubmissionData`.
- `AdminMigration` masukkan `groupNumber` ke `LeaderInfo` tetapi type tidak benarkan.

Kesan:

- Build/type safety tidak bersih.
- Refactor akan berisiko kerana kontrak data tidak jelas.

Tindakan segera:

- Betulkan interface `SubmissionData` dan `LeaderInfo` mengikut data sebenar.
- Atau ubah komponen supaya ambil field profil daripada `UserProfile`, bukan `SubmissionData`.
- Tambah skrip `typecheck` dalam `package.json`.

### 10. Gemini API key berada di frontend

`vite.config.ts` inject `GEMINI_API_KEY` ke bundle browser. `geminiService.ts` panggil Gemini terus dari client.

Kesan:

- API key boleh diekstrak daripada browser.
- Risiko penyalahgunaan key dan kos.

Tindakan segera:

- Pindahkan panggilan Gemini ke backend/proxy.
- Jangan expose API key dalam client bundle.
- Sementara itu, pertimbangkan disable feature AI di production.

### 11. Output AI dirender sebagai HTML mentah

Komponen menggunakan `dangerouslySetInnerHTML` untuk output AI.

Kesan:

- Risiko XSS jika output tidak disanitise.
- Prompt bukan kawalan keselamatan.

Tindakan segera:

- Sanitise HTML dengan library yang sesuai.
- Atau tukar output AI kepada teks/JSON dan render sebagai React element biasa.

### 12. Access control boleh dioverride melalui URL

Frontend menerima query param seperti:

- `userAccess`
- `adminAccess`
- `districtAccess`
- `maintenance`

Kesan:

- Sesuai untuk development, tetapi berisiko jika dianggap kawalan production.
- Pengguna boleh mengubah paparan akses dari URL.

Tindakan segera:

- Hadkan override ini kepada dev mode sahaja.
- Untuk production, baca status akses daripada backend/config yang tidak boleh dioverride oleh user biasa.

## Isu Sederhana Tetapi Perlu Dibuat Selepas Kritikal

- `tsconfig.json` belum `strict`.
- `allowJs` masih aktif.
- Tiada skrip `test`, `typecheck`, atau lint dalam `package.json`.
- `index.html` memuat Tailwind CDN dan SheetJS CDN, walaupun `xlsx` ada dalam dependency.
- Banyak operasi kritikal masih guna `alert`, `confirm`, dan `prompt`.
- Response API tidak seragam, ada `{ status: 'success' }` dan ada `{ success: true }`.
- Banyak penggunaan `any`, menyebabkan mismatch schema mudah terlepas.

## Cadangan Urutan Tindakan

1. Backup workbook Google Sheet semasa.
2. Betulkan Apps Script untuk kolum `DATA`, `SCHOOLS`, dan endpoint delete/update/lock.
3. Deploy Apps Script versi baru.
4. Buat migration data:
   - Pulihkan `DATA.NegeriCode`
   - Pulihkan `DATA.DaerahCode`
   - Selesaikan 4 kod sekolah yang tidak padan
5. Tambah authorization server-side untuk semua endpoint mutasi.
6. Betulkan TypeScript compile error.
7. Seragamkan schema `USER_PROFILES` dan `BADGES`.
8. Pindahkan Gemini API ke backend atau disable sementara.
9. Tambah `typecheck` dan test minimum.
10. Selepas semua ini stabil, baru teruskan penambahbaikan UI/UX.

## Nota Penting

Jangan buat pembetulan data secara manual terus di sheet live tanpa backup. Isu kolum melibatkan data peserta yang banyak dan perlu dibuat dengan skrip migration yang boleh diaudit.
