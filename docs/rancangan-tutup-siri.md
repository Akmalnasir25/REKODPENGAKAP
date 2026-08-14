# Rancangan: Tutup Siri Daripada Pilihan Pendaftaran

Status: **rancangan · belum implementasi**. Dua soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

---

## 1. Keperluan

Guru keliru memilih antara Siri 1, 2 dan 3, dan mendaftar ke siri yang salah. Kesannya sudah dibayar hari ini: tiga program terpaksa dipindahkan secara pukal daripada Siri 1 ke Siri 2 melalui SQL kerana sekolah tersalah isi.

Admin mahu menutup siri supaya ia **tidak muncul sebagai pilihan**, dan membukanya semula bila perlu — per program, per siri.

---

## 2. Separuh daripadanya sudah wujud

`program_siri_settings.is_closed` sudah ada sejak migrasi 028, sudah mempunyai kotak semak **Tutup** dalam jadual "Kawalan Per Siri", dan sudah dibaca serta ditulis oleh `getProgramSiriSettings` / `saveProgramSiriSettings`.

Yang tiada ialah kesan pada tempat yang penting.

### 2.1 Borang pendaftaran tidak pernah membacanya

`UserForm.tsx:125`:

```ts
const siriOptions = Array.from({ length: selectedProgramSetting?.maxSiri || 5 }, (_, i) => i + 1);
```

Senarai lungsur Siri ialah 1 hingga `maxSiri`, tanpa syarat. `is_closed` tidak dirujuk. Borang itu juga tidak memuatkan `program_siri_settings` langsung — ia hanya mempunyai `programSettings`.

### 2.2 Apa yang `is_closed` SEBENARNYA lakukan sekarang

Dua tempat, kedua-duanya di lapisan wang:

| Fungsi | Kesan |
|---|---|
| `check_siri_availability` | Memulangkan `ok: false, sebab: 'siri_ditutup'` |
| `claim_siri_seats` | Memaksa `seat_status = 'no_seat'` — bayaran diterima tetapi ditanda melebihi |

Jadi maksudnya hari ini ialah **"berhenti menjual tempat"**, bukan "sembunyikan daripada pendaftaran". Sekolah masih boleh mendaftar ke siri yang ditutup; mereka cuma tidak boleh membayarnya.

Itu bukan kecacatan — ia membenarkan draf dikumpul sementara pusingan penuh. Tetapi ia bermakna menggunakan semula bendera yang sama untuk menyembunyikan siri **menggabungkan dua maksud**, dan kotak semak Tutup yang sedia ada akan mula melakukan sesuatu yang lebih daripada sebelumnya.

### 2.3 Tiga tempat memilih siri, bukan satu

| Tempat | Fail |
|---|---|
| Borang pendaftaran | `UserForm.tsx:681` |
| Import Naik — siri sasaran | `UserDashboard.tsx:2338` |
| Tindakan pukal "Set Siri" | `UserDashboard.tsx:949` |

Ketiga-tiganya membenarkan guru memilih siri, dan ketiga-tiganya mesti menghormati penutupan. Membetulkan borang sahaja meninggalkan dua pintu belakang yang lebih senyap daripada pintu hadapan.

### 2.4 Perangkap dalam pemilihan lalai

`UserForm.tsx:216`:

```ts
if (!siriEnabled || registrationSiri > siriOptions.length) setRegistrationSiri(1);
```

Ia jatuh kembali kepada **Siri 1** tanpa syarat. Kalau Siri 1 ditutup, borang akan memilih siri yang tertutup sebagai lalai — tepat kesilapan yang ciri ini cuba hapuskan. Lalai mesti menjadi siri terbuka yang pertama.

---

## 3. Keputusan

**K1 — Rekod sedia ada tidak terjejas.**
Menutup siri hanya mengeluarkannya daripada **pilihan baharu**. Peserta yang sudah didaftarkan dalam siri itu kekal kelihatan, kekal dikira, dan kekal boleh dihantar. Kalau tidak, menutup Siri 1 akan menyembunyikan pendaftaran yang sudah disahkan.

**K2 — Semua siri ditutup bermakna program ditutup.**
Kalau setiap siri bagi program itu ditutup, borang memaparkan mesej program tidak dibuka dan bukan senarai lungsur kosong. Senarai kosong kelihatan seperti sistem rosak.

**K3 — Ketiga-tiga pemilih dibetulkan serentak** (§2.3), termasuk lalai (§2.4).

---

## 4. Keputusan lanjut

**K4 — `is_closed` diguna semula. Tiada lajur baharu.**

Satu kotak semak bermaksud "siri ini tutup" sepenuhnya: tiada pendaftaran baharu, dan tiada jualan tempat. Menutup siri **tidak** menutup program — itu kawalan berasingan pada aras program (`badges.isOpen`), dan ia tidak disentuh.

Maksud bendera ini melebar daripada "berhenti jual tempat" kepada "tutup siri". Ia selamat kerana disahkan tiada program menggunakannya sebelum ini; kalau ada yang menggunakannya semata-mata untuk menghentikan bayaran, mereka akan mendapat kesan tambahan yang tidak diminta.

**K5 — Siri tertutup dipaparkan, dilumpuhkan, berlabel `(DITUTUP)`.**

Bukan disembunyikan. Guru nampak siri itu wujud dan faham kenapa ia tidak boleh dipilih; senarai yang tiba-tiba kehilangan Siri 1 menimbulkan pertanyaan kepada admin.

**K6 — Menyimpan mesti mengekalkan `is_closed` yang berdiri sendiri.**

Penapis `bermakna` dalam `saveProgramSiriSettings` sudah menerima `r.isClosed` sebagai bermakna, jadi baris yang satu-satunya tetapannya ialah "ditutup" tidak digugurkan. Ini disemak, bukan diandaikan — kegagalan `cddd0c8` bermula tepat begini.
