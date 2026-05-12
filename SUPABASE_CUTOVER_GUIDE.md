# Supabase Cutover Guide

Dokumen ini menerangkan langkah cutover 100% dari Google Apps Script (GAS) ke Supabase.

## Status Implementasi

Fasa 3, 4 dan 5 telah disediakan dalam codebase:

- `services/supabaseApi.ts` menggantikan CRUD GAS.
- `App.tsx` Developer login telah ditukar ke Supabase Auth.
- Semua component utama telah import API dari `services/supabaseApi.ts`.
- `scripts/migrate-gas-to-supabase.ts` disediakan untuk pindah data lama dari GAS ke Supabase.
- Build production berjaya.

## Cara Create Akaun Developer Supabase

### Option A: Supabase Dashboard

1. Buka Supabase Dashboard.
2. Pergi ke `Authentication > Users`.
3. Klik `Add user > Create new user`.
4. Masukkan email developer dan password.
5. Pergi ke `Table Editor > profiles`.
6. Cari row profile berdasarkan email tadi.
7. Edit:
   - `role` = `developer`
   - `is_active` = `true`
   - `full_name` = nama developer
8. Simpan.
9. Login dalam sistem sebagai Developer menggunakan email dan password tersebut.

### Option B: SQL Editor

Selepas user dibuat di Authentication, jalankan SQL ini, tukar email:

```sql
update public.profiles
set role = 'developer',
    is_active = true,
    full_name = coalesce(full_name, 'Developer')
where email = 'developer@example.com';
```

## Cara Create Admin Negeri / Admin Daerah

Selepas login sebagai Developer Supabase:

1. Pergi ke Developer Dashboard.
2. Buka tab Admin Regional.
3. Pilih role:
   - Admin Negeri
   - Admin Daerah
4. Pilih Negeri/Daerah.
5. Isi email, password, nama.
6. Submit.

Admin tersebut akan dibuat dalam Supabase Auth dan `profiles` table.

## Cara Migrate Data Lama Dari GAS

### 1. Dapatkan service role key

Supabase Dashboard:

`Project Settings > API > service_role key`

Jangan commit key ini ke Git.

### 2. Buat `.env` local

```env
GAS_API_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
SUPABASE_URL=https://jvjxeckzmokoqjfsuene.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Install dependency tambahan

```bash
npm install
```

### 4. Jalankan migration

```bash
npm run migrate:gas
```

Script akan migrate:

- Negeri
- Daerah
- Schools
- Badges
- Submissions / peserta
- School profiles

### 5. Semak report migration

Script akan paparkan jumlah:

- fetched
- inserted
- skipped
- errors

Pastikan errors = 0 atau semak log yang keluar.

## Cara Semak Data Tahun 2025

Selepas migration:

```sql
select s.submission_year, sc.school_code, sc.name as school_name, b.name as badge, sp.name as participant
from public.submission_people sp
join public.submissions s on s.id = sp.submission_id
join public.schools sc on sc.id = s.school_id
join public.badges b on b.id = s.badge_id
where s.submission_year = 2025
  and sp.is_deleted = false
order by sc.name, b.name, sp.name;
```

Jika data 2025 ada di Supabase, sistem frontend akan baca dari Supabase melalui `fetchCloudData()` dalam `services/supabaseApi.ts`.

## Cutover Checklist

1. Apply semua Supabase migrations.
2. Deploy Edge Functions:
   - `register-school-user`
   - `register-admin`
   - `reset-school-claim`
3. Create developer account di Supabase.
4. Run migration script.
5. Login sebagai Developer Supabase.
6. Verify data dashboard, terutama tahun 2025.
7. Login Admin Negeri dan Admin Daerah.
8. Login sekolah dan semak data.
9. Submit test data baru.
10. Confirm data masuk ke Supabase tables.
11. Stop guna GAS URL untuk operasi data.

## Nota Penting

- Code frontend sudah tidak bergantung kepada `services/api.ts` untuk component utama.
- `services/api.ts` masih ada untuk rujukan legacy sahaja.
- Jangan padam GAS/Google Sheets sehingga data Supabase disahkan lengkap.
- Backup Google Sheets sebelum migration.
