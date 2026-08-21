# Statistik kehadiran kosong walaupun imbasan berjaya

Ditulis 21 Ogos 2026, semasa perkhemahan sedang berjalan (Kinta Utara, Siri 2).
Skop kecil dan dipandu satu laporan: imbasan QR berjaya, tetapi sekolah yang
baru diimbas tidak muncul langsung dalam Statistik Kehadiran panel admin.

## Apa yang berlaku

Imbasan tidak bersalah. `attendance_verifications` menerima barisnya
(`rekodKehadiranSiri`, services/supabaseApi.ts). Yang rosak ialah paparan.

`StatistikKehadiranProgram` membina senarai sekolahnya daripada
`school_badge_status`, dan menanya jadual itu dengan `badgeIds`:

```js
const badgeIds = badges.map(b => b.id).filter(Boolean);
if (badgeIds.length === 0) { setPendaftaran([]); return; }
```

Objek `Badge` yang dihantar ke panel admin **tidak pernah membawa `id`**.
Kedua-dua tempat yang membinanya menyalin `name`, `isOpen`, `deadline`,
`scope`, `negeriCode`, `daerahCode`, `requiresDaerahApproval` — dan berhenti
di situ:

- `services/supabaseApi.ts` — pemetaan dalam `fetchCloudData`
- `App.tsx` — pemetaan kedua selepas muat semula

Maka `badgeIds` kosong, pertanyaan `school_badge_status` tidak pernah
dijalankan, `pendaftaran` kekal `[]`, dan setiap baris sekolah hilang. Rekod
imbasan hanya dipakai untuk menandakan `sah` pada baris yang sedia ada; tiada
baris bermakna tiada apa untuk ditanda.

Kegagalan ini SENYAP. Tiada ralat, tiada konsol, hanya "Tiada sekolah
diluluskan bagi tapisan ini" — ayat yang berbunyi seperti fakta tentang data,
bukan pepijat. `badges: any[]` pada prop itulah yang menyembunyikannya
daripada TypeScript.

Butang "Siri 2" tetap kelihatan kerana `siriAda` turut mengambil siri
daripada rekod imbasan. Itu yang menjadikan pepijat ini mengelirukan: skrin
mengaku tahu Siri 2 wujud, kemudian melaporkan tiada sekolah di dalamnya.

## Isu kedua: tapisan skop menyembunyikan imbasan yang sah

Imbasan QR v4 buta skop. `kehadiran_sekolah_siri` (PASANG-066) memulangkan
SETIAP program diluluskan sekolah itu dalam siri berkenaan, tanpa melihat
`badges.scope`. Tetapi statistik menerima `attendanceBadges` — admin daerah
hanya badge `scope='daerah'`, admin negeri hanya `scope='negeri'`.

Jadi program berskop negeri yang diimbas oleh admin daerah akan direkod
dengan betul dan tidak akan sesekali dipaparkan. Sekali lagi tanpa ralat.

## Keputusan

Statistik mengikut apa yang imbasan sanggup rekod, bukan sebaliknya.
Menyempitkan imbasan supaya ia menghormati skop badge adalah pilihan yang
salah di meja pendaftaran: sekolah datang sekali, dan petugas mengesahkan
kehadiran seorang murid, bukan kehadiran satu skop pentadbiran.

Skop admin tidak hilang — ia dikuatkuasakan pada SEKOLAH melalui
`daerahCode`/`negeriCode` (dan RLS di bawahnya), yang memang tempatnya.

## Perubahan

1. `types.ts` — `Badge.id?: string`, opsyenal kerana laluan sandaran lama
   membina Badge daripada nama sahaja.
2. `services/supabaseApi.ts` dan `App.tsx` — kedua-dua pemetaan membawa `id`.
3. `StatistikKehadiranProgram` — prop ditaip `Badge[]` menggantikan `any[]`,
   supaya kes yang sama gagal semasa kompil dan bukan semasa perkhemahan.
4. Panel Daerah dan Panel Negeri menghantar `badges` penuh, bukan
   `attendanceBadges`. `attendanceBadges` kekal untuk pengimbas kad lama
   (v2/v3), yang memang memerlukan satu program dipilih.
5. Satu `console.error` bila ada program tetapi tiada satu pun `id` —
   supaya kegagalan senyap yang sama sekurang-kurangnya bersuara.

## Tidak disentuh

Skema, RPC, RLS dan data. Pepijat ini sepenuhnya di lapisan paparan; rekod
imbasan yang sudah masuk adalah betul dan akan terus muncul sebaik skrin
dibaiki. Tiada migrasi diperlukan.
