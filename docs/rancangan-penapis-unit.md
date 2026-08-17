# Rancangan: penapis Unit + kad rumusan Unit

**Status:** DITUTUP — §4 dijawab. Kod boleh ditulis.

**Tarikh:** 16 Ogos 2026

---

## 1. Permintaan

Dua perkara pada paparan rumusan data:

1. Penapis **Unit** dalam bar penapis — Perdana, Udara, Laut, PPKI, PPKI Udara
2. Kad **Pecahan Unit**, sama bentuk seperti "Pecahan Kategori Peserta" yang
   sedia ada

## 2. Keadaan sekarang

`SubmissionData.unit` sudah wujud (`types.ts:67`) dan diisi daripada
`submission_people.unit` (`services/supabaseApi.ts:224`). Nilai yang sah
disekat oleh CHECK constraint dalam migrasi 001:

```
'Perdana' | 'Udara' | 'Laut' | 'PPKI' | 'PPKI Udara' | null
```

Kad pecahan hidup dalam `components/ui/AdvancedAnalytics.tsx`. Pola sedia ada
(`categoryData`, baris 40-50) mengira daripada `yearData` dan memaparkannya
sebagai carta bar. Kad Unit akan mengikut pola yang sama persis.

Bar penapis hidup dalam `components/AdminDashboard.tsx:569-630`, dan sudah
mempunyai Tahun, Program, Siri, dan Jenis Sekolah. Penapis di situ mengalir ke
`baseFilteredData` → `displayedData` → **setiap tab, jadual dan eksport**, bukan
hanya carta.

## 3. Perkara yang menentukan reka bentuk

**Pegawai tiada unit.** `supabaseApi.ts:469` menetapkannya hanya untuk peserta:

```ts
unit: isPeserta ? (r.unit || 'Perdana') : ''
```

Jadi menapis "Udara" akan menyingkirkan **setiap** Pemimpin, Penolong, Pembantu
dan Penguji daripada paparan — bukan kerana mereka bukan Udara, tetapi kerana
medan itu kosong bagi mereka. Itu keputusan yang mesti dibuat secara sedar,
bukan kesan sampingan.

## 4. Soalan yang mesti ditutup

| # | Soalan | Keputusan |
|---|---|---|
| ~~**U1**~~ | ~~Pegawai disembunyikan atau dikekalkan semasa menapis Unit?~~ | **DITUTUP: sembunyikan.** Penapis Unit menunjukkan peserta unit itu sahaja |
| ~~**U2**~~ | ~~Kad Pecahan Unit mengira siapa?~~ | **DITUTUP: peserta sahaja** (PESERTA + PENERIMA RAMBU), sepadan dengan kad Pecahan Kategori di sebelahnya |

## 5. Kesan yang perlu diketahui

U1 bermakna penapis Unit **mengubah setiap tab**, bukan hanya carta — ia
mengalir melalui `baseFilteredData`, sama seperti penapis Program dan Siri.
Memilih "Udara" lalu membuka tab Pemimpin akan memberi senarai kosong. Itu
tingkah laku yang betul di bawah U1, tetapi ia akan mengejutkan kalau tidak
dijangka, jadi penapis itu diberi warna dan tajuk yang menyatakannya.
