# Rancangan: baiki laluan hantar (`create-payment-bill` + `lockSchoolBadge`)

**Status:** DITUTUP — setiap soalan dalam §7 sudah dijawab. Kod boleh ditulis.

**Tarikh:** 16 Ogos 2026

---

## 1. Kenapa satu rancangan, bukan lima

Lima kecacatan berikut semuanya berada dalam laluan yang sama: guru menekan
**Hantar** → `handleFinalSubmit` → sama ada `create-payment-bill` (berbayar) atau
`lockSchoolBadge` (percuma) → baris ditulis ke `school_badge_status`.

Empat daripadanya dikenal pasti semasa menyiasat SMK Gunung Rapat. Yang kelima
muncul hari ini pada SMK Tambun. Kesemuanya menyentuh dua fungsi yang sama, dan
tiga daripadanya menulis ke jadual yang sama. Membaikinya satu demi satu
bermakna menulis semula bahagian yang sama berulang kali dan menguji laluan yang
sama berulang kali.

---

## 2. K1 — laluan RM0 memadam rekod bayaran

**Kod:** `supabase/functions/create-payment-bill/index.ts:339` dan `:415`

```ts
if (amount <= 0) { terusHantar.push(badgeId); continue; }
...
payment_status: 'not_required', status: 'submitted',
```

**Kes sebenar:** SMK TAMBUN · Maju · 2026 · Siri 2. Sekolah membayar RM510 bagi
6 peserta pada RM85. Admin mengesahkan, kemudian menolak semula kerana ada nama
tertinggal. Guru menambah **seorang Pemimpin** (yuran `NULL`) dan seorang
Penguji (tiada lajur yuran langsung), lalu menghantar semula.

Apa yang berlaku dalam gelung pembilan:

| Peranan | Kini | Snapshot bil | Baki | Yuran | Caj |
|---|---|---|---|---|---|
| Peserta | 6 | 6 | 0 | RM85 | RM0 |
| Pemimpin | 1 | 0 | **1** | `NULL` | RM0 |
| Penguji | 1 | — | — | tiada lajur | — |

Baki **bukan** sifar, jadi pintu "sudah dibayar" di baris 312 terlepas. Tetapi
jumlahnya tetap RM0, jadi baris 339 menghantarnya ke `terusHantar`, dan baris
415 menulis ganti `paid` dengan `not_required`.

Pengesahan kemudian gagal: *"Pendaftaran ini belum dibayar (status:
not_required). Program mewajibkan bayaran sebelum pengesahan."*

Wang tidak pernah hilang dan tidak pernah dituntut semula — hanya rekod status
yang dipadam. Ironinya, komen di baris 426 sudah memberi amaran tentang bahaya
ini bagi laluan `hantarSemula`; hanya satu daripada dua laluan dilindungi.

**Sudah dibersihkan:** `PASANG-pulih-bayaran.sql` memulihkan baris itu. Puncanya
belum disentuh.

### Cadangan

Syarat di baris 312 salah dari asalnya. Ia bertanya *"adakah baki sifar?"*
sedangkan soalan yang betul ialah *"adakah wang pernah diterima untuk program
ini, dan adakah masih ada apa-apa untuk dicaj?"*

```ts
// sekarang
if (dilindungi.has(badgeId) && baki.peserta + baki.pemimpin + baki.penolong + baki.pembantu === 0) {

// cadangan — pindah SELEPAS `amount` dikira
if (dilindungi.has(badgeId) && amount <= 0) {
```

Dengan itu SMK Tambun masuk ke `hantarSemula`, yang memang sudah betul dan tidak
menyentuh `payment_status`. Baris 339 hanya menangkap program yang benar-benar
tidak pernah dibayar.

Tambahan yang dicadangkan: **pencetus pangkalan data** yang menghalang peralihan
`paid` → `not_required` sepenuhnya. Pembaikan di atas menutup laluan yang
diketahui; pencetus menutup yang belum diketahui. Lihat soalan **S1**.

---

## 3. K2 — `terusHantar` menghantar pendaftaran yang belum siap

**Kod:** `index.ts:339`

RM0 mempunyai dua makna yang berbeza sama sekali, dan kod ini menganggap
kedua-duanya sebagai "program percuma":

1. Program ini memang tidak mengenakan bayaran → hantar terus, betul
2. Siri ini **mewajibkan** bayaran, tetapi tiada peranan yang dicaj telah
   didaftarkan → pendaftaran belum siap, dan menghantarnya adalah salah

**Kes sebenar:** SMK GUNUNG RAPAT · Jaya · 2026 · Siri 2. Dua pegawai, sifar
peserta, yuran pegawai semuanya `NULL`. Jumlah RM0 → dihantar terus untuk
pengesahan sebelum guru sempat membayar Maju. Admin menerima permohonan
pengesahan yang guru tidak pernah bermaksud menghantar.

Kitaran itu berulang: tolak → guru tekan Hantar lagi → RM0 lagi → dihantar lagi.

### Cadangan asal — DIBATALKAN

Cadangan pertama ialah melangkau setiap program RM0 pada siri berbayar, atas
andaian bahawa RM0 di situ sentiasa bermakna "belum siap". **S2 dijawab: tidak
benar.** Pendaftaran pegawai-sahaja memang sah dalam sistem ini. Melangkaunya
akan menyekat sekolah yang tidak melakukan apa-apa kesalahan.

### Cadangan semula

Kalau pegawai-sahaja itu sah, maka Jaya RM0 itu **bukan** pendaftaran yang
rosak. Yang rosak ialah cara ia dihantar.

Perhatikan semula apa yang guru SMK Gunung Rapat sebenarnya lakukan: mereka
menekan Hantar untuk membayar **Maju**. Satu bil meliputi semua program dalam
siri (`UserDashboard.tsx:1056-1059`), jadi Jaya turut masuk ke dalam panggilan
yang sama. Bila bayaran diwajibkan, `handleFinalSubmit` terus membuka skrin
bayaran tanpa sebarang dialog pengesahan yang menyenaraikan program — dialog itu
(baris 1083-1087) hanya muncul pada laluan percuma.

Jadi Jaya dihantar ke giliran pengesahan **tanpa pernah dinamakan kepada guru**,
sebagai kesan sampingan percubaan membayar program lain. Kemudian bil Maju luput
tanpa dibayar. Hasilnya: admin menerima permohonan pengesahan untuk Jaya
sedangkan guru menyangka mereka masih di tengah-tengah proses bayaran Maju.

Itulah kecacatan sebenar — bukan RM0, tetapi **penghantaran senyap**.

**S7 ditutup: namakan, jangan tahan.** Program RM0 terus dihantar seperti
sekarang — menahannya bermakna pendaftaran percuma tersandera oleh bayaran
program lain yang mungkin tidak pernah dijelaskan. Yang berubah ialah ia tidak
lagi berlaku secara senyap.

Perubahan yang diperlukan:

1. **Edge Function** — `terusHantar` dikumpul sebagai objek bernama, bukan
   sekadar `badgeId`, dan dipulangkan dalam medan baharu `dihantarPercuma`
   pada respons. Medan itu sudah wujud dalam semangat `dilangkau` dan
   `sudahDibayar`; ini melengkapkan set
2. **Skrin bayaran** — paparkan senarai itu sebelum guru meneruskan bayaran:
   *"Jaya tiada yuran — telah dihantar terus untuk pengesahan."*
3. **Laluan percuma sepenuhnya** — bila tiada bil langsung dicipta, mesej
   ringkasan sedia ada (baris 444-451) sudah memadai; hanya perlu menamakan
   program, bukan mengira

Perlu ditegaskan apa yang **tidak** berubah: program pegawai-sahaja pada siri
berbayar tetap dihantar tanpa bayaran, kerana S2 mengesahkan itu sah.

---

## 4. K3 — `lockSchoolBadge` menghantar SEMUA siri

**Kod:** `services/supabaseApi.ts:675-685`

```ts
let siriList: number[] = [siri];
...
const found = Array.from(new Set((people || []).map((p: any) => p.siri || 1)));
if (found.length > 0) siriList = found;
```

Parameter `siri` yang dihantar pemanggil **dibuang sepenuhnya** sebaik sahaja
mana-mana peserta dijumpai. Sekolah yang menghantar Siri 1 juga menghantar Siri
2, 3 dan seterusnya.

Baris 653-659 lebih luas lagi: ia menukar **setiap** `submissions` draf bagi
badge dan tahun itu kepada `submitted`, tanpa mengira siri.

**Kes sebenar:** SK TANJONG RAMBUTAN mendapat Keris Emas Siri 2 berstatus
`submitted` tanpa bayaran. Kedua-dua baris berkongsi `submitted_at` yang sama
hingga ke milisaat: `07:35:50.994`.

Komen di baris 661-665 menerangkan kenapa ia diterbitkan daripada peserta
sebenar: penapis UI boleh salah. Alasan itu **sudah tidak sah** — `handleFinalSubmit`
(`UserDashboard.tsx:1040`) kini menerbitkan `sasar` daripada `siriBelumHantar`,
iaitu peserta sebenar juga. Perlindungan itu kini dilakukan dua kali, dan salah
satu daripadanya terlalu luas.

### Cadangan

Hormati parameter `siri`. Gunakan senarai yang diterbitkan hanya untuk
**mengesahkan** bahawa siri itu benar-benar mempunyai peserta, bukan untuk
menggantikannya. Lihat soalan **S3** — ada satu pemanggil lama (Import Naik)
yang perlu disemak dahulu.

---

## 5. K4 — kemas kini `submissions` tidak ditapis siri

**Kod:** `index.ts:418-422` dan `:435-439`

```ts
const subIdsBadge = (subs || []).filter((s: any) => s.badge_id === badgeId).map((s: any) => s.id);
await admin.from('submissions').update({ status: 'submitted' }).in('id', subIdsBadge).eq('status', 'draft');
```

Ini bukan kecuaian — ia **struktur**. Jadual `submissions` tiada lajur `siri`
langsung; `siri` berada pada `submission_people`. Satu baris `submissions` boleh
merangkumi beberapa siri sekaligus, jadi `submissions.status` tidak mungkin
tepat per siri.

Soalan sebenar bukan bagaimana menapisnya, tetapi sama ada `submissions.status`
sepatutnya bermakna apa-apa langsung sekarang. Sumber kebenaran untuk penghantaran
ialah `school_badge_status`, yang **memang** berkunci pada siri. Lihat soalan **S4**.

---

## 6. K5 — pembatalan bil meninggalkan `payment_status = 'pending'`

**Kod:** `supabase/functions/reconcile-payments/index.ts:165-170`

```ts
await admin.from('payment_bills').update({ status: 'cancelled', notes: nota }).eq('id', bayaran.id);
await admin.from('payments').update({ status: 'cancelled', notes: nota }).eq('bill_id', bayaran.id);
// school_badge_status.payment_status kekal 'pending' — sekolah masih perlu
// membayar, dan bil yang dibatalkan tidak mengubah itu.
```

Ini keputusan yang disengajakan dan alasannya munasabah: bil luput tidak
memadamkan hutang. Tetapi kesannya di skrin ialah sekolah kelihatan mempunyai
bayaran yang sedang berjalan sedangkan tiada bil wujud. Tiada apa yang
menunjukkan kepada guru bahawa mereka perlu memulakan semula.

**Kes sebenar:** SMK GUNUNG RAPAT tinggal pada `pending` selepas bil RM85
luput pada 14 Ogos tanpa sebarang percubaan bayaran.

Perlu ditegaskan: keadaan ini **tidak** menyekat sekolah daripada membuat bil
baharu — `bilTerbuka` sudah `cancelled`, jadi tiada halangan. Ia salah pada
paparan dan laporan, bukan pada pintu. Lihat soalan **S5**.

---

## 7. Soalan yang mesti ditutup sebelum kod ditulis

| # | Soalan | Keputusan |
|---|---|---|
| ~~**S1**~~ | ~~Pencetus pangkalan data yang melarang `paid` → `not_required`?~~ | **DITUTUP: Ya, tambah.** Pembaikan kod menutup laluan yang diketahui; pencetus menutup yang belum diketahui |
| ~~**S2**~~ | ~~Adakah pendaftaran pegawai-sahaja sah pada siri berbayar?~~ | **DITUTUP: Ya, sah.** Cadangan asal K2 dibatalkan; lihat §3 yang ditulis semula dan soalan baharu S7 |
| ~~**S3**~~ | ~~Adakah pemanggil lain selain `UserDashboard`?~~ | **DITUTUP.** Carian seluruh repo: satu-satunya pemanggil ialah `UserDashboard.tsx:1094`. `AdminSchools.tsx` mengimport `unlockSchoolBadge`, bukan yang ini. Hadkan kepada `siri` yang diminta tanpa syarat |
| ~~**S4**~~ | ~~Apakah maksud `submissions.status` sekarang?~~ | **DITUTUP: biarkan, ia warisan.** `school_badge_status` ialah sumber kebenaran dan ia memang berkunci pada siri. K4 tidak dibaiki |
| ~~**S5**~~ | ~~`payment_status` selepas bil dibatalkan atau luput?~~ | **DITUTUP: nilai baharu `expired`.** Perlu migrasi yang menggugurkan CHECK constraint mengikut definisi, bukan nama |
| ~~**S6**~~ | ~~Urutan pemasangan?~~ | **DITUTUP: K1+K2 dahulu**, kemudian K3-K5 selepas disahkan stabil |
| ~~**S7**~~ | ~~Program RM0 dalam siri yang mempunyai bil: namakan atau tahan?~~ | **DITUTUP: namakan, jangan tahan.** Menahannya menyandera pendaftaran percuma pada bayaran yang mungkin tidak pernah dijelaskan. Lihat §3 |

---

## 8. Kesan sampingan yang dijangka

- **K1 tidak mengubah apa-apa yang dilihat guru.** Ia hanya berhenti memadam
  rekod bayaran. Tiada sekolah yang boleh menghantar sebelum ini akan tersekat
- **K2 menambah notis, bukan sekatan.** Selepas S7, tiada pendaftaran yang
  dilangkau; guru cuma akan nampak senarai program yang dihantar tanpa yuran.
  Sekolah yang selama ini tidak sedar Jaya turut dihantar akan mula sedar
- **K3 mengurangkan apa yang dihantar oleh satu tekanan butang.** Sekolah yang
  bergantung pada kelakuan lama tanpa sedar — menekan Hantar sekali dan mendapati
  semua siri masuk — perlu menekan sekali bagi setiap siri. Ini betul, tetapi ia
  perubahan yang perlu diberitahu
- **S5(c) menambah nilai baharu pada CHECK constraint** `payment_status`. Migrasi
  mesti menggugurkan constraint mengikut **definisi**, bukan nama — seperti yang
  dilakukan dalam migrasi 050

## 9. Rancangan ujian

Setiap pembaikan diuji pada senario yang sebenarnya berlaku, bukan senario yang
dibayangkan:

1. **K1** — SMK TAMBUN · Maju · Siri 2: tolak, tambah pegawai tanpa yuran,
   hantar semula. `payment_status` mesti kekal `paid`
2. **K2** — SMK GUNUNG RAPAT · Jaya · Siri 2: dua pegawai, sifar peserta, hantar
   bersama Maju yang berbayar. Jaya mesti tetap dihantar, dan mesti **dinamakan**
   pada skrin bayaran sebelum guru meneruskan
3. **K3** — sekolah dengan peserta dalam dua siri: hantar Siri 1. Siri 2 mesti
   kekal `open`
4. **K5** — biarkan bil luput. `payment_status` mesti mencerminkan keputusan S5

Uji kering + pasang mengikut irama biasa bagi bahagian SQL. Bahagian Edge
Function tiada uji kering — ia diuji pada senario di atas selepas `deploy`.
