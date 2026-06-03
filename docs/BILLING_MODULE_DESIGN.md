# Modul Billing - Rekabentuk Sistem ScoutNadi

**Tarikh:** 30 Mei 2026  
**Status:** DRAF - Menunggu Kelulusan  
**Caj Ditentukan:** RM 1.50 / peserta / aktiviti

---

## 1. Gambaran Keseluruhan

Modul Billing membolehkan tracking kutipan yuran sistem (RM 1.50/peserta) bagi setiap program, kursus dan perkhemahan yang dijalankan di peringkat negeri dan daerah.

### Sasaran Pengguna

| Role | Akses | Keterangan |
|------|-------|-----------|
| Developer | Semua negeri & daerah | Lihat keseluruhan, verify, export |
| Admin Negeri | Negeri sendiri + semua daerah bawahnya | Lihat, tandakan kutipan, export |
| Admin Daerah | Daerah sendiri sahaja | Lihat, tandakan kutipan, export |
| Sekolah / Pemimpin | TIADA akses | Tidak perlu lihat billing |

---

## 2. Lokasi Dalam Sistem

| Role | Lokasi Tab |
|------|-----------|
| Developer | Developer Dashboard → Tab "Billing" |
| Admin Negeri | Admin Negeri Panel → Tab "Billing" |
| Admin Daerah | Admin Daerah Panel → Tab "Billing" |

---

## 3. Sumber Data

Tiada table billing berasingan diperlukan pada peringkat awal. Data dikira secara real-time dari:

| Table | Kegunaan |
|-------|----------|
| `courses` | Senarai program/kursus, skop, tarikh, status |
| `course_registrations` | Kira peserta aktif (exclude cancelled) |
| `negeri` | Nama negeri untuk grouping |
| `daerah` | Nama daerah untuk grouping |
| `leader_accounts` | Maklumat peserta (nama, IC, sekolah) |

### Formula Kutipan
```
Anggaran Kutipan = Bilangan Peserta Aktif × RM 1.50
Peserta Aktif = COUNT(course_registrations WHERE status != 'cancelled')
```

---

## 4. Paparan Billing

### 4.1 Ringkasan Kewangan (Kad Atas)

| Metrik | Keterangan |
|--------|-----------|
| Jumlah Kutipan Anggaran | Σ (peserta × RM 1.50) untuk semua program |
| Jumlah Kutipan Sebenar | Σ jumlah yang disahkan admin |
| Jumlah Peserta | Merentas semua program |
| Jumlah Program | Kursus + perkhemahan aktif |
| Purata Peserta/Program | Jumlah peserta ÷ Jumlah program |

### 4.2 Filter & Carian

| Filter | Pilihan |
|--------|---------|
| Tahun | 2025, 2026, Semua |
| Negeri | Semua / pilih negeri tertentu |
| Daerah | Semua / pilih daerah tertentu |
| Skop Program | Semua / Negeri / Daerah |
| Status Program | Semua / Terbuka / Tertutup / Tamat / Dibatalkan |
| Carian Teks | Nama program, kod program |

### 4.3 Jadual Utama - Per Program

| Lajur | Sumber | Keterangan |
|-------|--------|-----------|
| Negeri | courses.negeri_id → negeri.name | Grouping negeri |
| Daerah | courses.daerah_id → daerah.name | Grouping daerah |
| Nama Program | courses.name | Nama kursus/perkhemahan |
| Kod | courses.code | Kod unik program |
| Skop | courses.scope | negeri / daerah |
| Tarikh | courses.start_date - end_date | Tempoh program |
| Status | courses.status | open/closed/completed/cancelled |
| Peserta | COUNT(registrations ≠ cancelled) | Bilangan peserta aktif |
| Caj/unit | Default RM 1.50 (boleh ubah) | Yuran sistem per peserta |
| Anggaran Kutipan | peserta × caj/unit | Auto-kira |
| Kutipan Sebenar | Manual input oleh admin | Jumlah sebenar yang dikutip |
| Status Kutipan | Belum / Separa / Lengkap | Dropdown manual |
| Disahkan Oleh | Nama admin | Siapa yang sahkan |
| Tarikh Sahkan | Timestamp | Bila disahkan |
| Catatan | Text field | Nota tambahan |

### 4.4 Breakdown View (Drill-Down)

- **Klik negeri** → Lihat semua program dalam negeri itu
- **Klik program** → Lihat senarai peserta + detail bayaran individu

---

## 5. Flow Kerja

### 5.1 Admin Negeri/Daerah
```
1. Buka tab Billing
2. Sistem auto-papar semua program + kira peserta + anggaran kutipan
3. Admin semak bilangan peserta
4. Admin masukkan kutipan sebenar yang diterima
5. Admin tandakan status kutipan (Belum/Separa/Lengkap)
6. Admin simpan → rekod disimpan dengan timestamp + nama admin
7. Export Excel untuk laporan jawatankuasa
```

### 5.2 Developer
```
1. Buka tab Billing di Developer Dashboard
2. Pilih filter (tahun, negeri, daerah)
3. Lihat ringkasan keseluruhan merentas semua negeri/daerah
4. Verify kutipan yang dilaporkan admin
5. Export laporan penuh untuk audit
```

---

## 6. Perkara Perlu Diputuskan

| # | Soalan | Pilihan A | Pilihan B | Cadangan |
|---|--------|-----------|-----------|----------|
| 1 | Caj RM 1.50 fixed atau configurable? | Fixed semua program | Configurable per program (default RM 1.50) | **B** - ada kursus percuma, ada yang mahal |
| 2 | Track bayaran sebenar atau anggaran sahaja? | Anggaran auto sahaja | Anggaran + sebenar (manual input) | **B** - lebih tepat untuk audit |
| 3 | Perlu approval workflow? | Admin tick terus | Admin submit → developer approve | **A dahulu** - tambah approval kemudian jika perlu |
| 4 | Historical snapshot? | Real-time sahaja | Snapshot bulanan untuk trend | **Tambah kemudian** |
| 5 | Notifikasi kutipan rendah? | Tiada | Alert bila kutipan < X% dari anggaran | **Tambah kemudian** |
| 6 | Resit/invois digital? | Tiada | Generate PDF resit | **Tambah kemudian** |
| 7 | Billing hanya kursus atau termasuk pendaftaran ahli? | Kursus/aktiviti sahaja | Termasuk yuran keahlian tahunan | **Kursus dahulu** |
| 8 | Siapa boleh edit caj/unit? | Developer sahaja | Admin negeri + developer | **Developer sahaja** untuk kawalan |
| 9 | Perlu dashboard chart/graf? | Jadual sahaja | Jadual + chart (bar/pie) | **Jadual dahulu**, chart kemudian |
| 10 | Multi-currency atau MYR sahaja? | MYR sahaja | Support USD/SGD | **MYR sahaja** |

---

## 7. Fasa Pembangunan

### Fasa 1 (MVP)
- [ ] Tab Billing di Developer Dashboard
- [ ] Tab Billing di Admin Negeri & Daerah
- [ ] Auto-kira peserta dari course_registrations
- [ ] Caj default RM 1.50 (configurable oleh developer)
- [ ] Manual input kutipan sebenar + status
- [ ] Filter tahun, negeri, daerah, status
- [ ] Export Excel
- [ ] Simpan rekod kutipan dengan timestamp + admin name

### Fasa 2 (Enhancement)
- [ ] Approval workflow (admin submit → developer verify)
- [ ] Snapshot bulanan untuk trend analysis
- [ ] Chart/graf visualisasi
- [ ] Notifikasi kutipan rendah
- [ ] Breakdown per peserta individu

### Fasa 3 (Advanced)
- [ ] Resit/invois digital PDF
- [ ] Integration dengan payment gateway (FPX/ToyyibPay)
- [ ] Auto-reconcile bank statement
- [ ] Laporan tahunan automatik
- [ ] API untuk external accounting system

---

## 8. Anggaran Pendapatan (Simulasi)

### Senario: 1 Negeri, 3 Siri/Tahun, 500 Peserta/Siri

| Item | Nilai |
|------|-------|
| Peserta setahun | 1,500 |
| Caj per peserta | RM 1.50 |
| **Pendapatan setahun** | **RM 2,250** |
| Kos operasi minimum | RM 260 |
| **Untung bersih** | **RM 1,990** |

### Senario: 3 Negeri, Masing-masing 3 Siri, 500 Peserta/Siri

| Item | Nilai |
|------|-------|
| Peserta setahun | 4,500 |
| Caj per peserta | RM 1.50 |
| **Pendapatan setahun** | **RM 6,750** |
| Kos operasi | RM 1,980 |
| **Untung bersih** | **RM 4,770** |

### Senario: Skala Penuh (10 Negeri, 500 Peserta/Siri/Negeri/Tahun)

| Item | Nilai |
|------|-------|
| Peserta setahun | 15,000 |
| Caj per peserta | RM 1.50 |
| **Pendapatan setahun** | **RM 22,500** |
| Kos operasi | RM 1,980 |
| **Untung bersih** | **RM 20,520** |

---

## 9. Risiko & Mitigasi

| Risiko | Impak | Mitigasi |
|--------|-------|----------|
| Admin tidak update kutipan sebenar | Data tidak tepat | Reminder/notifikasi, required field |
| Peserta kurang dari jangkaan | Pendapatan rendah | Minimum viable cost structure |
| Bantahan terhadap caj RM 1.50 | Adoption rendah | Komunikasi nilai, mula RM 1 naik perlahan |
| Duplikasi pendaftaran inflate numbers | Kutipan terlebih | Unique constraint per course per leader |
| Admin salah input jumlah kutipan | Laporan salah | Audit trail, developer verify |

---

## 10. Nota Penting

- Caj RM 1.50 diserap dalam yuran aktiviti sedia ada, bukan cas berasingan
- Peserta tidak perlu bayar extra, admin asingkan dari yuran kutipan
- Sistem hanya track dan report, bukan collect payment secara langsung
- Semua data billing adalah read-only untuk sekolah/pemimpin
- Developer mempunyai akses penuh untuk audit dan verification
