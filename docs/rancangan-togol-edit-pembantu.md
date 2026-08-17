# Rancangan: togol edit berasingan untuk Pembantu

**Status:** DITUTUP — setiap soalan dalam §4 dijawab. Kod boleh ditulis.

**Tarikh:** 16 Ogos 2026

---

## 1. Permintaan

Panel **Kawalan Edit Pukal Mengikut Program** kini mempunyai tiga butang per
program pada setiap baris: Peserta, Pemimpin, Penguji. Tambah butang keempat
untuk **Pembantu**.

## 2. Keadaan sekarang

Kebenaran disimpan sebagai JSON dalam `school_badge_status.notes`, di bawah dua
kunci berasingan (`services/supabaseApi.ts:1364`):

| Kunci | Bila terpakai |
|---|---|
| `editPermissions` | Sebelum pendaftaran dihantar |
| `editPermissionsSelepas` | Selepas dihantar/disahkan — pegawai sahaja |

Setiap satu memegang tiga medan: `students`, `assistants`, `examiners`.

**Pembantu tiada medannya sendiri.** Ia dikawal oleh `assistants`, di dua
tempat:

```ts
// UserDashboard.tsx:680
if (role.includes('PENOLONG') || role === 'PEMIMPIN' || role === 'PEMBANTU')
  return perBadgePermissions?.assistants ?? allowAssistants;

// UserForm.tsx:435
const assistants = withSiri(allPeople.filter(p =>
  p.role === 'PEMIMPIN' || p.role === 'PENOLONG PEMIMPIN' || p.role === 'PEMBANTU'));
```

Jadi kerja sebenarnya ialah **memisahkan** Pembantu daripada `assistants`,
bukan sekadar menambah butang. Butang tanpa pemisahan itu tidak akan berkesan.

## 3. Perubahan yang diperlukan

1. **`supabaseApi.ts`** — tambah `'helpers'` pada union `permissionType`, dan
   pada cabang `'all'` bagi kedua-dua fasa
2. **`AdminSchools.tsx`** — butang keempat pada kedua-dua baris, label
   "Pembantu", serta pengiraan `allHelpersEdit` / `allHelpersSelepas`
3. **`UserDashboard.tsx:680`** — PEMBANTU membaca `helpers`, bukan `assistants`
4. **`UserForm.tsx:435`** — sama; dan `allowHelpers` berasingan daripada
   `allowAssistants`
5. **Tiada migrasi.** Ia JSON dalam `notes`; medan baharu hanya muncul apabila
   ditulis

## 4. Soalan yang mesti ditutup

| # | Soalan | Keputusan |
|---|---|---|
| ~~**P1**~~ | ~~Lalai bila medan `helpers` tiada?~~ | **DITUTUP: lalai OFF.** Pembantu terkunci sehingga admin menghidupkannya. Lihat amaran di bawah |
| ~~**P2**~~ | ~~Kedua-dua baris?~~ | **DITUTUP: ya**, sama seperti Pemimpin dan Penguji |
| ~~**P3**~~ | ~~Peranan dicaj kekal terkunci selepas hantar — terpakai pada Pembantu?~~ | **DITUTUP: ya.** Kalau `fee_pembantu` ditetapkan, togol Selepas Hantar dilumpuhkan dengan sebab dipaparkan |
| ~~**P4**~~ | ~~MASTER turut menyentuh Pembantu?~~ | **DITUTUP: ya**, jika tidak "SEMUA KATEGORI" berbohong |

## 5. Amaran daripada P1

Lalai OFF ialah **perubahan kelakuan pada hari pemasangan**, bukan kekal
neutral. Hari ini Pembantu mengikut butang Pemimpin; selepas ini ia tidak.
Setiap program yang butang Pemimpinnya ON akan kehilangan keupayaan mengedit
Pembantu sehingga admin menekan butang Pembantu yang baharu.

Sembilan program dalam senarai semasa, tujuh daripadanya dengan Pemimpin ON
pada baris pertama. Kesemuanya perlu dihidupkan semula secara manual kalau
sekolah masih perlu mengedit Pembantu.
