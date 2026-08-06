# RANCANGAN PENUH: Pembayaran Online & Pengesahan Bayaran

> Status: **Rancangan (belum implementasi)** · Tarikh: 2026-08-06 · Skop: ScoutNadi (daftarpengakap)

---

## 1. Konteks & Masalah

Sistem sedia ada ada tetapan **caj/yuran** per program (`program_settings`: fee_peserta, fee_pemimpin, fee_penolong) — tapi ini **informational sahaja**. Tiada cara sebenar untuk kutip bayaran atau tahu sama ada sekolah dah bayar atau belum. Semua peserta terus dikira dalam statistik sebaik sahaja didaftar, tak kira bayaran.

**Matlamat:** peserta hanya dikira dalam statistik **rasmi** selepas bayaran disahkan — sama ada secara automatik (gateway online) atau secara manual (admin sahkan bukti pembayaran offline seperti cheque/tunai/pindahan bank).

---

## 2. Keputusan Reka Bentuk

| # | Soalan | Keputusan |
|---|--------|-----------|
| 1 | Granulariti bayaran | **Per pendaftaran (submission)**, bukan per-peserta — sekolah daftar semua peserta dulu, satu bil untuk jumlah keseluruhan (fee_peserta/pemimpin/penolong × bilangan setiap peranan). Jumlah **dibekukan** masa submit — kalau admin ubah caj kemudian, bil sedia ada tak berubah. |
| 2 | Gateway online | **ToyyibPay** — **diutamakan, dibina dahulu (Fasa 1)**. Kaedah utama untuk kutip bayaran. |
| 3 | Pengesahan manual | Dibina **kemudian (Fasa 2)** — kaedah sokongan untuk cheque/tunai/pindahan bank & fallback kalau webhook ToyyibPay gagal/tak sesuai untuk sesetengah sekolah. |
| 4 | Kaedah bayaran manual | Sekolah **hantar bukti** (gambar/PDF resit, slip bank, cheque) → status jadi "Menunggu Semakan" → **admin review** bukti → admin **sahkan** atau **tolak** (dengan sebab, sekolah boleh hantar semula). |
| 5 | Keterlihatan sebelum disahkan | **Disembunyikan dari statistik rasmi** (macam konsep draf sedia ada), tapi tetap boleh dilihat dalam tab/senarai berasingan ("Belum Bayar" / "Menunggu Semakan") untuk susulan. |
| 6 | Edit peserta LEPAS bayaran disahkan | **Kena lalui kitaran kunci-buka**: admin "Buka Semula untuk Edit" → keluar statistik automatik → sekolah edit & hantar pengesahan semula → admin semak & sahkan semula → dikunci balik. |
| 7 | Tarik diri peserta LEPAS bayaran disahkan | **Guna ciri Penarikan Diri sedia ada terus** — TIADA perlu buka kunci/reject bayaran. Automatik keluar dari statistik aktif; bayaran kekal `paid` (refund/kredit diuruskan berasingan oleh admin kalau perlu). |
| 8 | Bilangan peserta berubah lepas `paid` (via kitaran edit §5.4) | **TIDAK dikira semula automatik.** Bila admin semak permintaan edit, sistem papar rekod bayaran asal (jumlah dibayar, bilangan peserta masa tu, tarikh) bersebelahan dengan bilangan peserta baharu — admin putuskan sendiri (bayaran tambahan/refund/terima beza). Guna rekod `payments` tersimpan (dah disahkan masa bayaran asal via §6.2) — tak perlu panggil API ToyyibPay semula setiap kali, sebab data tu dah sah. Sebab tambahan: kebanyakan gateway kecil Malaysia (termasuk ToyyibPay) **tak sokong refund automatik via API** — refund perlu diuruskan manual, jadi automasi keputusan kewangan di sini memang terhad. |

---

## 3. Struktur Data (cadangan konsep — bukan SQL sebenar)

### Jadual baharu `payments`
Satu rekod per **percubaan** bayaran (sejarah penuh disimpan, bukan overwrite):

| Lajur | Kegunaan |
|-------|----------|
| `submission_id` | Rujuk `submissions` — satu bayaran = satu pendaftaran/sekolah |
| `amount` | Jumlah dikira & dibekukan masa submit |
| `method` | `toyyibpay` \| `cheque` \| `cash` \| `bank_transfer` \| `lain` |
| `status` | `pending` \| `pending_review` \| `paid` \| `rejected` \| `failed` |
| `reference_number` | No. cek / rujukan transaksi / slip bank |
| `external_bill_code` / `bill_url` | Khusus ToyyibPay (billCode + pautan bayaran) |
| `confirmed_by` | Admin yang sahkan (kaedah manual); kosong jika auto (webhook) |
| `confirmed_at` | Bila disahkan |
| `rejected_reason` | Sebab ditolak (kalau berkenaan) |
| `notes` | Catatan tambahan |

### `submissions.payment_status`
Lajur "cache" pantas untuk filter (not_required / pending / pending_review / paid / rejected). Default `not_required` — **semua program sedia ada tak terjejas langsung**.

### `program_settings.payment_online_required`
Togol BAHARU, berasingan daripada `payment_enabled` sedia ada. `payment_enabled` kekal sebagai paparan caj informational (tingkah laku sekarang, tak berubah). `payment_online_required` (nama lebih tepat: **"wajib bayar sebelum dikira"**) mengaktifkan seluruh aliran bayaran & kunci statistik untuk program tersebut.

### Bukti pembayaran — reuse `attachments`
Jadual `attachments` (submission_id, file_path, mime_type, file_size) **sudah wujud dalam schema tapi langsung tak digunakan**. Cadang reuse terus untuk bukti bayaran, tambah satu lajur `category`/`type` (cth `'payment_proof'`) untuk bezakan daripada kegunaan lain kelak (cth sijil). Storan fail guna Cloudflare R2 sedia ada (dah dipakai untuk sijil kursus).

---

## 4. Aliran Status Bayaran

```
                         ┌── admin/webhook sahkan ──┐
                         ▼                          │
pending ──[bukti dihantar]──▶ pending_review ──▶  paid  (DIKIRA dlm statistik, DIKUNCI)
   ▲                              │                  │
   └──────[admin tolak + sebab]───┘                  │ admin "Buka Semula untuk Edit"
                                                       ▼
                                          pending_review_amend (KELUAR statistik semula)
                                                       │ sekolah edit + hantar semula
                                                       ▼
                                              pending_review ──▶ paid (dikunci semula)
```

- **ToyyibPay**: `pending` → (bayar di gateway) → webhook → `paid` terus (skip `pending_review`, sebab pengesahan automatik pihak gateway).
- **Manual (cheque/tunai/pindahan bank)**: `pending` → (sekolah hantar bukti) → `pending_review` → admin sahkan/tolak.

---

## 5. Aliran Kerja

### 5.1 Sekolah — Bayar Online (ToyyibPay)
1. Isi borang daftar macam biasa → Hantar
2. Sistem kira jumlah ikut bilangan peserta/pemimpin/penolong, cipta rekod `payments` (pending), panggil ToyyibPay `createBill` **melalui Supabase Edge Function** (kunci rahsia server-side sahaja)
3. Sekolah dibawa ke pautan bayaran ToyyibPay (FPX/kad)
4. ToyyibPay panggil **webhook** kita (server-to-server, bukan redirect browser) → sahkan & kemaskini `payments.status = 'paid'` + `submissions.payment_status = 'paid'`
5. Sekolah redirect balik ke app, papar status terkini (poll semula dari DB)

### 5.2 Sekolah — Bayar Manual (cheque/tunai/pindahan bank)
1. Isi borang daftar → Hantar
2. Sistem papar jumlah & arahan bayaran (no. akaun/cara cheque dsb — tetapan admin)
3. Sekolah bayar di luar sistem, kembali ke app, **muat naik bukti** (gambar/PDF) + isi no. rujukan
4. Status → `pending_review`, masuk queue admin

### 5.3 Admin — Semak & Sahkan (macam corak `PengesahanTab.tsx` sedia ada)
1. Admin buka tab "Bayaran Menunggu Semakan"
2. Lihat senarai + bukti yang dimuat naik
3. **Sahkan** → `paid`, submission dikunci, terus masuk statistik rasmi
4. **Tolak** (+ sebab) → balik ke `pending`, sekolah boleh hantar bukti semula

### 5.4 Edit peserta lepas `paid`
1. Sekolah cuba edit → sistem tunjuk "Dikunci — hubungi admin" (macam mekanisme kunci sedia ada)
2. Admin klik **"Buka Semula untuk Edit"** → `payment_status` → `pending_review_amend`, **keluar dari statistik automatik**
3. Sekolah edit (nama/butiran) → hantar pengesahan semula → `pending_review`
4. Admin semak perubahan — sistem papar **rekod bayaran asal** (jumlah dibayar, bilangan peserta masa bayar, tarikh) **bersebelahan** dengan bilangan peserta baharu selepas edit, supaya beza nampak jelas
5. Admin putuskan sendiri kalau ada beza (bayaran tambahan/refund/terima beza — di luar sistem, tiada automasi) → sahkan → `paid`, dikunci semula, masuk statistik rasmi

### 5.5 Tarik diri peserta lepas `paid`
1. Guna ciri Penarikan Diri **sedia ada terus** (`is_withdrawn`, sebab, nota) — tiada langkah tambahan
2. Peserta automatik keluar dari senarai/statistik aktif
3. `payments.status` kekal `paid` (jumlah asal) — admin uruskan refund/kredit berasingan kalau perlu (di luar skop Fasa 1)

---

## 6. Butiran Teknikal: Integrasi ToyyibPay

### 6.1 Cipta Bil — kunci jumlah dari awal

Panggil `createBill` API ToyyibPay (melalui Supabase Edge Function, bukan frontend) dengan parameter penting:

| Parameter | Nilai | Kenapa |
|-----------|-------|--------|
| `billPriceSetting` | `1` (Jumlah Tetap) | Pembayar **tak boleh ubah** amount di halaman ToyyibPay — dikuatkuasakan oleh gateway sendiri, bukan sekadar kita "agak" lepas bayar |
| `billAmount` | Dalam **sen** (cth RM250.00 → `25000`) | Format wajib API ToyyibPay |
| `billExternalReferenceNo` | ID rekod `payments` kita | Kunci pemadanan — bila webhook masuk balik, terus tahu bayaran ni untuk pendaftaran/sekolah mana |
| `billCallbackUrl` | URL Edge Function webhook kita | Notifikasi server-ke-server lepas bayaran |
| `billReturnUrl` | URL app kita (halaman status) | **UX sahaja** — browser redirect lepas bayar, BUKAN sumber sah untuk kemaskini status (boleh ditutup/gagal redirect) |
| `categoryCode` | Category ToyyibPay kita | Dicipta sekali (manual/API) sebelum boleh cipta bil, simpan dalam config/env |

### 6.2 Pengesahan Bayaran — dua lapisan

1. **Webhook (callback)**: ToyyibPay POST ke `billCallbackUrl` dengan `billcode`, `order_id` (=`billExternalReferenceNo`), `status` (1=berjaya), `amount`.
2. **Double-check wajib**: Callback ToyyibPay **tiada tandatangan kriptografi** (tak macam Stripe) — jadi selepas terima callback, Edge Function kita mesti panggil **balik** API ToyyibPay (`getBillTransactions`, guna secret key) untuk sahkan status & amount terus dari server ToyyibPay sendiri, sebelum tanda `payments.status = 'paid'`. Elak terima callback palsu/spoof yang dihantar terus ke URL webhook kita.

```
1. Cipta bil: amount=25000 (sen), billPriceSetting=1, billExternalReferenceNo=payment.id
2. Sekolah bayar di ToyyibPay — jumlah dikunci, tak boleh ubah
3. ToyyibPay POST ke webhook kita → terima billcode + order_id
4. Edge Function panggil balik getBillTransactions(billcode) → sahkan SENDIRI status+amount
5. Jika status=berjaya DAN amount = jumlah dijangka → payments.status = 'paid'
```

### 6.3 Persekitaran & Keselamatan

- **Sandbox dahulu**: ToyyibPay ada persekitaran ujian (`dev.toyyibpay.com`) berasingan daripada produksi (`toyyibpay.com`) — bangunkan & uji di sandbox sebelum guna akaun sebenar
- **Kunci rahsia** (`userSecretKey`): simpan sebagai **Supabase Edge Function secret** (env var) sahaja — jangan sesekali terdedah di kod frontend/browser
- **Category**: cipta sekali sahaja (`categoryCode`), simpan dalam config — semua bil rujuk category yang sama

### 6.4 Webhook Gagal — Lapisan Cuba-Semula

ToyyibPay gateway ringkas — **tak boleh anggap webhook mesti sampai** (tiada jaminan retry kukuh macam Stripe). Reka bentuk perlu gabung beberapa lapisan, disusun ikut kekerapan berjaya:

| Lapisan | Bila berlaku | Cara |
|---|---|---|
| **1. Check-on-return** | Sekolah redirect balik ke `billReturnUrl` lepas bayar | Sebelum papar status di UI, app terus panggil `getBillTransactions` sendiri — jangan tunggu webhook. Tangkap majoriti kes serta-merta. |
| **2. Webhook** | ToyyibPay POST ke `billCallbackUrl` | Kalau sampai, proses segera (lihat §6.2) |
| **3. Cron reconciliation** | Job berjadual (Supabase Scheduled Edge Function), setiap beberapa minit | Cari `payments` status `pending` (kaedah ToyyibPay) yang dah lepas cth 5-10 minit sejak bil dicipta → panggil `getBillTransactions` untuk semak status sebenar → kemaskini kalau dah bayar. Tangkap kes browser ditutup sebelum redirect & webhook gagal. |
| **4. Admin manual** | Jarang perlu — injap terakhir | Admin semak dashboard ToyyibPay sendiri, tandakan "Dibayar (Manual)" dalam sistem kita |

Keperluan tambahan pada webhook handler sendiri:
- **Idempoten** — semak `billcode`/`order_id` belum diproses (status belum `paid`) sebelum kemaskini, elak proses berulang kalau ToyyibPay hantar > 1 kali
- **Respons cepat & betul** — Edge Function mesti balas HTTP 200 lepas berjaya proses
- **Log setiap webhook diterima** (termasuk yang gagal) untuk debug kemudian

---

## 7. Kesan pada Statistik & Paparan

Reuse pattern **"Papar Draf"** sedia ada (deduplicateRecords/showDrafts): submission dengan `payment_status` bukan `paid` (dan program berkenaan `payment_online_required = true`) **disembunyikan dari statistik/laporan rasmi secara default**, tapi boleh dilihat dalam tab/senarai baharu:
- **"Belum Bayar"** — status pending (belum hantar bukti/belum bayar online)
- **"Menunggu Semakan"** — status pending_review (bukti dihantar, tunggu admin)

Program yang `payment_online_required = false` (majoriti program sedia ada) **langsung tak terjejas** — semua kekal macam sekarang.

---

## 8. Reuse Infrastruktur Sedia Ada

Ni bukan bina dari kosong — banyak boleh *reuse*:

| Keperluan | Reuse daripada |
|-----------|-----------------|
| Simpan bukti bayaran | Jadual `attachments` (wujud, tak digunakan) + storan R2 sedia ada |
| UI queue semak & sahkan/tolak | Corak `PengesahanTab.tsx` sedia ada |
| Kunci pendaftaran lepas disahkan | Mekanisme lock/approve/reopen (`school_badge_status`) sedia ada |
| Sembunyi dari statistik sehingga syarat dipenuhi | Corak `showDrafts`/deduplicateRecords sedia ada |
| Tarik diri lepas bayar | Ciri Penarikan Diri (`is_withdrawn`) sedia ada |

---

## 9. Fasa Pembangunan

### Fasa 1 (Teras — ToyyibPay)
- [ ] Migrasi: `payments` table + `submissions.payment_status` + `program_settings.payment_online_required`
- [ ] Togol admin: "Wajib Bayar" per program (dalam modal Yuran/Baju/Siri sedia ada)
- [ ] Edge Function: create-toyyibpay-bill
- [ ] Edge Function: toyyibpay-callback (webhook, sah & auto-kemaskini status ke `paid`)
- [ ] UI: butang "Bayar Online" lepas submit + redirect ke ToyyibPay + status polling lepas kembali
- [ ] Statistik/laporan: tapis ikut `payment_status = paid` (reuse pattern draf)
- [ ] Tab "Belum Bayar" untuk susulan
- [ ] Kitaran kunci-buka untuk edit lepas `paid` (reuse mekanisme lock sedia ada)
- [ ] Sahkan tarik diri lepas `paid` guna ciri sedia ada (tiada perubahan tambahan diperlukan)

### Fasa 2 (Sokongan — Pengesahan Manual)
- [ ] Reuse `attachments` untuk bukti bayaran (tambah lajur `category`)
- [ ] Sekolah: pilihan kaedah manual (cheque/tunai/pindahan bank) — papar arahan bayaran + upload bukti + no. rujukan
- [ ] Admin: tab "Bayaran Menunggu Semakan" — sahkan/tolak
- [ ] Resit/invois PDF automatik lepas bayar (kedua-dua kaedah)

### Fasa 3 (Lanjutan)
- [ ] Reminder (Telegram/WhatsApp) untuk bayaran belum selesai
- [ ] Rumusan bayaran per program (jumlah dikutip, pending, ditolak) dalam `ProgramSummaryView`
- [ ] Pilihan bayar individu (bukan sekali gus) jika diperlukan kelak
- [ ] Refund/kredit workflow
- [ ] Reconcile dengan modul Billing dalaman sedia ada (`BILLING_MODULE_DESIGN.md`)

---

## 10. Soalan Terbuka (belum diputuskan, tak menghalang Fasa 1)

| # | Soalan |
|---|--------|
| 1 | Refund penuh/sebahagian — proses/rekod macam mana? |
| 2 | Tempoh sah bukti bayaran belum disemak — perlu auto-expire/reminder? |
| 3 | Siapa boleh tetapkan kaedah bayaran manual yang dibenarkan (cheque/tunai/pindahan bank) per program — developer sahaja atau admin negeri/daerah juga? |

---

## 11. Prinsip Utama

1. **ToyyibPay diutamakan (Fasa 1), manual sebagai sokongan (Fasa 2)** — struktur data (`payments`, `payment_status`) sama untuk kedua-dua kaedah, jadi manual boleh ditambah kemudian tanpa ubah reka bentuk teras.
2. **Opsyenal & tak menjejaskan sedia ada** — program yang tak aktifkan `payment_online_required` kekal 100% macam sekarang.
3. **Jejak audit penuh** — setiap percubaan bayaran, bukti, pengesahan/penolakan direkod (siapa, bila, kenapa).
4. **Edit lepas bayar mesti melalui admin** — elak data berubah senyap-senyap lepas duit diterima; tarik diri dikecualikan sebab dah ada mekanisme audit sendiri.
5. **Reuse dahulu, bina baharu bila perlu** — banyak infrastruktur (attachments, R2, lock/reopen, showDrafts, PengesahanTab) sudah wujud dan sesuai digunakan semula.
6. **Sistem bantu papar maklumat, bukan automatikkan keputusan kewangan** — bila ada beza jumlah/bilangan peserta (cth lepas edit), sistem papar data berkaitan dengan jelas tapi admin yang putuskan tindakan; elak automasi buta untuk hal kewangan sensitif seperti refund.
