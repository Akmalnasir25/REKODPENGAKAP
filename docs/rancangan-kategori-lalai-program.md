# Rancangan: kategori lalai mengikut program

**Status:** DRAF — soalan belum ditutup. Tiada kod ditulis sehingga §4 dijawab.

**Tarikh:** 17 Ogos 2026

---

## 1. Permintaan

Kategori peserta bermula pada nilai yang berbeza mengikut program, dan masih
boleh diubah manual.

| Program | Kategori lalai |
|---|---|
| Keris Gangsa, Keris Emas, Keris Perak | Pengakap Kanak-kanak |
| Usaha, Maju, Jaya | Pengakap Muda |
| Kemahiran | Pengakap Remaja |

## 2. Keadaan sekarang

Satu lalai tetap untuk semua program (`UserForm.tsx:74`):

```ts
kategori: 'Pengakap Kanak-kanak',
```

Itu sebabnya setiap pendaftaran Kemahiran bermula salah, dan guru perlu
menukarnya baris demi baris.

## 3. Program yang tidak disenaraikan

Permintaan meliputi tujuh program. Sekurang-kurangnya tiga lagi wujud:
**Pembantu CPR**, **Pembantu SM**, **Pengenalan Pengakap Udara**. Program baharu
juga akan ditambah kemudian.

Program tanpa lalai yang ditetapkan kekal pada Pengakap Kanak-kanak, seperti
sekarang.

## 4. Soalan yang mesti ditutup

| # | Soalan |
|---|---|
| **K1** | Peta ini disimpan di MANA — dalam kod, atau sebagai tetapan yang kau boleh ubah sendiri? |
| **K2** | Bila guru menukar program di tengah-tengah borang yang sudah ada baris, kategori baris sedia ada patut berubah atau kekal? |

### Nota untuk K1

Dalam kod bermakna setiap perubahan — program baharu, kategori bertukar —
memerlukan aku menyunting fail dan deploy semula. Sebagai tetapan bermakna satu
migrasi dan satu pemilih dalam Urus Program, tetapi selepas itu kau uruskan
sendiri.

### Nota untuk K2

Baris yang guru sudah ubah secara manual tidak sepatutnya ditulis ganti. Yang
boleh dibezakan ialah baris yang masih memegang lalai program LAMA — itu
hampir pasti tidak disentuh sesiapa.
