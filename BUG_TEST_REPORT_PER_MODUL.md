# Laporan Semakan Bug & Test Setiap Modul

Tarikh audit: 2026-05-07
Projek: Sistem Pengurusan Data Pengakap

## Ringkasan Build Test

Command dijalankan:

```bash
npm run build
```

Keputusan:

- Status: LULUS
- Vite berjaya build production.
- Amaran ditemui:
  - `/index.css doesn't exist at build time` — rujukan CSS wujud dalam HTML tetapi fail tidak wujud semasa build.
  - Bundle JS besar: `assets/index-*.js` sekitar 1,024 kB, melebihi warning limit 500 kB.

Cadangan:

- Buang rujukan `/index.css` jika tidak digunakan, atau cipta fail tersebut.
- Buat code splitting/lazy loading untuk dashboard besar seperti Admin/Developer.

---

# 1. Isu Kritikal / High Priority

## Critical

| Modul | Isu | Risiko |
|---|---|---|
| `components/BadgeModal.tsx` | Guna `dangerouslySetInnerHTML` untuk content AI/HTML tanpa sanitization | XSS — script jahat boleh berjalan dalam browser user |
| `apps_script_secure.gs` | Developer actions dibenarkan untuk role `admin` | Privilege escalation — admin biasa boleh jalankan fungsi developer |
| `apps_script_secure.gs` | Migrasi password USERS sheet tidak ikut schema baharu | Data akaun user boleh rosak |
| `apps_script_secure.gs` | Backend tidak enforce permission submit form | User boleh bypass frontend dan submit walaupun badge/registration locked |
| `apps_script_secure.gs` | `clearSheetData` boleh clear arbitrary sheet | Risiko kehilangan data besar |
| `components/DeveloperPanel.tsx`, `DeveloperAdminDashboard.tsx` | Access control disimpan dalam localStorage | User boleh manipulasi access control melalui DevTools |

## High

| Modul | Isu | Risiko |
|---|---|---|
| `AuthScreen.tsx` | Developer mode render duplicate username/password input | UI login keliru/rosak |
| `UserDashboard.tsx` | Rambu import crash bila senarai filtered kosong | Runtime error |
| `UserDashboard.tsx` | SearchFilter dalam archive no-op | Search tidak berfungsi |
| `UserForm.tsx` | Cache localStorage leader info boleh bocor antara user | Data sekolah/user lama terpapar kepada user lain |
| `UserForm.tsx` | Permission tab boleh loop jika semua permission false | Render loop / UX rosak |
| `UserProfilePage.tsx` | School code editable | Profile association boleh rosak |
| `UserProfilePage.tsx` | IC onChange update state dua kali dengan stale state | Gender auto-detect boleh gagal |
| `AdminPanel.tsx` | Clear data global tanpa scope | Admin boleh padam semua data |
| `AdminPanel.tsx`, `AdminNegeriPanel.tsx`, `AdminDaerahPanel.tsx` | Export guna unfiltered data | Admin daerah/negeri boleh export data luar scope |
| `AdminNegeriPanel.tsx`, `AdminDaerahPanel.tsx` | Toggle registration global | Admin regional boleh tutup sistem seluruh negara |
| `DeveloperDashboard.tsx` | State form dan filter berkongsi variable | Form value berubah bila filter berubah |
| `AdminMigration.tsx` | Import boleh proceed dengan mapping salah / placeholder `XXX` | Data corrupted masuk production |
| `AdminMigration.tsx` | Tiada duplicate checking dan tiada transaction | Import/migration boleh duplicate/partial |
| `ExportButton.tsx` | Formula injection ke Excel | Risiko formula malicious bila buka Excel |
| `apps_script_secure.gs` | CSRF tidak apply pada banyak admin action | Risiko CSRF destructive action |
| `apps_script_secure.gs` | Secret key reset password plaintext | Recovery credential bocor jika sheet diakses |
| `apps_script_secure.gs` | Tiada rate limit reset password | Brute force secret key |
| `apps_script_secure.gs` | Lock acquisition result diabaikan | Race condition/data corruption |
| `apps_script_secure.gs` | Delete loops mula dari header row | Header sheet boleh terpadam |
| `apps_script_secure.gs` | Regional admin actions tidak enforce scope | Admin daerah/negeri boleh ubah data luar scope |
| `apps_script_secure.gs` | Direct write ke Google Sheets tanpa formula sanitization | Spreadsheet formula injection |

---

# 2. Test Checklist Setiap Modul

## A. Authentication Module — `AuthScreen.tsx`

### Test Login Sekolah
- [ ] Login dengan school code/password betul.
- [ ] Login dengan password salah.
- [ ] Login school code kosong.
- [ ] Semak rate limit selepas 5 cubaan gagal.
- [ ] Pastikan session disimpan dan restore selepas refresh.

### Test Register
- [ ] Register password lemah — mesti reject.
- [ ] Register password kuat — mesti berjaya.
- [ ] Register dengan school code sedia ada.
- [ ] Register dengan school code tidak wujud.
- [ ] Confirm password tidak sama — mesti reject.

### Test Forgot Password
- [ ] Reset password dengan secret key betul.
- [ ] Reset password dengan secret key salah.
- [ ] Reset password baru lemah — mesti reject.

### Test Admin/Developer Login
- [ ] Admin Negeri login berjaya.
- [ ] Admin Daerah login berjaya.
- [ ] Developer login berjaya.
- [ ] Developer mode tidak boleh paparkan duplicate input username/password.
- [ ] Rate limit juga perlu cover developer login.

---

## B. Main App & Session — `App.tsx`

- [ ] App load config daripada `/config.json`.
- [ ] Jika config tiada, dev mode guna localStorage.
- [ ] Maintenance mode paparkan `MaintenancePage` kepada user biasa.
- [ ] Admin/developer masih boleh access semasa maintenance.
- [ ] Session timeout selepas 30 minit inactivity.
- [ ] Logout buang semua session keys.
- [ ] Connection error banner muncul bila backend gagal.
- [ ] Fallback ke `DEFAULT_SERVER_URL` bila local URL gagal.

---

## C. User Dashboard — `UserDashboard.tsx`

- [ ] Data sekolah sendiri sahaja dipaparkan.
- [ ] Data tahun semasa dipaparkan betul.
- [ ] Archive filter/search berfungsi.
- [ ] Rekod approved/locked tidak boleh edit/delete.
- [ ] Rekod lebih 30 hari tidak boleh edit/delete.
- [ ] Rambu candidate list tidak crash jika kosong.
- [ ] Import candidate tidak crash bila selected list mismatch.
- [ ] Banner hint tidak duplicate.
- [ ] Password change ikut polisi password kuat.
- [ ] Profile modal update dan refresh data.

---

## D. User Form — `UserForm.tsx`

- [ ] Form submit peserta minimum required field.
- [ ] IC auto gender detect selepas IC lengkap sahaja.
- [ ] Duplicate IC tahun/badge sama direject.
- [ ] Submit tidak dibenarkan jika badge locked/closed.
- [ ] Tab peserta/penolong/penguji ikut permission sekolah.
- [ ] Jika semua permission false, paparkan mesej tanpa loop.
- [ ] Cache leader info scoped per school code.
- [ ] Assistant/examiner boleh tambah dan buang dengan betul.
- [ ] Submit dengan CSRF token valid.
- [ ] Submit gagal bila CSRF token invalid/missing.

---

## E. User Profile — `UserProfilePage.tsx`

- [ ] Profile load data terkini dari props.
- [ ] School code tidak boleh diedit.
- [ ] Edit phone, group number, principal, leader berjaya.
- [ ] IC leader auto detect gender tanpa state overwrite.
- [ ] Save berjaya update backend.
- [ ] Save gagal paparkan error.
- [ ] Modal boleh close dengan button dan Escape/backdrop jika ditambah.

---

## F. Admin Panel Legacy — `AdminPanel.tsx`

- [ ] Admin hanya nampak data ikut role/scope.
- [ ] Export hanya data scoped, bukan semua data.
- [ ] Clear sheet hanya developer boleh buat.
- [ ] Clear sheet perlu confirmation kedua.
- [ ] Tukar password admin perlu password kuat.
- [ ] Export JSON revoke object URL selepas download.
- [ ] XLSX export tidak bergantung pada `window.XLSX` global sahaja.

---

## G. Admin Negeri — `AdminNegeriPanel.tsx`

- [ ] Hanya sekolah negeri tersebut dipaparkan.
- [ ] Hanya data submissions negeri tersebut dipaparkan.
- [ ] Export hanya negeri tersebut.
- [ ] Toggle registration tidak tutup global tanpa permission developer.
- [ ] Password change ikut polisi password kuat.
- [ ] Tiada sensitive console.log production.
- [ ] Admin daerah management sama ada siap atau hidden jika belum siap.

---

## H. Admin Daerah — `AdminDaerahPanel.tsx`

- [ ] Hanya sekolah daerah tersebut dipaparkan.
- [ ] Hanya submissions daerah tersebut dipaparkan.
- [ ] Export hanya daerah tersebut.
- [ ] Admin daerah tidak boleh toggle global registration.
- [ ] Password change ikut polisi password kuat.
- [ ] Dead code/function tidak digunakan dibuang.

---

## I. Admin Schools — `AdminSchools.tsx`

- [ ] Add single school dengan schoolCode/negeri/daerah valid.
- [ ] Add duplicate school direject.
- [ ] Delete school by schoolCode, bukan name sahaja.
- [ ] Delete school dengan existing submissions perlu block atau warning.
- [ ] Toggle permission per school berjaya.
- [ ] Bulk permission update ikut scope admin sahaja.
- [ ] Legacy school `allowStudents` undefined dipaparkan dengan default jelas.

---

## J. Admin Badges — `AdminBadges.tsx`

- [ ] Add badge baru.
- [ ] Add duplicate badge direject.
- [ ] Delete badge dengan submissions existing perlu block/warning.
- [ ] Toggle badge open/close.
- [ ] Update deadline hanya trigger bila blur/save, bukan setiap keystroke.
- [ ] Badge action ikut role/scope.

---

## K. Admin History — `AdminHistory.tsx`

- [ ] History paparkan data draft bila `showDrafts` true.
- [ ] History tidak kosong secara salah bila belum approve badge.
- [ ] Year filter berdasarkan sourceData scoped.
- [ ] Search/filter history berfungsi.
- [ ] Approved badge logic ikut school dan year.

---

## L. Admin Migration/Import — `AdminMigration.tsx`

- [ ] Import Excel dengan header standard.
- [ ] Import Excel dengan blank rows tidak crash.
- [ ] Import validate mapping required: name, IC, school, code.
- [ ] Import reject jika schoolCode missing — jangan guna `XXX` production.
- [ ] Import duplicate dalam file sendiri direject.
- [ ] Import duplicate dengan existing data direject.
- [ ] Import gender/race normalize.
- [ ] Import large file tidak timeout.
- [ ] Partial failure ada rollback atau log jelas.
- [ ] Migration Gangsa -> Perak tidak duplicate jika run dua kali.
- [ ] Migration Perak -> Emas tidak duplicate jika run dua kali.
- [ ] Invalid source/target year direject.
- [ ] Open year tidak cipta fake production participant, atau semua module filter marker.

---

## M. Developer Panel — `DeveloperPanel.tsx`

- [ ] Access control tidak bergantung localStorage sahaja.
- [ ] Access config disimpan server-side/config file terkawal.
- [ ] Save URL guna key `LOCAL_STORAGE_KEYS.SCRIPT_URL` konsisten.
- [ ] Clear cache tidak guna `localStorage.clear()` secara global.
- [ ] Change password developer berfungsi atau UI dibuang.
- [ ] Only developer boleh access panel.

---

## N. Developer Dashboard — `DeveloperDashboard.tsx`

- [ ] Negeri list fetch daripada backend.
- [ ] Daerah list fetch daripada backend.
- [ ] Admin list fetch daripada backend.
- [ ] Delete admin refresh data selepas success.
- [ ] Form state dan filter state dipisahkan.
- [ ] Add/delete negeri validate dependency.
- [ ] Add/delete daerah validate dependency.
- [ ] Add admin validate role/scope.

---

## O. Developer Admin Dashboard — `DeveloperAdminDashboard.tsx`

- [ ] District data bukan hardcoded mock.
- [ ] Activity log persist di backend.
- [ ] Toggle district access save ke backend.
- [ ] Export all data button berfungsi.
- [ ] Cleanup old data button berfungsi dengan confirmation.
- [ ] Create backup button berfungsi.
- [ ] LocalStorage-only access control dibuang.

---

## P. Analytics Dashboard — `AnalyticsDashboard.tsx`

- [ ] Records tanpa role dikira sebagai `PESERTA` jika legacy.
- [ ] Badge percentage formula diperbetul.
- [ ] Gender breakdown normalize `L`, `LELAKI`, `MALE`.
- [ ] Race breakdown normalize casing.
- [ ] Dashboard tidak crash bila allData kosong.
- [ ] Type props guna `SubmissionData[]`, bukan `any[]`.

---

## Q. Badge Modal — `BadgeModal.tsx`

- [ ] Content HTML disanitize sebelum render.
- [ ] Script/event handler HTML tidak boleh execute.
- [ ] Modal ada `role=dialog`, `aria-modal=true`.
- [ ] Escape key close modal.
- [ ] Click backdrop close modal.
- [ ] Empty badgeType ada fallback title.

---

## R. UI Components

### `SortableTable.tsx`
- [ ] Sorting number string betul: 2 sebelum 10.
- [ ] Sorting date betul.
- [ ] Pagination page > 5 boleh navigate jelas.
- [ ] `rowsPerPage=0/NaN` tidak crash.
- [ ] Jangan guna array index sebagai key untuk row dinamik.

### `SearchFilter.tsx`
- [ ] Parent inline callback tidak menyebabkan loop.
- [ ] Data undefined/null tidak crash.
- [ ] Clear tidak trigger duplicate notification.
- [ ] Search case-insensitive.
- [ ] Filter tambahan sama ada siap atau state dibuang.

### `LoadingSpinner.tsx`
- [ ] Ada accessibility role/status.
- [ ] Reduced motion supported.
- [ ] Invalid color class tidak jadikan spinner invisible.

### `ExportButton.tsx`
- [ ] Export kosong paparkan warning.
- [ ] Formula values `=`, `+`, `-`, `@` escaped.
- [ ] Filename sanitized.
- [ ] hasOwnProperty guna safe call.
- [ ] Column width ikut content.

---

## S. Backend — `apps_script_secure.gs`

### Security Tests
- [ ] Semua destructive action require valid authToken.
- [ ] Semua destructive action require CSRF token.
- [ ] Developer-only actions reject admin/negeri/daerah.
- [ ] Regional admin action enforce negeriCode/daerahCode scope.
- [ ] Password reset ada rate limit.
- [ ] Secret key recovery hashed, bukan plaintext.
- [ ] Password strength enforce server-side.
- [ ] Formula injection sanitized sebelum write ke Sheets.
- [ ] Raw exception tidak dihantar ke client.
- [ ] CORS/origin policy dipertimbangkan.

### Data Integrity Tests
- [ ] `setupDatabase` repair schema lama dengan selamat.
- [ ] `migrateUserPasswordsIfNeeded` detect schema by headers.
- [ ] Register school code/name mesti match SCHOOLS.
- [ ] New school registration tidak boleh create blank location tanpa admin approval.
- [ ] Submit form validate badge exists.
- [ ] Submit form validate registration open.
- [ ] Submit form validate school permission.
- [ ] Submit form reject duplicate IC+badge+year.
- [ ] Delete/update reject locked/approved/old records.
- [ ] Delete loops tidak boleh delete header row.
- [ ] Delete negeri/daerah/school block jika ada dependency.
- [ ] Migration idempotent — run dua kali tidak duplicate.
- [ ] `clearSheetData` whitelist sheet names dan backup dahulu.

### Performance Tests
- [ ] Large import 1,000 rows tidak timeout.
- [ ] Global lock acquisition checked; fail cleanly jika lock busy.
- [ ] Read-only request tidak perlu global write lock.
- [ ] Expired sessions/CSRF tokens cleanup berkala.

---

# 3. Cadangan Urutan Fix

## Fasa 1 — Tutup Risiko Kritikal

1. Buang/secure `dangerouslySetInnerHTML` dengan sanitizer.
2. Tukar developerActions backend kepada developer-only.
3. Tambah CSRF pada semua admin/developer actions.
4. Check result `lock.tryLock()` sebelum proses request.
5. Whitelist dan restrict `clearSheetData` kepada developer sahaja.
6. Backend enforce submit permission, badge open, locked/approved status.
7. Fix USERS migration schema corruption.

## Fasa 2 — Data Scope & Integrity

1. Export ikut filtered/scoped data untuk Negeri/Daerah.
2. Enforce regional scope dalam backend untuk all admin actions.
3. Block delete header row dan dependency delete.
4. Fix import validation, duplicate checking, dan remove placeholder `XXX`.
5. Fix migration supaya idempotent.

## Fasa 3 — UI/UX & Stability

1. Fix duplicate developer login inputs.
2. Fix UserForm permission tab loop.
3. Fix UserDashboard rambu empty crash.
4. Fix SearchFilter archive no-op.
5. Fix UserProfile stale state dan editable school code.
6. Remove production console logs.

## Fasa 4 — Automated Tests

Projek belum ada Vitest/Jest. Cadangan tambah:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Kemudian tambah scripts:

```json
{
  "test": "vitest",
  "test:run": "vitest run"
}
```

Test automatik pertama yang disarankan:

- `services/api.test.ts`
- `services/security.test.ts`
- `components/AuthScreen.test.tsx`
- `components/UserForm.test.tsx`
- `components/ui/ExportButton.test.tsx`
- Backend Apps Script tests secara manual/mock melalui clasp atau integration endpoint.

---

# 4. Kesimpulan

Build production lulus, tetapi audit kod menemui beberapa isu keselamatan dan integriti data yang perlu diperbaiki sebelum deployment penuh, terutamanya di backend Apps Script. Keutamaan tertinggi ialah authorization, CSRF, enforcement permission server-side, sanitization, dan perlindungan data daripada delete/import/migration yang tidak selamat.
