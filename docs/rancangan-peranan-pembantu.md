# Rancangan: Peranan "Pembantu"

Status: **rancangan · belum implementasi**. Dua soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

---

## 1. Keperluan

Tambah peranan kelima, **PEMBANTU**, di samping PESERTA, PEMIMPIN, PENOLONG PEMIMPIN dan PENGUJI. Fungsinya sama seperti pemimpin dan penolong pemimpin.

Papan pemuka sekolah turut memaparkan jumlahnya, bersebelahan Peserta, Pemimpin dan Penguji.

---

## 2. Luas kesan

`PENOLONG PEMIMPIN` muncul **50 kali** dalam 16 fail sumber. Setiap satu ialah tempat yang menyenaraikan peranan secara eksplisit, dan setiap satu perlu disemak — peranan baharu yang tercicir daripada satu senarai tidak gagal dengan kuat, ia cuma hilang secara senyap daripada satu paparan atau satu kiraan.

| Lapisan | Fail | Apa yang perlu berubah |
|---|---|---|
| Pangkalan data | `001_schema.sql:148` | `check (role in (...))` — perlu migrasi `alter … drop constraint … add constraint` |
| Jenis | `types.ts` | `PersonRole` |
| Kiraan | `utils/dataProcessing.ts:31` | `RoleStats` + `computeRoleStats` |
| Rumusan | `services/programSummary.ts` | `isPemimpin` / `isPenolong` |
| Borang | `UserForm.tsx` | senarai peranan, dropdown, pengesahan |
| Papan pemuka | `UserDashboard.tsx` | jubin kiraan, dropdown edit (2 tempat) |
| Import | `BulkImportModal.tsx`, `AdminMigration.tsx` | pemetaan peranan |
| Apung | `FloatStudentModal.tsx`, `FloatedStudentsTab.tsx` | penapis peranan |
| Cetak | `services/pdfService.ts` | pengumpulan mengikut peranan |
| Telegram | `supabase/functions/telegram-webhook/index.ts` | paparan peranan |
| Admin | `AdminSchools.tsx`, `AdminDashboard.tsx`, `DeveloperDashboard.tsx` | kiraan & kebenaran |

### 2.1 Penolong Pemimpin dikira tetapi tidak pernah dipaparkan

`computeRoleStats` sudah mengasingkan `leaders` (PEMIMPIN) daripada `assistants` (PENOLONG PEMIMPIN). Papan pemuka sekolah memaparkan tiga jubin sahaja: Peserta, Pemimpin, Penguji (`components/UserDashboard.tsx:1794-1809`).

Jadi jumlah Penolong Pemimpin dikira pada setiap render dan dibuang. Menambah jubin Pembantu tanpa menyentuhnya menghasilkan papan pemuka yang memaparkan empat daripada lima peranan — dan yang tertinggal ialah satu-satunya yang sudah pun dikira.

---

## 3. Keputusan

**K1 — PEMBANTU mengikut kumpulan kebenaran "assistants".**
Togol admin bagi Pemimpin dan Penolong Pemimpin turut mengawal Pembantu, di kedua-dua fasa (sebelum dan selepas penghantaran). Ini mengikut "fungsinya sama seperti pemimpin dan penolong pemimpin" secara terus, dan mengelakkan togol keempat dalam panel yang sudah padat.

**K2 — Satu migrasi, satu kekangan.**
`submission_people.role` mempunyai kekangan CHECK bernama. Migrasi menggugurkannya dan menciptanya semula dengan nilai tambahan. Tiada data sedia ada terjejas kerana tiada baris memegang nilai baharu itu.

**K3 — Kiraan mendapat medan tersendiri.**
`RoleStats.pembantu`, bukan dicampur ke dalam `assistants`. Mencampurnya bermakna jubin baharu mustahil dibina, dan rumusan program tidak lagi dapat membezakan keduanya.

---

## 4. Keputusan tertutup

**K4 — PEMBANTU dicaj pada kadar PENOLONG PEMIMPIN.**

Di lapisan wang kedua-duanya tidak dibezakan: tiada lajur yuran baharu, tiada medan snapshot baharu. `create-payment-bill` mengira PEMBANTU ke dalam baldi `penolong`, jadi `snapshot_penolong` meliputi kedua-duanya, dan segalanya yang hilir — `siri_seats_taken`, `claim_siri_seats`, `check_siri_availability`, bil susulan, refund — terus berfungsi tanpa disentuh.

Hanya **satu** fungsi SQL hidup menyenaraikan peranan secara eksplisit: `baki_tempat_siri`. Penyenaraian dalam migrasi 029 dan 041 tinggal dalam fungsi yang sudah digantikan oleh 043 dan 048, jadi ia mati dan sengaja dibiarkan.

**K5 — Lima jubin pada papan pemuka.**
Peserta · Pemimpin · Penolong · Penguji · Pembantu. Jurang §2.1 ditutup sekali gus; memaparkan empat daripada lima peranan, dan meninggalkan satu-satunya yang datanya sudah dikira, tidak masuk akal.

**K6 — Di mana PEMBANTU berasingan, dan di mana ia dikumpul**

| Tempat | Layanan |
|---|---|
| Pangkalan data, borang, papan pemuka sekolah | Berasingan |
| Pecahan kategori PDF | Berasingan (`Pembantu`) |
| Jadual ringkasan sekolah PDF, Telegram | Dikumpul dengan Penolong — lajurnya tetap |
| Bil, tempat, yuran | Dikumpul dengan Penolong (K4) |
| Kebenaran edit admin | Dikumpul dengan Penolong (K1) |

---

## 5. Pepijat sedia ada yang ditemui semasa kerja ini

`submitRegistration` (`services/supabaseApi.ts:403`) memaksa **setiap** baris dalam senarai `assistants` menjadi `'PENOLONG PEMIMPIN'`:

```ts
...assistants.map(p => ({ ...p, role: 'PENOLONG PEMIMPIN' })),
```

`UserForm` memasukkan PEMIMPIN dan PENOLONG PEMIMPIN ke dalam senarai yang sama. Jadi sesiapa yang didaftarkan sebagai **PEMIMPIN** melalui borang disimpan sebagai **PENOLONG PEMIMPIN** — tanpa amaran, dan tanpa apa-apa dalam borang yang menunjukkannya.

PEMBANTU akan hilang dengan cara yang sama. Dibetulkan dengan menjadikan peranan yang dibawa baris itu menang, dan hujah kedudukan sekadar lalai.

Data sedia ada tidak dibetulkan oleh perubahan ini. Sekolah yang pernah mendaftar pemimpin melalui borang mungkin mempunyai baris yang tersalah label sebagai penolong; ia perlu disemak berasingan kalau kadar yuran keduanya berbeza.
