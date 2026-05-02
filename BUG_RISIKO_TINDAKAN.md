# Bug / Risiko Perlu Tindakan

Tarikh: 2026-05-03

## Status Keutamaan 1-5

1. **Data boleh dibaca tanpa login**
   - Status: Dibetulkan dalam kod.
   - Tindakan: `GET` tanpa `authToken` kini hanya pulangkan data awam untuk skrin login, bukan rekod peserta atau profil pengguna.

2. **Endpoint admin/developer tiada authorization server-side**
   - Status: Dibetulkan dalam kod untuk lapisan pertama.
   - Tindakan: Endpoint mutasi kini memerlukan session token server-side mengikut role. Action developer/destruktif dihadkan kepada `admin` atau `developer`.

3. **Data lokasi sekolah dalam workbook rosak**
   - Status: Dibetulkan untuk workbook lokal.
   - Tindakan kod: Fungsi `repair_known_school_references` dan `repair_data_location_codes` sudah tersedia di Apps Script.
   - Tindakan data: Backup dicipta sebagai `Sistem Pendaftaran Pengakap.backup-2026-05-02T18-15-12-672Z.xlsx`.
   - Hasil repair lokal: 12 alias `ABA2082` dibetulkan, 2 sekolah ditambah, 1,859 baris lokasi dipulihkan, `locationMismatch` kini 0.
   - Nota deployment: Google Sheet live masih perlu dijalankan repair yang sama selepas backup.

4. **Developer login client-side dengan default password**
   - Status: Dibetulkan dalam kod login.
   - Tindakan: Developer login kini dipanggil ke backend melalui `login_developer`. Password default `Dev@123456` tidak lagi digunakan untuk login frontend.
   - Nota deployment: Tetapkan `DEV_PASS` atau `DEV_PASS_HASH`/`DEV_PASS_SALT` dalam Apps Script Script Properties sebelum guna developer login.

5. **Access control boleh dioverride melalui URL/localStorage**
   - Status: Dibetulkan untuk production.
   - Tindakan: Query param seperti `userAccess`, `adminAccess`, `districtAccess`, dan `maintenance` tidak lagi digunakan. `localStorage` hanya diterima dalam Vite dev mode; production perlu guna `public/config.json`.

## Baki Risiko Seterusnya

6. **Gemini API key berada di frontend**
   - Pindahkan panggilan Gemini ke backend/proxy.

7. **Output AI dirender sebagai HTML mentah**
   - Sanitise HTML atau render output AI sebagai teks/komponen React.

8. **Tiada skrip test/lint rasmi**
   - Tambah `typecheck`, `lint`, dan test minimum.

9. **Build warning `/index.css` tidak wujud**
   - Buang link atau tambah fail CSS sebenar.

10. **Bundle utama besar**
   - Pecahkan modul admin, Excel, dan AI dengan dynamic import.
