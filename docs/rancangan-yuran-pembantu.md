# Rancangan: Yuran Berasingan untuk Pembantu

Status: **rancangan · belum implementasi**. Satu soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

Ini **membalikkan K4** dalam `rancangan-peranan-pembantu.md`, yang menetapkan bahawa Pembantu dicaj pada kadar Penolong Pemimpin dan tidak dibezakan di lapisan wang.

---

## 1. Keperluan

Pembantu mempunyai kadar yuran tersendiri, di samping Peserta, Pemimpin dan Penolong Pemimpin. Empat kadar, bukan tiga.

---

## 2. Kenapa ini lebih besar daripada menambah satu lajur

K4 berfungsi kerana Pembantu berkongsi **segala-galanya** dengan Penolong: lajur yuran, medan snapshot, kiraan tempat, logik bil susulan. Memberinya kadar sendiri bermakna ia perlu identitinya sendiri di setiap lapisan itu.

### 2.1 Snapshot mesti dipecahkan

`payments` menyimpan `snapshot_peserta`, `snapshot_pemimpin`, `snapshot_penolong` — bilangan orang yang **dibil**, dibekukan pada masa bil dicipta. Snapshot inilah yang menjawab dua soalan penting kemudian:

- **Tempat**: `siri_seats_taken` menjumlahkan snapshot bagi peranan yang ada yuran
- **Bil susulan (§13.12)**: berapa ramai yang sudah dilindungi oleh bayaran terdahulu, supaya bil kedua mengecaj **beza** dan bukan jumlah penuh

Kalau Pembantu terus dikira ke dalam `snapshot_penolong` sedangkan kadarnya berbeza, kedua-dua jawapan itu salah. Bil susulan akan menganggap seorang pembantu sudah dibayar apabila sebenarnya seorang penolong yang dibayar, dan bezanya adalah wang sebenar.

Jadi `snapshot_pembantu` bukan pilihan.

### 2.2 `resolve_program_fees` menukar bentuk pulangan

Fungsi itu memulangkan tiga lajur yuran. Menambah yang keempat mengubah jenis pulangannya, dan `create or replace function` **tidak boleh** berbuat demikian — ia mesti `drop` dahulu. Perangkap yang sama sudah dilanggar dua kali dalam projek ini (`get_payment_methods`, `check_siri_availability`).

### 2.3 Luas kesan

`fee_penolong` muncul **27 kali** dalam 17 fail. Setiap satu ialah tempat yang menyenaraikan tiga peranan berbayar; setiap satu perlu menjadi empat.

| Lapisan | Perlu berubah |
|---|---|
| `program_settings` | `fee_pembantu` |
| `program_fee_overrides` | `fee_pembantu` — jika tidak, kadar per siri / jenis sekolah tidak boleh dikenakan padanya |
| `resolve_program_fees` | `drop` + `create`, empat lajur pulangan |
| `payments` | `snapshot_pembantu` |
| `siri_seats_taken` (043) | jumlahkan snapshot pembantu bila `fee_pembantu` tidak null |
| `claim_siri_seats`, `check_siri_availability` (048) | corak yang sama |
| `baki_tempat_siri` (050) | asingkan PEMBANTU daripada penolong, bergantung pada `fee_pembantu` |
| `create-payment-bill` | baldi kiraan keempat, yuran keempat, snapshot keempat, baki susulan keempat |
| `programSummary` | `countPembantu` + jumlahnya |
| `AdminBadges` | baris yuran keempat dalam jadual kadar, dan dalam jadual override |
| `paymentService` | `bilPembantu` dalam rumusan, resit, CSV |
| `ProgramSetting` | `feePembantu` |

---

## 3. Keputusan

**K1 — `fee_pembantu` mengikut corak `fee_penolong` sepenuhnya.**
Lajur pada `program_settings` DAN pada `program_fee_overrides`. Membiarkan override keluar bermakna kadar Pembantu tidak boleh berbeza antara siri atau jenis sekolah sedangkan tiga yang lain boleh — percanggahan yang akan ditemui pada masa paling menyusahkan.

**K2 — `snapshot_pembantu` pada `payments`, lalai 0.**
Baris sedia ada mendapat 0, yang betul: tiada bil terdahulu pernah mengecaj sesiapa sebagai Pembantu, kerana peranan itu baru wujud.

**K3 — "Sesiapa yang dicaj mengambil tempat" kekal.**
Pembantu mengambil tempat apabila `fee_pembantu` bukan null, dan tidak apabila null. Tiada peraturan baharu; peraturan sedia ada dikenakan pada peranan keempat.

**K4 — Migrasi tidak mengubah tingkah laku sedia ada.**
Ini bergantung pada soalan di bawah.

---

## 4. Keputusan tertutup

**K5 — `fee_pembantu` bermula NULL.**

Semakan menunjukkan **10 Pembantu sudah didaftarkan**. Itu tidak mengubah keputusan, kerana didaftar bukan bermakna dibil:

- Bil yang **sudah dibayar** tidak terjejas. Pembantu di dalamnya berada dalam `snapshot_penolong`, dan tempatnya kekal dikira oleh cabang `fee_penolong` yang tidak disentuh. Wang yang sudah diterima tidak berubah nilainya.
- Bil yang **belum dijana** tidak akan mengecaj pembantu sehingga kadar ditetapkan.

Jadi risikonya bukan data rosak, tetapi masa: **kadar mesti ditetapkan sebelum sekolah yang mempunyai pembantu menghantar.** Uji kering menyenaraikan sekolah tersebut berserta status bayarannya supaya senarai itu diketahui, bukan diandaikan.

Menyalin `fee_penolong` ditolak atas sebab yang sama seperti backfill dalam migrasi 049: ia menulis nilai ke dalam setiap program, termasuk yang tidak pernah mahu Pembantu langsung, dan nilai itu kemudian menyimpang tanpa sesiapa memilihnya.
