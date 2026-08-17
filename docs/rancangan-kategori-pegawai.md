# Rancangan: kategori terbawa pada pegawai

**Status:** DRAF — soalan belum ditutup. Tiada kod ditulis sehingga §3 dijawab.

**Tarikh:** 17 Ogos 2026

---

## 1. Laporan

Cikgu Ahmad Nazrul, 17 Ogos:

> Pendaftaran pemimpin dengan penguji tu dia auto ke Pengakap Kanak-kanak,
> sebab sebelum pilih pemimpin tu dia memang dah select peserta… bila dia ubah
> dari peserta ke pemimpin, yang kategori tu dah hilang, tapi bila simpan dia
> masih bawa Pengakap Kanak-kanak.

Dan yang kedua, lebih penting: pemimpin yang **mahu** menetapkan Pengakap Muda
atau Remaja tidak boleh — ia tetap tersimpan sebagai Kanak-kanak.

## 2. Punca

Tiga baris, dalam dua fail.

**Lalai baris baharu** (`UserForm.tsx:74`):

```ts
kategori: 'Pengakap Kanak-kanak',
```

Setiap baris bermula sebagai PESERTA dengan kategori ini.

**Medan hilang bila peranan bertukar** (`UserForm.tsx:1016`):

```tsx
{(person as any).role === 'PESERTA' && ( ...select Kategori... )}
```

Tukar peranan kepada PEMIMPIN dan medan itu hilang dari skrin. Nilainya kekal
dalam state, tidak tersentuh dan tidak kelihatan.

**Nilai basi disimpan** (`services/supabaseApi.ts:353`):

```ts
category: (p as any).kategori || (isPeserta ? 'Pengakap Kanak-kanak' : null),
```

Sandaran `: null` bagi bukan-peserta **tidak pernah berjalan**, kerana
`kategori` masih memegang 'Pengakap Kanak-kanak' daripada lalai itu. Ia truthy,
jadi ia menang.

## 3. Soalan

| # | Soalan |
|---|---|
| **G1** | Adakah pegawai (Pemimpin, Penolong, Pembantu, Penguji) sepatutnya MEMPUNYAI kategori? |

Laporan cikgu mencadangkan **ya** — dia cuba menetapkannya kepada Muda/Remaja.
Tetapi itu keputusan kau, bukan dia.

## 4. Kesan sampingan yang sudah wujud

Kad **Pecahan Kategori Peserta** dalam `AdvancedAnalytics.tsx:40` mengira
**setiap** rekod yang mempunyai kategori, termasuk pegawai. Setiap pegawai yang
membawa 'Pengakap Kanak-kanak' basi sedang menokok baldi itu sekarang.

Tajuknya berbunyi "Peserta", jadi ia salah tanpa mengira jawapan G1 — kadnya
patut mengira PESERTA sahaja, sama seperti kad Unit yang baharu.
