# RANCANGAN PENUH: Ciri "SIRI" — Program Berperingkat

> Status: **Rancangan (belum implementasi)** · Tarikh: 2026-07-14 · Skop: ScoutNadi (daftarpengakap)

---

## 1. Konteks & Masalah

Sesetengah program dijalankan secara **berperingkat (siri/sesi)**:

- **Siri 1** — cth Keris Emas (sedang berjalan)
- **Siri 2** — program lain (cth Keris Perak) **+** peserta **cicir** dari Siri 1 yang sambung program mereka

**Masalah tanpa "siri":**

- Sistem hanya kenal peserta ikut **(sekolah + badge + tahun)** — tiada konsep siri.
- Peserta Emas Siri 1 & Emas cicir Siri 2 = sama-sama "Keris Emas 2026" → **bercampur dalam satu senarai/kohort**, susah diasingkan.
- Statistik Siri 2 tak tepat (tak boleh asingkan siapa hadir siri mana).

---

## 2. Konsep Penyelesaian: Dimensi "SIRI"

Tambah satu **dimensi baharu `siri`** pada peserta — **tanpa memecahkan badge**.

| Peserta | Badge (kekal betul) | Siri |
|---------|:---:|:---:|
| Emas asal | Keris Emas 2026 | 1 |
| Emas **cicir** | Keris Emas 2026 | **2** |
| Perak baharu | Keris Perak 2026 | 2 |

➡️ Badge tetap betul (Emas dalam Emas, Perak dalam Perak — **tiada** silap masuk badge lain), tapi boleh **diasing paparan/statistik ikut siri**.

---

## 3. Skop: Opsyenal, Generik, Terasing

- **Generik** — bukan khusus Emas. Sesiapa boleh guna siri untuk **mana-mana program**.
- **Opsyenal per program + skop + tahun** — dikawal melalui toggle `siri_enabled` dalam `program_settings` (jadual sedia ada).
- **Terasing** — daerah/negeri yang **tak aktifkan** langsung **tak nampak** UI siri; semua peserta mereka kekal Siri 1. Kesan pada mereka = **SIFAR**.

| Daerah | Program | Siri |
|--------|---------|:---:|
| Kinta Utara | Keris Emas 2026 | aktif |
| Daerah lain | Keris Perak / Gangsa / apa-apa | aktif jika mahu |
| Daerah lain | — | tak aktif = biasa |

---

## 4. Cara Tag Siri — 3 Laluan

| Laluan | Bagaimana |
|--------|-----------|
| **Daftar baharu** (borang) | Selektor "Siri" (dropdown, macam Tahun) |
| **Import Naik** | Pilih **Program sasaran** + **Siri sasaran** (cth import cicir ke Keris Emas 2026, Siri 2) |
| **Tandakan sedia ada** | Pilih murid dalam senarai lalu aksi **"Set Siri 2"** (pilih manual) |

---

## 5. Penapis "Siri" di Semua Paparan

Bila siri diaktifkan, dropdown **Siri (1 / 2 / Semua)** muncul di:

- **Paparan sekolah (UserDashboard)** — sekolah pilih *Keris Emas* + *Siri 2* maka **hanya murid Siri 2** muncul (selesaikan masalah senarai bercampur)
- **Dashboard admin**
- **Tab Kehadiran** — statistik/kehadiran tepat setiap siri

---

## 6. Statistik & Kehadiran

- **Siri 1** = Keris Emas (siri 1)
- **Siri 2** = Keris Perak (semua) **+** Keris Emas (siri 2) — inilah "statistik tepat" yang dikehendaki
- Kehadiran scan boleh ditapis ikut siri.

---

## 7. Tempat Perubahan Teknikal (bila implementasi)

| # | Bahagian | Perubahan |
|---|----------|-----------|
| 1 | **Migrasi DB** | `siri smallint default 1` pada `submission_people`; `siri_enabled` pada `program_settings` |
| 2 | **Borang daftar** (`UserForm`) | Selektor Siri (bila aktif) |
| 3 | **Import Naik** (`UserDashboard`) | Selektor Program + Siri sasaran |
| 4 | **Senarai peserta** | Aksi "Set Siri" (pukal) |
| 5 | **Penapis Siri** | UserDashboard, AdminDashboard, tab Kehadiran |
| 6 | **Tetapan program** | Toggle "Aktifkan Siri" (admin daerah/negeri) |
| 7 | **Statistik/kehadiran** | Ambil kira `siri` bila aktif |

---

## 8. Prinsip Utama

1. **Badge kekal betul** — Emas tetap Emas, tiada silap masuk badge lain.
2. **Satu kohort, berbilang paparan** — Emas Siri 1 & 2 dalam satu kohort, tapi boleh diasing ikut siri.
3. **Opsyenal & generik** — sesiapa, mana-mana program, tanpa menjejaskan yang lain.
4. **Default = Siri 1** — data sedia ada tak berubah.

---

## 9. Aliran Kerja Contoh

**Sekolah rekod peserta Emas cicir untuk Siri 2:**

1. Admin daerah aktifkan **Siri** untuk Keris Emas 2026 (toggle tetapan program).
2. Sekolah log masuk, buka senarai **Keris Emas 2026**.
3. Pilih murid cicir, tekan **"Set Siri 2"** — ATAU guna **Import Naik** dan pilih Program = Keris Emas, Siri = 2.
4. Untuk lihat: pilih **Keris Emas + Siri 2** maka hanya murid Siri 2 muncul.

**Statistik Siri 2 (admin):**

1. Tab Kehadiran / Dashboard, pilih penapis **Siri 2**.
2. Sistem tunjuk: Keris Perak (semua) + Keris Emas (siri 2) sahaja.
