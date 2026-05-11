# Pelan Migrasi: Google Sheets → Supabase

## Gambaran Keseluruhan

Migrasi sistem pendaftaran pengakap daripada Google Sheets + Apps Script kepada Supabase (Database + Auth + Storage + Edge Functions).

**Prinsip:** Staged migration — bina selari, test, kemudian cutover.

---

## Fasa 1 — Setup Supabase + Schema

### Objektif
- Create project Supabase
- Create semua tables dengan schema normalized
- Setup RLS (Row Level Security) policies
- Create Edge Function untuk register school user

### Tables Yang Perlu Dibuat

#### Reference Tables
1. `negeri` — senarai negeri
2. `daerah` — senarai daerah (FK ke negeri)
3. `schools` — senarai sekolah (FK ke negeri, daerah)
4. `badges` — senarai lencana/program

#### Auth Tables
5. `profiles` — profil pengguna (link ke auth.users)

#### Operational Tables
6. `school_profiles` — maklumat pemimpin/GB sekolah
7. `submissions` — batch submission
8. `submission_people` — individu dalam submission
9. `school_badge_status` — status lock/approve per sekolah per badge per tahun

#### Support Tables
10. `audit_logs` — jejak audit
11. `attendance_verifications` — rekod kehadiran QR

### RLS Policies
- school_user: hanya akses data sekolah sendiri
- daerah_admin: akses semua sekolah dalam daerah
- negeri_admin: akses semua sekolah dalam negeri
- admin: akses semua
- developer: akses semua

### Edge Functions
- `register_school_user` — daftar akaun sekolah baru

### Deliverables
- SQL migration file lengkap
- RLS policies
- Edge Function code

---

## Fasa 2 — Auth + Register/Login

### Objektif
- Implement flow register sekolah (email + password)
- Implement flow login
- Integrate Supabase client ke frontend
- Tukar AuthScreen.tsx

### Flow Register
1. User pilih sekolah dari dropdown
2. Masukkan kod sekolah (pengesahan)
3. Masukkan email
4. Masukkan password + confirm
5. Klik daftar

### Backend Logic (Edge Function)
1. Semak sekolah wujud + kod betul
2. Semak sekolah belum claimed (`is_claimed = false`)
3. Create Supabase Auth user (email + password)
4. Insert row dalam `profiles` (role = school_user, school_id)
5. Update `schools` set `is_claimed = true`, `claimed_by`, `claimed_email`, `claimed_at`
6. Return success

### Flow Login
1. User masukkan email + password
2. Supabase Auth `signInWithPassword`
3. Fetch profile → tahu role + school_id
4. Redirect ke dashboard

### Shared Access
- Guru dalam sekolah sama kongsi email + password
- Sesiapa tahu credentials boleh login
- Tukar password dari dalam sistem

### Admin/Negeri/Daerah Login
- Sama: email + password
- Role ditentukan dari `profiles.role`

### Deliverables
- `services/supabaseClient.ts` — Supabase client init
- `services/auth.ts` — register, login, logout, session
- Updated `AuthScreen.tsx`
- Edge Function `register_school_user`

---

## Fasa 3 — API Layer (CRUD Operations)

### Objektif
- Tukar semua API calls dari Google Apps Script ke Supabase
- Rewrite `services/api.ts` → `services/supabaseApi.ts`

### Functions Yang Perlu Ditukar

#### Data Operations
- `fetchCloudData` → query Supabase tables
- `submitRegistration` → insert submissions + submission_people
- `deleteSubmission` → soft delete / hard delete
- `updateParticipantId` → update submission_people
- `bulkSubmitRegistration` → batch insert

#### School Management
- `addSchool` → insert schools
- `deleteSchool` → delete/deactivate schools
- `updateSchoolPermission` → update schools columns
- `lockSchoolBadge` → insert/update school_badge_status
- `approveSchoolBadge` → update school_badge_status
- `unlockSchoolBadge` → update school_badge_status
- `toggleSchoolEditBatch` → batch update schools

#### Badge Management
- `addBadgeType` → insert badges
- `deleteBadgeType` → delete badges
- `updateBadgeDeadline` → update badges
- `toggleRegistration` → update badges.is_open

#### User Management
- `registerUser` → Edge Function
- `loginUser` → Supabase Auth
- `resetPassword` → Supabase Auth reset
- `changePassword` → Supabase Auth update
- `updateUserProfile` → update school_profiles

#### Admin Management
- `loginAdmin` → Supabase Auth
- `loginAdminRegional` → Supabase Auth
- `loginDeveloper` → Supabase Auth
- `addAdmin` → create auth user + profile
- `deleteAdmin` → delete/deactivate

#### Hierarchy
- `addNegeri` → insert negeri
- `deleteNegeri` → delete negeri
- `addDaerah` → insert daerah
- `deleteDaerah` → delete daerah

#### System
- `setupDatabase` → tidak perlu lagi (schema sudah ada)
- `clearDatabaseSheet` → truncate table (developer only)
- `migrateYear` → custom query

### Deliverables
- `services/supabaseApi.ts` — semua CRUD operations
- Updated components yang call API

---

## Fasa 4 — Data Migration Script

### Objektif
- Import semua data sedia ada dari Google Sheet ke Supabase
- Normalize dan deduplicate data

### Sumber Data
1. Main submission sheet → `submissions` + `submission_people`
2. Schools sheet → `schools`
3. Badges sheet → `badges`
4. User Profiles sheet → `school_profiles`
5. Negeri sheet → `negeri`
6. Daerah sheet → `daerah`
7. Admin credentials → `profiles` (auth users)

### Urutan Import
1. `negeri`
2. `daerah`
3. `schools`
4. `badges`
5. `school_profiles`
6. `submissions` + `submission_people`
7. `school_badge_status` (dari lockedBadges/approvedBadges)
8. Admin/regional admin accounts

### Data Cleaning Rules
- `remarks` yang ada `[Kategori: xxx]` → extract ke `category` field
- `date` → standardkan ke ISO format
- `gender` → normalize (Lelaki/Perempuan)
- `phone` → pastikan string, format Malaysian
- `membership_id` → uppercase, trim
- `ic_number` → normalize, remove dashes
- Duplicate rows → identify by IC + Badge + Year, keep latest

### Auth Migration
- Sekolah yang sudah ada akaun:
  - Create Supabase Auth user
  - Guna email sekolah jika ada, atau generated email
  - Set temporary password
  - Mark school as claimed
- Admin accounts:
  - Create Supabase Auth user per admin
  - Set role dalam profiles

### Deliverables
- Migration script (boleh run dari terminal atau Edge Function)
- Data validation report
- Rollback plan

---

## Fasa 5 — Testing + Fix + Cutover

### Objektif
- Test semua flow end-to-end
- Fix bugs
- Pastikan RLS betul
- Cutover dari Google Sheets ke Supabase

### Testing Checklist

#### Auth
- [ ] Register sekolah baru
- [ ] Login sekolah
- [ ] Login admin
- [ ] Login negeri admin
- [ ] Login daerah admin
- [ ] Login developer
- [ ] Logout
- [ ] Session timeout
- [ ] Change password
- [ ] Reset password
- [ ] Shared access (2 orang login sama)

#### Data Operations
- [ ] Submit pendaftaran baru
- [ ] View data sekolah sendiri
- [ ] Delete record
- [ ] Update membership ID
- [ ] Bulk import
- [ ] Lock badge
- [ ] Approve badge
- [ ] Unlock badge

#### Admin Operations
- [ ] Add school
- [ ] Delete school
- [ ] Update permissions
- [ ] Add badge
- [ ] Toggle registration
- [ ] View all data (filtered by role)
- [ ] Analytics dashboard
- [ ] PDF export
- [ ] WhatsApp bulk
- [ ] QR attendance

#### RLS Verification
- [ ] School user CANNOT see other school data
- [ ] Daerah admin CANNOT see other daerah data
- [ ] Negeri admin CANNOT see other negeri data
- [ ] Developer CAN see everything

#### Performance
- [ ] Load time with 1000+ records
- [ ] Filter/search responsiveness
- [ ] Concurrent users

### Cutover Plan
1. Announce maintenance window
2. Final data sync from Google Sheet → Supabase
3. Switch frontend to Supabase mode
4. Disable Google Apps Script writes
5. Monitor for 24 hours
6. Google Sheet becomes read-only archive

### Rollback Plan
Jika ada masalah kritikal selepas cutover:
1. Switch frontend back to Google Sheets mode
2. Any new data in Supabase → export and import back to Sheet
3. Investigate and fix
4. Re-attempt cutover

### Deliverables
- Test report
- Cutover checklist
- Rollback procedure
- Post-migration monitoring

---

## Timeline Anggaran

| Fasa | Masa |
|------|------|
| Fasa 1 — Schema + RLS | 1-2 jam |
| Fasa 2 — Auth + Register/Login | 2-3 jam |
| Fasa 3 — API Layer | 3-4 jam |
| Fasa 4 — Data Migration | 1-2 jam |
| Fasa 5 — Testing + Cutover | 2-3 jam |
| **JUMLAH** | **9-14 jam** |

---

## Keputusan Teknikal

| Perkara | Keputusan |
|---------|-----------|
| Auth method | Email + password (Supabase Auth native) |
| Shared access | 1 akaun per sekolah, kongsi credentials |
| Login UI | Email + password |
| Register UI | Pilih sekolah → kod → email → password |
| 1 sekolah = 1 akaun | Ya, enforced via is_claimed |
| Reset password | Via email (Supabase built-in) |
| Admin login | Email + password, role dari profiles |
| RLS | Wajib, based on role + school/negeri/daerah |
| Data model | Normalized (submissions + submission_people) |
| Migration approach | Staged, parallel, then cutover |

---

## Risiko Dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| User daftar sekolah orang lain | Wajib padankan school_id + school_code |
| Kod sekolah bocor | Admin boleh reset claim / tukar code |
| Dua user daftar serentak | Conditional update / DB transaction |
| Data lama format kotor | Migration script normalize dahulu |
| Downtime semasa cutover | Maintenance window + rollback plan |
| Performance drop | Index pada columns yang kerap di-query |
