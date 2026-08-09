# RANCANGAN PENUH: Pembayaran Online & Pengesahan Bayaran

> Status: **Rancangan (belum implementasi)** · Tarikh: 2026-08-06 · Semakan teknikal: 2026-08-07 · Skop: ScoutNadi (daftarpengakap)
>
> Semakan 2026-08-07 menyelaraskan rancangan dengan kod sebenar dan merakam keputusan teras:
> granulariti bayaran (per sekolah+program+tahun+**siri**), susunan pintu (bayar → admin sahkan),
> akaun ToyyibPay per skop negeri/daerah, had tempat per **program × siri**,
> **bayaran sebagai syarat penghantaran** (tiada tempahan — bayar baru dapat tempat),
> dan **kunci/pengesahan ikut siri** supaya setiap siri ialah pusingan pendaftaran berasingan.
> Rujuk **§12 Semakan Terhadap Kod Sebenar** untuk rujukan fail/baris.
>
> ⚠ Keputusan siri ini ialah **satu-satunya** yang memaksa perubahan pada `utils/dataProcessing.ts` —
> semua keputusan lain berjaya mengelak fail tersebut. Lihat §7.

---

## 1. Konteks & Masalah

Sistem sedia ada ada tetapan **caj/yuran** per program (`program_settings`: fee_peserta, fee_pemimpin, fee_penolong) — tapi ini **informational sahaja**. Tiada cara sebenar untuk kutip bayaran atau tahu sama ada sekolah dah bayar atau belum.

**Penting — pintu statistik sudah wujud.** Peserta TIDAK terus dikira sebaik didaftar. Sistem sedia ada dah ada aliran pengesahan: sekolah hantar (`school_badge_status.status = 'submitted'`, sekolah terus terkunci) → admin sahkan (`status = 'approved'`) → barulah rekod masuk statistik rasmi (tapisan `approvedBadges` dalam `deduplicateRecords`).

**Matlamat:** jadikan bayaran sebagai **syarat untuk menghantar**, dan pengesahan admin kekal sebagai pintu statistik. Sekolah tidak boleh menghantar pendaftaran untuk pengesahan sebelum bayaran diuruskan.

---

## 2. Keputusan Reka Bentuk

| # | Soalan | Keputusan |
|---|--------|-----------|
| 1 | **Granulariti bayaran** | **Per `sekolah + program + tahun + siri`** — kunci SAMA dengan `school_badge_status` (selepas siri ditambah, Keputusan #1b), bukan per baris `submissions`. Sebab: setiap kali Hantar, satu baris `submissions` BAHARU dicipta; selepas "Buka Semula" sekolah boleh hantar lagi → satu program boleh ada beberapa baris submission. Kalau bil diikat pada `submission_id`, hantar semula = bil kedua & bayaran asal jadi yatim. |
| 1b | **Setiap siri = pusingan berasingan** | Siri 1 tutup cerita, kemudian Siri 2 dibuka dengan **peserta berlainan**. Sekolah yang sama mesti boleh hantar semula untuk badge yang sama pada siri berikutnya. Maka `school_badge_status` perlu lajur `siri` dalam kunci uniknya — mengikut preseden migrasi 025 yang buat perkara sama untuk `attendance_verifications`. Satu hantaran = satu siri (sudah berkuat kuasa dalam borang, lihat §12). |
| 1c | **Seorang peserta = satu siri sahaja bagi program yang sama** | Sesiapa yang sudah ada dalam Keris Emas Siri 1 **tidak boleh** didaftar dalam Keris Emas Siri 2. Tetapi orang sama **boleh** menyertai program berlainan pada siri berlainan (Keris Emas Siri 1 + Keris Perak Siri 2). **Sudah berkuat kuasa** dalam semakan pendua sedia ada (`UserForm.tsx:294-297` — padan IC + badge + tahun, tanpa siri). Kesan: kunci dedup `dataProcessing.ts` **tidak perlu diubah** — lihat §7.1b. |
| 2 | **Bila bayaran berlaku** | **Sebelum penghantaran.** Sekolah daftar peserta → tekan Hantar → sistem kira bil → sekolah bayar (online) ATAU muat naik bukti (resit/cek) → barulah pendaftaran dihantar untuk pengesahan admin. **Tiada bayaran = tiada penghantaran.** |
| 3 | **Pintu statistik** | Kekal **pengesahan admin** yang sedia ada. Bayaran ialah syarat masuk giliran pengesahan, bukan pintu statistik berasingan. `deduplicateRecords` tetap perlu dua sentuhan kecil (kunci pengesahan bersiri + tapisan draf) — lihat §7.1. |
| 4 | **Kaedah bayaran** | **Ketiga-tiganya dalam Fasa 1** kerana ketiga-tiganya adalah pilihan pada pintu yang sama: (a) ToyyibPay online, (b) muat naik resit pindahan bank, (c) cek. |
| 5 | **Akaun ToyyibPay** | **Per skop — setiap negeri & daerah guna akaun sendiri**, bukan satu akaun pusat. Duit masuk terus ke akaun penganjur yang menetapkan yuran. |
| 6 | **Had tempat** | Per **program × siri**, dan **opsyenal**. Satu siri boleh mengandungi beberapa program dengan had berbeza — cth Siri 2 ada Keris Perak (had 300) dan Keris Emas (tiada had, tutup ikut tarikh sahaja). |
| 7 | **Tiada tempahan tempat** | **Bayar baru dapat tempat.** Tiada mekanisme "tempahan" atau kaunter masa. Bil yang belum dibayar TIDAK memegang apa-apa tempat. |
| 8 | **Apa yang mengambil tempat** | Bayaran berstatus `paid` **dan** `pending_review`. Sebab `pending_review` bermaksud duit sudah keluar dari sekolah (resit/cek dihantar), cuma belum disemak admin — konsisten dengan prinsip "dah bayar dapat tempat". Bil `pending` (belum bayar) **tidak** mengambil tempat. |
| 9 | **Tarikh tutup bayaran** | Per program × siri. Selepas tarikh ini: tiada bil baharu, tiada bukti baharu diterima. Untuk program tanpa had (Keris Emas), inilah **satu-satunya** penutup. |
| 10 | **Sesiapa yang dicaj, mengambil tempat** | Asas kiraan tempat **sama** dengan asas kiraan bil — kedua-duanya terbit daripada yuran yang admin tetapkan. Isi `fee_peserta` sahaja → hanya peserta dicaj **dan** hanya peserta makan tempat. Isi `fee_pemimpin` / `fee_penolong` juga → mereka dicaj **dan** turut makan tempat. **Tiada tetapan berasingan untuk kuota** — satu sumber kebenaran, iaitu tetapan yuran. |
| 10b | **PENGUJI tidak pernah dikira** | Tiada lajur yuran untuk PENGUJI langsung, jadi mengikut peraturan #10 mereka tidak pernah dicaj dan tidak pernah mengambil tempat. |
| 10c | **Yuran kosong = tidak wujud dalam kiraan** | Yuran dibiar kosong bermakna peranan itu tidak dicaj **dan** tidak makan tempat (`null = tak caj`, migrasi 023). Sudah berkuat kuasa untuk bil dalam `programSummary.ts:149-152`; logik tempat mesti mengikut takrifan yang sama. |
| 10c2 | **Tiada yuran = tiada pintu bayaran** | Program tanpa tetapan bayaran kekal **seperti sekarang**: sekolah daftar → tekan Hantar → terus masuk giliran pengesahan. Tiada bil, tiada skrin bayaran. Susulannya (mengikut #10): kerana tiada sesiapa dicaj, **tiada sesiapa mengambil tempat** — jadi had tempat tidak bermakna untuk program sebegini. Bukan kes khas; ia hasil semula jadi peraturan #10. |
| 10d | **Menukar yuran menukar kiraan tempat** | Kerana kedua-duanya terbit dari sumber yang sama, menambah `fee_pemimpin` di tengah pendaftaran akan menyebabkan pemimpin **serta-merta mula dikira** terhadap had — kiraan boleh melonjak atau terus melebihi had. Perlu amaran & sekatan (§3.9). |
| 11 | **Kuatkuasa had** | **Peringkat DB dengan penguncian baris** (`SELECT … FOR UPDATE`). BUKAN corak baca-dulu-tulis-kemudian seperti modul kursus sedia ada — corak itu ada race condition (§3.8). |
| 11b | **Tempoh hayat bil** | **30 minit — tetapi hanya untuk bil yang TIDAK disentuh.** Bil tanpa sebarang percubaan bayaran → `cancelled` selepas 30 minit; pendaftaran kembali menjadi draf boleh edit, sekolah tekan Hantar semula untuk bil baharu. Data pendaftaran TIDAK dibuang. **Bil yang ada transaksi tergantung di ToyyibPay TIDAK PERNAH dibatalkan atas sebab tempoh** — lihat #11e. |
| 11e | **Transaksi tergantung mengatasi tempoh luput** | FPX boleh mengambil **sehingga 30 minit** memulangkan keputusan (ToyyibPay sediakan bank ujian *SBI BANK C* khusus untuk keadaan ini). Tempoh itu bertindih tepat dengan tempoh luput bil kita. Membatalkan pada minit ke-30 akan memusnahkan bayaran yang sedang dalam perjalanan — duit sudah keluar dari akaun sekolah, tetapi bil sudah mati. Maka: bil dibatalkan **hanya** jika tiada rekod percubaan transaksi. Ada transaksi tergantung = biarkan hidup sehingga bank memberi keputusan muktamad. |
| 11c | **Caj transaksi ditanggung sekolah** | Caj gateway (~RM1 FPX) **ditambah atas** jumlah yuran, dipapar sebagai baris berasingan dalam bil. Penganjur terima jumlah yuran penuh tanpa kekurangan. **Hanya untuk kaedah ToyyibPay** — pindahan bank & cek tiada caj gateway, jadi tiada caj ditambah. |
| 11d | **FPX sahaja, bukan kad kredit** | `billPaymentChannel` dihadkan kepada FPX. Sebabnya caj kad kredit ialah **peratusan**, bukan kadar rata — pada bil RM1,500 ia jadi puluhan ringgit, mustahil dibebankan kepada sekolah dan mustahil diramal masa bil dicipta. FPX kadar rata = caj boleh dikira tepat sebelum bayaran. |
| 12 | Jumlah bil | **Dibekukan masa bil dicipta**, dikira **server-side**. Snapshot bilangan setiap peranan disimpan. Jika sekolah ubah senarai sebelum bayar, bil lama dibatalkan dan bil baharu dijana. |
| 13 | Edit peserta LEPAS bayar | Guna kitaran **"Tolak/Buka Semula"** sedia ada. Bayaran kekal `paid` & terikat pada program+tahun — hantar semula TIDAK menjana bil baharu. Admin nampak snapshot asal vs bilangan semasa. |
| 14 | Tarik diri LEPAS bayar | Ciri Penarikan Diri sedia ada. Tempat **dilepaskan** kembali ke kolam; bayaran kekal `paid` (refund diurus berasingan). |
| 15 | Bilangan peserta berubah lepas `paid` | **TIDAK dikira semula automatik.** Sistem papar data, admin putuskan. ToyyibPay tiada API refund — automasi keputusan kewangan memang terhad. |

---

## 3. Struktur Data

> Nota: struktur `submissions` **tidak diubah** — cuma status `draft` sedia ada digunakan semula (§5.1).

### 3.1 Jadual baharu `payments`

Satu rekod per **percubaan** bayaran (sejarah penuh disimpan):

| Lajur | Kegunaan |
|-------|----------|
| `school_id`, `badge_id`, `year`, `siri` | **Kunci utama logik** — sama dengan `school_badge_status` selepas siri ditambah. `siri` default 1 untuk program yang tak aktifkan siri |
| `submission_id` | Rujukan sahaja (submission aktif masa bil dicipta) — untuk audit, BUKAN kunci padanan |
| `amount` | `numeric(10,2)` — **jumlah yuran sahaja**, dibekukan, dikira server-side. Inilah yang penganjur terima |
| `transaction_fee` | Caj gateway yang ditambah (RM0 untuk pindahan bank & cek) |
| `total_amount` | `amount + transaction_fee` — **inilah yang dihantar ke ToyyibPay** dan yang sekolah bayar |
| `snapshot_peserta` / `snapshot_pemimpin` / `snapshot_penolong` | Bilangan setiap peranan masa bil dicipta |
| `method` | `toyyibpay` \| `bank_transfer` \| `cheque` \| `cash` \| `lain` |
| `status` | `pending` \| `pending_review` \| `paid` \| `rejected` \| `failed` \| `cancelled` |
| `seat_status` | `ok` \| `no_seat` — tanda kes "dibayar tetapi tempat sudah habis" (§6.2) |
| `reference_number` | No. cek / rujukan transaksi / slip bank |
| `external_bill_code` / `bill_url` | Khusus ToyyibPay |
| `gateway_settings_id` | Akaun ToyyibPay mana digunakan (§3.3) — perlu untuk double-check guna kunci yang betul |
| `paid_at` | Bila bayaran diterima (dari gateway atau tarikh pada slip) |
| `confirmed_by` / `confirmed_at` | Admin yang sahkan bukti manual; kosong jika auto (webhook) |
| `rejected_reason` | Sebab bukti ditolak |
| `notes` | Catatan tambahan |

**Indeks & integriti:**
- `create index on payments (school_id, badge_id, year, siri)`
- **Unique partial index** — halang dua bil terbuka serentak bagi siri yang sama:
  `unique (school_id, badge_id, year, siri) where status in ('pending','pending_review')`
- `unique (external_bill_code) where external_bill_code is not null` — bantu idempoten webhook

**RLS `payments`** (jadual duit — mesti eksplisit):
- `select`: sekolah baca rekod sendiri (`school_id = get_my_school_id()`); admin ikut skop (corak `case get_my_role()` dalam `002_rls_policies.sql:186+`)
- `insert` / `update`: **TIADA** polisi untuk `authenticated`. Semua tulisan hanya melalui Edge Function service role

### 3.2 Jadual baharu `program_siri_settings` (had & tarikh tutup, per program × siri)

Merujuk terus `program_settings`, jadi badge + skop negeri/daerah + tahun diwarisi automatik:

| Lajur | Kegunaan |
|-------|----------|
| `program_setting_id` | FK ke `program_settings` — mewarisi badge + skop + tahun |
| `siri` | 1, 2, 3… (mesti `<= program_settings.max_siri`) |
| `max_peserta` | Had tempat. **NULL = tiada had** |
| `payment_deadline` | Tarikh tutup bayaran bagi program × siri ini. NULL = ikut `badges.deadline` sedia ada |
| `is_closed` | Tutup manual oleh admin — berkuat kuasa walaupun belum penuh & belum sampai tarikh |
| `closed_at`, `closed_by` | Audit penutupan manual |

- `unique (program_setting_id, siri)`
- **Baris ini juga bertindak sebagai titik kunci** untuk `SELECT … FOR UPDATE` semasa memberi tempat (§3.8)

**Inilah yang menjawab contoh Siri 2:**

```
Siri 2
 ├─ Keris Perak  → max_peserta = 300   · payment_deadline = 2026-09-30
 └─ Keris Emas   → max_peserta = NULL  · payment_deadline = 2026-09-15
                                          (tiada had — tutup ikut tarikh sahaja)
```

Had melekat pada **program × siri**, bukan pada siri sahaja. Dua program dalam siri yang sama tidak berkongsi kolam tempat.

Tiada lajur tambahan pada `program_settings` untuk kuota. Siapa yang mengambil tempat **terbit terus daripada yuran yang ditetapkan** (Keputusan #10) — `max_peserta` hanyalah nombor, dan maksudnya ditentukan oleh `fee_peserta` / `fee_pemimpin` / `fee_penolong` yang diisi.

**UI admin mesti menyatakan maksudnya.** Nombor "300" tak bermakna tanpa konteks — labelnya kena berubah mengikut yuran semasa:

```
Yuran: Peserta RM50                    →  "300 tempat  (peserta sahaja)"
Yuran: Peserta RM50 · Pemimpin RM30    →  "300 tempat  (peserta + pemimpin)"
Tiada yuran langsung                   →  medan had DILUMPUHKAN
```

**Medan had mesti dilumpuhkan bila tiada yuran ditetapkan.** Kerana tempat hanya dituntut ketika bayaran disahkan, had pada program tanpa yuran **tidak akan pernah berkuat kuasa**. Membiarkan admin menaip "300" ke dalam medan yang senyap-senyap tidak berfungsi adalah perangkap — admin fikir program berhad, sedangkan pendaftaran sebenarnya terbuka luas. Lumpuhkan medan itu dengan nota: *"Had memerlukan yuran ditetapkan — tempat dikira apabila bayaran disahkan."*

### 3.3 Jadual baharu `payment_gateway_settings` (akaun ToyyibPay per skop)

Mencerminkan corak skop `program_settings`:

| Lajur | Kegunaan |
|-------|----------|
| `negeri_id` / `daerah_id` | Skop pemilik akaun (satu diisi, satu null) |
| `provider` | `toyyibpay` (ruang untuk gateway lain kemudian) |
| `category_code` | Kod kategori ToyyibPay akaun tersebut |
| `secret_vault_id` | **Rujukan Supabase Vault** kepada `userSecretKey` — kunci sebenar TIDAK dalam lajur biasa |
| `masked_key` | 4 aksara terakhir sahaja, untuk paparan UI |
| `bank_account_info` | No. akaun / arahan bayaran manual bagi skop ini (dipapar kepada sekolah yang pilih pindahan bank / cek) |
| `transaction_fee_flat` | Caj FPX bagi akaun ini (cth `1.00`). Boleh diubah tanpa deploy — kadar ToyyibPay berubah dari semasa ke semasa dan berbeza ikut pelan akaun |
| `is_sandbox` | `true` = `dev.toyyibpay.com`, `false` = `toyyibpay.com` |
| `is_active`, `verified_at` | Kunci disahkan sah dengan panggilan ujian sebelum dibenarkan aktif |

- Unique: satu akaun aktif per skop per provider (corak `coalesce(...)` macam `uq_program_settings`)
- **RLS: deny-all untuk `authenticated`.** Admin baca melalui **view** yang dedah lajur bukan-rahsia sahaja; tulisan hanya melalui Edge Function service role
- **Resolusi akaun:** ikut skop tetapan yuran. `program_settings` skop `negeri` → akaun negeri; skop `daerah` → akaun daerah. **Tiada fallback senyap** — jika akaun skop berkenaan belum ditetapkan, cipta bil GAGAL dengan mesej jelas

### 3.4 `school_badge_status` — tambah `siri` + `payment_status`

**Dua perubahan pada jadual sedia ada:**

1. **`siri smallint not null default 1`**, dan kunci unik bertukar:
   `unique(school_id, badge_id, year)` → `unique(school_id, badge_id, year, siri)`
   Ikut preseden migrasi 025 (`attendance_verifications.siri`). Inilah yang membolehkan sekolah hantar Siri 2 selepas Siri 1 selesai.
2. **`payment_status`** — cache pantas untuk filter & gating: `not_required` \| `pending` \| `pending_review` \| `paid` \| `rejected`. Default `not_required`.

**Migrasi selamat kerana seragam:** semua baris `school_badge_status` sedia ada dapat `siri = 1`, dan semua `submission_people` sedia ada memang sudah `siri = 1` (default migrasi 025). Jadi kunci lama `${badge}_${year}` bertukar menjadi `${badge}_${year}_1` secara menyeluruh — tiada baris yang berubah makna.

### 3.5 `program_settings.payment_online_required`

Togol BAHARU, berasingan daripada `payment_enabled` sedia ada:
- `payment_enabled` — kekal seperti sekarang: paparan caj informational + rumusan (`buildProgramSummary`). Tidak berubah
- `payment_online_required` — mengaktifkan pintu bayaran sebelum penghantaran + sekatan pengesahan

### 3.6 Bukti pembayaran — reuse `attachments` (**Fasa 1**, bukan Fasa 2 lagi)

Kerana muat naik resit/cek kini salah satu pilihan pada pintu bayaran, ia wajib ada dari hari pertama.

- Tambah lajur `category` (cth `'payment_proof'`) + `payment_id` (FK `payments`)
- **Jadikan RLS `attachments_select` eksplisit.** ⚠ *Pembetulan:* draf terdahulu mendakwa polisi sedia ada ialah lubang keselamatan kerana subkueri `submission_id in (select id from public.submissions)` kelihatan tidak berskop. Itu **salah** — PostgreSQL mengenakan RLS secara rekursif pada jadual yang dirujuk dalam ungkapan polisi, jadi subkueri itu sudah ditapis oleh `submissions_select`. Yang benar: perlindungan itu **tidak langsung** (bergantung pada polisi jadual lain kekal betul) dan penilaian bersarang mahal. Digantikan dengan fungsi SECURITY DEFINER `can_access_submission()` untuk kejelasan dan prestasi
- Tambah polisi `delete` untuk sekolah buang bukti sendiri **selagi status masih `pending_review`** (sekarang delete admin-sahaja)
- Storan: `r2-presigned-upload` sedia ada memang generik (`bucket: 'documents'`, folder bebas) — guna folder `payment-proof/{payment_id}`

### 3.7 Kuatkuasa peringkat DB: tak boleh sahkan sebelum bayar

`approveSchoolBadge` ialah `upsert` biasa dari client (`supabaseApi.ts:669-683`) — sesiapa berperanan admin boleh panggil terus, jadi sekatan UI tidak memadai.

**Trigger `before update on school_badge_status`:** jika `new.status = 'approved'` DAN program `payment_online_required = true` DAN `payment_status <> 'paid'` → `raise exception`.

### 3.8 Memberi tempat tanpa race condition

**Model: tempat diberi bila duit keluar, bukan bila borang dihantar.**

| Status bayaran | Ambil tempat? | Sebab |
|---|---|---|
| `pending` (bil dijana, belum bayar) | ❌ Tidak | Belum bayar — prinsip #7 |
| `pending_review` (resit/cek dihantar) | ✅ Ya | Duit sudah keluar dari sekolah, cuma belum disemak |
| `paid` | ✅ Ya | Kekal |
| `rejected` / `cancelled` / `failed` | ❌ Tidak | Tempat dilepaskan |
| Peserta `is_withdrawn` | ❌ Tidak | Tempat dilepaskan walaupun bayaran kekal `paid` |

**Satu bil = satu siri.** Borang pendaftaran sudah menandakan satu siri untuk seluruh borang (`UserForm.tsx:312`), jadi setiap bil menyentuh satu kolam tempat sahaja. Tiada logik merentas siri diperlukan.

**Kiraan dibuat secara langsung, bukan disimpan sebagai kaunter.** Kaunter yang disimpan akan menyimpang (drift) apabila ada tarik diri, penolakan bukti, dan pembatalan — dan penyimpangan pada data berbayar bermakna refund manual. Sebaliknya:

```sql
-- konsep, bukan SQL akhir
create function claim_siri_seats(p_setting_id uuid, p_siri smallint, p_school uuid, p_count int)
  -- 1. Kunci baris tetapan siri — permintaan serentak BERATUR di sini
  select max_peserta, is_closed, payment_deadline
    from program_siri_settings
   where program_setting_id = p_setting_id and siri = p_siri
     for update;

  if is_closed then raise exception 'Siri telah ditutup';
  if now() > payment_deadline then raise exception 'Tarikh tutup bayaran telah berlalu';
  if max_peserta is null then return;          -- tiada had (cth Keris Emas)

  -- 2. Kira tempat terisi SEKARANG, dalam kunci yang sama
  select count(*) into terisi
    from submission_people sp
    join submissions s  on s.id = sp.submission_id
    join payments p     on p.school_id = s.school_id
                       and p.badge_id  = s.badge_id
                       and p.year      = s.submission_year
   where sp.siri = p_siri
     and p.status in ('paid','pending_review')
     and sp.is_deleted = false and sp.is_withdrawn = false
     -- Peranan yang mengambil tempat = peranan yang ada yuran (Keputusan #10)
     and (
          (sp.role in ('PESERTA','PENERIMA RAMBU') and ps.fee_peserta  is not null)
       or (sp.role = 'PEMIMPIN'                    and ps.fee_pemimpin is not null)
       or (sp.role = 'PENOLONG PEMIMPIN'           and ps.fee_penolong is not null)
     );   -- PENGUJI tiada lajur yuran → tidak pernah dikira

  if terisi + p_count > max_peserta then
     raise exception 'Tinggal % tempat sahaja', max_peserta - terisi;
```

Kos: satu `COUNT` per program × siri setiap kali bayaran disahkan — jumlah baris dalam lingkungan ratusan hingga ribuan, bukan jutaan. Ketepatan lebih penting daripada mikro-optimasi di sini. Jika nanti terbukti perlahan, tambah kaunter cache **sebagai tambahan**, bukan sebagai sumber kebenaran.

⚠ **Jangan tiru corak modul kursus.** `courseService.ts:332` membaca kiraan dahulu kemudian menulis (`if (course.registeredCount >= course.quota)`), dari client pula. Dua sekolah menghantar serentak akan kedua-duanya nampak 299/300 dan kedua-duanya masuk. Untuk kursus percuma itu menyakitkan; untuk tempat berbayar ia bermakna duit yang perlu dipulangkan secara manual.

**Di mana ia dipanggil:**

| Titik | Tujuan | Sifat |
|---|---|---|
| Dropdown siri (`UserForm`) | Papar baki tempat, kelabukan yang penuh/tertutup | Anggaran — bantuan UX sahaja |
| Sebelum cipta bil | Tolak awal jika sudah penuh — supaya sekolah tak bayar sia-sia | Semakan tanpa kunci |
| **Ketika bayaran disahkan** (webhook ToyyibPay / admin sahkan bukti) | **Pintu sebenar** — `claim_siri_seats` dengan kunci baris | Berkuat kuasa |

### 3.9 Menukar yuran selepas pendaftaran bermula

Kerana bil **dan** kiraan tempat kedua-duanya terbit daripada tetapan yuran (Keputusan #10), menukar yuran di tengah pendaftaran menggerakkan dua benda serentak. Yang berbahaya ialah kiraan tempat, kerana ia berlaku **secara retroaktif** kepada semua yang sudah membayar:

```
Keris Perak Siri 2 · had 300 · yuran: Peserta RM50 sahaja

  Sebelum:  250 peserta dibayar                       → 250/300  ·  baki 50
  Admin tambah "Pemimpin RM30"
  Selepas:  250 peserta + 48 pemimpin kini dikira     → 298/300  ·  baki 2
```

Baki tempat terjun dari 50 ke 2 tanpa seorang pun mendaftar. Jika pemimpin lebih ramai, had boleh **terus dilanggar** — kiraan melebihi 300 sedangkan tiada cara untuk membatalkannya.

**Kendalian:**

- **Amaran berangka sebelum simpan** — papar kesan sebenar, bukan amaran umum: *"Menambah yuran pemimpin akan menyebabkan 48 pemimpin sedia ada mula dikira terhadap had. Baki tempat: 50 → 2."*
- **Halang jika ia melanggar had** — jika perubahan menyebabkan kiraan melebihi `max_peserta`, tolak simpanan dan minta admin naikkan had dahulu
- **Bil yang sudah `paid` tidak dikira semula** — jumlah dibekukan masa bil dicipta (Keputusan #12). Sekolah yang sudah bayar RM50/peserta tidak dituntut RM30/pemimpin secara surut
- **Catat dalam `audit_logs`** — perubahan yuran pertengahan program ialah peristiwa kewangan, bukan sekadar suntingan tetapan

### 3.10 Risiko yang tinggal: jual lebih

Kerana tiada tempahan, ada tempoh antara *bil dijana* dan *bayaran masuk* di mana sekolah lain boleh menghabiskan tempat. Dua sekolah membayar serentak untuk 10 tempat terakhir → seorang dapat, seorang tidak, tetapi **kedua-duanya sudah bayar**.

Ini **kesan langsung** keputusan "tiada tempahan" dan tidak boleh dihapuskan sepenuhnya — hanya dikurangkan:

1. **Tolak awal semasa cipta bil** — jika sudah penuh, bil langsung tidak dijana
2. **Bil ToyyibPay tempoh pendek** — `billExpiryDays` diselaraskan dengan tarikh tutup bayaran, jadi bil lama tidak boleh dibayar berminggu kemudian
3. **Papar baki tempat secara jelas** semasa sekolah membuat keputusan (*"Tinggal 12 tempat — bayar segera untuk memastikan tempat"*)
4. **Baris giliran "dibayar tanpa tempat"** untuk kes yang tetap terlepas (§6.2) — admin putuskan: beri tempat tambahan atau refund manual

Jika kekerapan kes ini nanti menyusahkan, penyelesaiannya ialah tempoh tahanan pendek semasa sesi bayaran (cth 30 minit) — tetapi itu bercanggah dengan keputusan #7, jadi ia dibiarkan sebagai pilihan masa depan, bukan sebahagian reka bentuk sekarang.

---

## 4. Aliran Status

```
  DAFTAR                    PINTU BAYARAN                  PINTU PENGESAHAN (sedia ada)
  ──────                    ─────────────                  ────────────────────────────

  submissions.status                                            
    = 'draft'   ──[tekan Hantar]──▶  bil dijana (pending)
    (belum dihantar)                      │
                                          ├─[ToyyibPay: bayar]──────▶ paid ──┐
                                          │        (webhook + semak tempat)   │
                                          │                                   ├─▶ admin
                                          └─[resit/cek dimuat naik]──▶ pending_review     sahkan
                                                     │                        │            │
                                                     └─[admin sahkan bukti]──▶ paid ───────┤
                                                     └─[admin tolak + sebab]─▶ rejected    │
                                                                 │                         ▼
                                                          (bil dijana semula)          approved
                                                                                (DIKIRA dlm statistik)
```

- **`draft` → `submitted`** berlaku hanya selepas bayaran diuruskan (`paid` atau `pending_review`). Sebelum itu, pendaftaran **tidak masuk giliran pengesahan langsung**
- **ToyyibPay**: `pending` → (bayar) → webhook + double-check + `claim_siri_seats` → `paid`
- **Manual (resit/cek)**: `pending` → (bukti dimuat naik) → `pending_review` (tempat diambil) → admin semak → `paid` atau `rejected`
- **`rejected`**: tempat dilepaskan, sekolah boleh muat naik bukti baharu
- **Bila `paid` / `pending_review`** → notifikasi kepada admin skop → sekolah muncul dalam giliran `PengesahanTab`
- **Buka Semula** (`status = 'reopened'`): `payment_status` **kekal `paid`** — TIADA bil baharu. Rekod bayaran terikat pada program+tahun, bukan submission
- **Tarikh tutup bayaran berlalu**: bil `pending` yang tinggal → `cancelled`

---

## 5. Aliran Kerja

### 5.1 Sekolah — daftar & bayar

1. Sekolah pilih program + siri. Dropdown papar baki tempat; siri penuh / tertutup / lepas tarikh dikelabukan
2. Isi senarai peserta → tekan **Hantar**
3. Untuk program `payment_online_required`, penghantaran **tidak terus** masuk giliran pengesahan:
   - `submissions.status = 'draft'` (guna semula status sedia ada — lihat §12)
   - `school_badge_status` **belum** ditetapkan `submitted`
   - Edge Function kira jumlah **server-side**, cipta `payments` (`pending`), papar skrin bayaran
4. Sekolah pilih satu daripada tiga. **Jumlah akhir bergantung pada pilihan ini** — caj transaksi hanya dikenakan bagi ToyyibPay:

   | Pilihan | Jumlah dibayar | Apa berlaku |
   |---|---|---|
   | **Bayar Online (ToyyibPay)** | Yuran **+ caj transaksi** | Ke pautan gateway (FPX) → bayar → webhook → `paid` |
   | **Pindahan Bank** | Yuran sahaja | Papar no. akaun skop → sekolah bayar di luar → muat naik resit + no. rujukan → `pending_review` |
   | **Cek** | Yuran sahaja | Papar arahan → sekolah isi no. cek + tarikh + muat naik gambar cek → `pending_review` |

   Susulan teknikal: `amount` (yuran) dibekukan masa tekan Hantar, tetapi `transaction_fee` dan `total_amount` hanya ditetapkan **selepas kaedah dipilih**. Skrin pilihan mesti papar kedua-dua jumlah bersebelahan supaya sekolah nampak bezanya sebelum memilih — bukan terkejut selepas dialihkan ke gateway.

5. Sebaik status jadi `paid` atau `pending_review` **dan tempat berjaya diambil**:
   - `submissions.status` → `submitted`
   - `school_badge_status.status` → `submitted` (sekolah terkunci — tingkah laku sedia ada)
   - Notifikasi kepada admin skop
6. Jika sekolah **mengubah senarai peserta** semasa bil masih `pending`: bil lama → `cancelled`, sekolah kena tekan Hantar semula untuk jana bil baharu. Elak bil tak sepadan dengan senarai sebenar
7. **Jika 30 minit berlalu tanpa bayaran**: bil → `cancelled`, pendaftaran kembali menjadi draf boleh edit, pautan ToyyibPay mati. Sekolah tekan **Hantar semula** untuk jana bil baharu. Senarai peserta kekal — tiada data hilang
8. Satu hantaran = satu siri. Sekolah yang menyertai Siri 1 dan Siri 2 program yang sama membuat **dua hantaran & dua bil berasingan**, setiap satu dengan kitaran pengesahannya sendiri

### 5.2 Admin — semak bayaran & sahkan pendaftaran

**Satu giliran, bukan dua.** Admin melihat pendaftaran bersama bukti bayarannya dalam skrin yang sama:

1. Tab **Pengesahan** sedia ada (`PengesahanTab`), setiap baris papar lencana bayaran:
   - 🟢 **Dibayar (ToyyibPay)** — disahkan automatik, admin cuma semak senarai peserta
   - 🟡 **Bukti dihantar** — papar resit/gambar cek + no. rujukan untuk admin semak
2. **Sahkan** → jika bayaran manual, ia turut menandakan `payments.status = 'paid'`; kemudian `school_badge_status.status = 'approved'` → masuk statistik
3. **Tolak bukti** (+ sebab) → `payments.status = 'rejected'`, tempat dilepaskan, sekolah dimaklumkan & boleh muat naik semula
4. **Sahkan Pukal mesti tapis** yang belum bayar — `handleBulkApproveAll` sekarang sahkan semua tanpa syarat
5. Baris giliran berasingan: **"Dibayar tanpa tempat"** (§6.2) untuk kes jual lebih

### 5.3 Admin — tetapan had & tarikh

Dalam modal tetapan program sedia ada (`AdminBadges.tsx`), bagi setiap siri:
- `max_peserta` (kosongkan = tiada had)
- `payment_deadline`
- Butang **Tutup Siri** manual
- Paparan langsung: `terisi / had · baki`

### 5.4 Edit peserta lepas bayar
1. Sekolah terkunci sejak `submitted` → hubungi admin
2. Admin **"Tolak/Buka Semula"** → `status = 'reopened'`; `payment_status` kekal `paid`
3. Sekolah edit & hantar semula → baris `submissions` baharu, **tapi bil sama**
4. Admin semak: sistem papar **snapshot bayaran asal** (jumlah, bilangan setiap peranan, tarikh) bersebelahan bilangan semasa
5. Jika bilangan bertambah dan tempat tidak mencukupi, penghantaran semula ditolak sehingga admin naikkan had atau sekolah kurangkan senarai
6. Admin putuskan hal beza bayaran sendiri (di luar sistem) → sahkan → `approved`

### 5.5 Tarik diri lepas bayar
Guna ciri Penarikan Diri sedia ada (`is_withdrawn`). Peserta keluar statistik, **tempat dilepaskan** kembali ke kolam, `payments.status` kekal `paid`.

---

## 6. Butiran Teknikal: Integrasi ToyyibPay

### 6.1 Cipta Bil — kunci jumlah dari awal

| Parameter | Nilai | Kenapa |
|-----------|-------|--------|
| `billPriceSetting` | `1` (Jumlah Tetap) | Pembayar **tak boleh ubah** amount — dikuatkuasakan gateway sendiri |
| `billAmount` | Dalam **sen**: `Math.round(total_amount * 100)` — yuran **+ caj transaksi** | Guna `Math.round` — `numeric(10,2)` → float boleh hasilkan `24999` bukannya `25000` |
| `billPaymentChannel` | **FPX sahaja** | Caj kad kredit ialah peratusan, tak boleh diramal masa cipta bil (Keputusan #11d) |
| `billExternalReferenceNo` | ID rekod `payments` | Kunci pemadanan bila webhook masuk |
| `billCallbackUrl` | URL Edge Function webhook | Notifikasi server-ke-server |
| `billReturnUrl` | URL app (halaman status) | **UX sahaja** — BUKAN sumber sah untuk kemaskini status |
| `categoryCode` | Dari `payment_gateway_settings` skop berkenaan | Berbeza ikut negeri/daerah — jangan hardcode |
| `userSecretKey` | Dari Supabase Vault, ikut skop | Jangan sesekali di frontend |
| `billExpiryDate` | **30 minit dari sekarang** (Keputusan #11b), dan tidak melebihi `payment_deadline` siri | Matikan pautan serentak dengan bil dalam sistem kita. Tanpa ini, pautan lama kekal boleh dibayar walaupun bil sudah `cancelled` di pihak kita — punca utama kes "dibayar tanpa tempat" |

**Pengiraan jumlah (server-side).** Peraturannya mudah: **bil merangkumi hanya peranan yang admin isikan yuran.**

| Yuran ditetapkan admin | Kesan pada bil |
|---|---|
| `fee_peserta` sahaja | Bil kira peserta sahaja. Pemimpin & penolong didaftar tetapi **tidak dicaj dan tidak makan tempat** |
| `fee_peserta` + `fee_pemimpin` | Bil kira kedua-duanya |
| Ketiga-tiganya diisi | Bil kira ketiga-tiganya |
| Mana-mana dibiar **kosong** | Peranan itu **tidak dicaj** (`null = tak caj`, migrasi 023) |

Ini **tingkah laku sedia ada** — `programSummary.ts:149-152` guna `(p.feePeserta || 0) * p.countPeserta`, jadi yuran `null` menyumbang RM0. Edge Function cuma perlu meniru logik yang sama server-side.

- PESERTA & PENERIMA RAMBU → `fee_peserta` · PEMIMPIN → `fee_pemimpin` · PENOLONG PEMIMPIN → `fee_penolong`
- **PENGUJI tidak pernah dicaj** — tiada lajur yuran untuknya langsung
- **Peserta `is_withdrawn` / `is_deleted` dikecualikan**
- **Baju TIDAK dicaj** — `shirt_enabled` wujud tetapi **tiada lajur harga baju**
- Resolusi tetapan ikut skop + tahun (corak `findSetting`, `programSummary.ts:59-65`)

**⚠ Kes jumlah RM0 — mesti dikendali.** Peraturan "null = tak caj" bermakna jumlah bil boleh jadi sifar dalam dua keadaan:

1. Admin aktifkan `payment_online_required` tetapi **tiada satu pun** yuran diisi
2. Sekolah mendaftar **hanya pemimpin/penguji** sedangkan hanya `fee_peserta` yang ditetapkan

ToyyibPay tidak boleh menerima bil RM0, jadi tanpa pengendalian, sekolah tersangkut di pintu bayaran yang mustahil dilepasi. Kendalian:

- **Halang di punca**: togol `payment_online_required` tidak boleh diaktifkan jika tiada satu pun yuran ditetapkan (validasi UI + semakan server)
- **Lepaskan di hujung**: jika jumlah dikira = RM0, **langkau pintu bayaran terus** — `payment_status = 'not_required'`, pendaftaran terus `submitted` dan masuk giliran pengesahan, dengan catatan audit. Jangan cipta bil, jangan biarkan sekolah tergantung

### 6.2 Pengesahan Bayaran — dua lapisan

1. **Webhook**: ToyyibPay POST ke `billCallbackUrl` dengan `billcode`, `order_id` (=`billExternalReferenceNo`), `status` (1=berjaya), `amount`
2. **Double-check wajib**: Callback ToyyibPay **tiada tandatangan kriptografi** (tak macam Stripe) — Edge Function mesti panggil **balik** `getBillTransactions` guna secret key **akaun skop yang betul** (dari `payments.gateway_settings_id`) sebelum tanda `paid`

```
1. Cipta bil: amount=25000 (sen), billPriceSetting=1, billExternalReferenceNo=payment.id
2. Sekolah bayar — jumlah dikunci di ToyyibPay
3. ToyyibPay POST ke webhook → terima billcode + order_id
4. Cari payments by order_id → dapatkan gateway_settings_id → ambil secret dari Vault
5. Panggil getBillTransactions(billcode) → sahkan SENDIRI status + amount
   (bandingkan dengan payments.total_amount — yuran + caj, bukan amount sahaja)
6. Jika sah → claim_siri_seats() untuk siri berkenaan  ← PINTU TEMPAT
      ├─ berjaya → payments.status='paid', seat_status='ok'
      │            submissions → 'submitted', school_badge_status → 'submitted'
      │            audit_logs + notifikasi admin
      └─ gagal   → payments.status='paid', seat_status='no_seat'   (lihat bawah)
```

**Kes "dibayar tanpa tempat".** Duit sudah masuk akaun tetapi tempat sudah habis (§3.9). **Jangan terima senyap-senyap, jangan tolak senyap-senyap:**

- `payments.status = 'paid'` tetapi `seat_status = 'no_seat'`
- Pendaftaran **kekal `draft`** — tidak masuk giliran pengesahan
- Masuk baris giliran admin: *"Bayaran diterima tanpa tempat — perlu tindakan"* → admin pilih naikkan had atau uruskan refund manual
- Sekolah dimaklumkan segera dengan bahasa yang jelas, bukan dibiarkan tertanya-tanya

### 6.3 Persekitaran & Keselamatan

- **Sandbox dahulu**: `dev.toyyibpay.com` ialah **pendaftaran akaun yang berasingan sepenuhnya**, bukan mod dalam akaun produksi. Percuma, tiada kelulusan diperlukan. `userSecretKey` di bahagian bawah kiri dashboard; cipta kategori sandbox sendiri. Dalam kod ia hanya pertukaran hos — semua endpoint sama, jadi flag `is_sandbox` per akaun memadai

**Bank simulator sandbox** (nama pengguna & kata laluan kedua-duanya `1234`) — petakan terus kepada kes ujian Fasa 1:

| Bank ujian | Kelakuan | Menguji |
|---|---|---|
| SBI BANK A | Berjaya | Laluan bahagia: webhook → double-check → `claim_siri_seats` → `paid` |
| SBI BANK B | Gagal (dana tidak cukup) | Pengendalian `failed`; sekolah boleh cuba semula |
| SBI BANK C | Pending return sehingga 30 minit | **Lapisan reconciliation & peraturan pembatalan (§6.4)** — bank ujian paling berharga bagi reka bentuk kita |
- **Kunci rahsia**: Supabase Vault, dirujuk melalui `secret_vault_id`. UI papar `masked_key` sahaja
- **Sahkan kunci masa disimpan**: panggilan ujian ke ToyyibPay sebelum `is_active = true` — elak kunci salah baru ketahuan masa sekolah cuba bayar
- **Jangan log** secret key atau payload yang mengandunginya
- **Kunci tidak pernah melalui perantara.** Ia dimasukkan terus dari pemilik akaun ke Supabase Vault (dashboard atau CLI). Kod membaca dari Vault semasa jalan; tiada fail repo, tiket, mesej, atau dokumen yang pernah memuatkan nilai sebenar. `categoryCode` pula **bukan rahsia** — ia muncul dalam permintaan API biasa dan selamat direkod

### 6.5 Akaun ToyyibPay yang dikongsi dengan kegunaan sedia ada

Akaun perintis (skop **daerah**) telah digunakan **3–4 tahun** untuk tujuan lain. Ini mengubah tiga perkara:

**Kategori berasingan, wajib.** Cipta `categoryCode` baharu khusus ScoutNadi — jangan guna semula kategori sedia ada. Tanpa pengasingan ini, kutipan program bercampur dengan kutipan lain dalam dashboard & penyata penyelesaian, dan rekonsiliasi jadi kerja manual.

**Webhook mesti menolak bil yang bukan milik kita dengan bersih.** Akaun menerima trafik dari sistem lain. Jika `order_id` tidak sepadan dengan mana-mana baris `payments`:
- **Log** kejadian (untuk pemantauan)
- **Balas HTTP 200** — jangan balas ralat, atau ToyyibPay akan mencuba semula tanpa henti
- **Jangan proses apa-apa**

**Kunci rahsia dikongsi.** `userSecretKey` ialah peringkat akaun, jadi sistem sedia ada guna kunci yang sama. Jika ia diputar, **kedua-dua** sistem pecah — dan yang ini pecah senyap (bil gagal dicipta, sekolah tersekat tanpa sebab yang jelas). Kendalian:
- Butang **"Uji Sambungan"** dalam UI tetapan akaun, mengemas kini `verified_at`
- Mesej ralat khusus bila cipta bil gagal disebabkan pengesahan — bukan ralat umum
- Beritahu penyelenggara sistem sedia ada bahawa kunci itu kini ada pengguna kedua

### 6.4 Webhook Gagal — Lapisan Cuba-Semula

ToyyibPay gateway ringkas — **tak boleh anggap webhook mesti sampai**:

| Lapisan | Bila | Cara |
|---|---|---|
| **1. Check-on-return** | Sekolah redirect balik lepas bayar | App terus panggil `getBillTransactions` — jangan tunggu webhook. Tangkap majoriti kes serta-merta |
| **2. Webhook** | ToyyibPay POST ke callback | Proses segera (§6.2) |
| **3. Cron** | Job berjadual, setiap beberapa minit | (a) `payments` status `pending` yang dah lepas 5-10 minit → `getBillTransactions` → kemaskini; (b) batalkan bil `pending` yang lepas 30 minit atau lepas `payment_deadline` — **tetapi hanya jika `getBillTransactions` tidak menunjukkan sebarang percubaan transaksi**. Lihat peraturan pembatalan di bawah |
| **4. Admin manual** | Injap terakhir | Admin semak dashboard ToyyibPay sendiri, tandakan "Dibayar (Manual)" |

**✅ Disahkan pada projek (semakan Fasa 0, 2026-08-07):**

| Extension | Status | Nota |
|---|---|---|
| `supabase_vault` | **v0.3.1 dipasang**, skema `vault` wujud | Sedia untuk simpan `userSecretKey` |
| `pg_cron` | **Dipasang & diuji** | Ujian asap: 5 larian berturut-turut, semua `succeeded`, tepat pada minit (hanyutan 15–45ms) |
| `pg_net` | **Dipasang & diuji** | `net.http_get('https://dev.toyyibpay.com')` → `status_code 200`, tiada ralat. Egress ke ToyyibPay terbuka |

Kedua-dua extension tersenarai dalam `pg_available_extensions`, jadi **pendekatan dalam-pangkalan-data digunakan** — tiada keperluan cron luaran. Corak: `pg_cron` → `net.http_post` → Edge Function → API ToyyibPay + kemas kini DB. `pg_cron` sahaja tidak memadai kerana kerja reconciliation memerlukan panggilan HTTP.

**Keselamatan jadual cron.** Perintah yang didaftarkan melalui `cron.schedule()` tersimpan sebagai teks biasa dalam `cron.job`, yang boleh dibaca sesiapa yang ada akses pangkalan data. Jangan benamkan token pengesahan Edge Function di situ — ambil dari Vault semasa jalan (`vault.decrypted_secrets`), sama seperti kunci ToyyibPay.

> **Penemuan sampingan:** kerana `pg_cron` tidak pernah dipasang, blok `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')` dalam `020_data_retention_policy.sql:47-50` **tidak pernah berjalan**. Polisi retensi data 7 tahun (PDPA) tidak aktif setakat ini. Isu berasingan daripada modul bayaran, tetapi menghidupkan `pg_cron` membuka jalan untuk membetulkannya sekali.

**Peraturan pembatalan bil (jangan musnahkan bayaran dalam perjalanan).** Sebelum membatalkan mana-mana bil `pending` yang lewat, panggil `getBillTransactions` dan pilih mengikut apa yang dilihat:

| Keadaan di ToyyibPay | Tindakan |
|---|---|
| Tiada rekod transaksi langsung | **Batalkan.** Sekolah dapat pautan tetapi tak pernah cuba bayar |
| Ada transaksi **tergantung/pending** | **Jangan sentuh.** Bank masih memproses (boleh sampai 30 minit). Semak semula pada larian cron berikutnya |
| Transaksi **berjaya** | Proses sebagai bayaran (webhook rupanya tak sampai) — inilah tujuan lapisan ini |
| Transaksi **gagal** | Batalkan. Sekolah boleh tekan Hantar semula |

Tanpa peraturan ini, tetapan luput 30 minit akan bertembung dengan tempoh penyelesaian FPX yang juga sehingga 30 minit, dan kes "dibayar tanpa tempat" bertukar daripada jarang kepada kerap.

Keperluan webhook handler:
- **Idempoten** — jika `payments.status` sudah `paid`, balas 200 terus tanpa proses semula (dan **jangan** panggil `claim_siri_seats` dua kali)
- **Balas HTTP 200 cepat** selepas berjaya proses
- **Log setiap webhook diterima** (termasuk yang ditolak) untuk debug

---

## 7. Kesan pada Statistik & Paparan

**Pintu statistik kekal `school_badge_status.status = 'approved'`** — bayaran tidak menjadi pintu kedua. Tetapi keputusan **kunci ikut siri** (#1b) memaksa tiga perubahan pada `utils/dataProcessing.ts` dan satu pada `services/supabaseApi.ts`. Ini satu-satunya tempat logik statistik disentuh, jadi ia perlu diuji dengan teliti.

### 7.1 Perubahan wajib

**(a) Kunci pengesahan perlu mengandungi siri** — `dataProcessing.ts:64`

```js
// sekarang
const badgeYearKey = `${item.badge}_${itemYear}`;
// jadi
const badgeYearKey = `${item.badge}_${itemYear}_${item.siri || 1}`;
```

Diiringi perubahan sepadan pada pembinaan `lockedBadges` / `approvedBadges` di `supabaseApi.ts:170-177`. Kekalkan fallback lama `approvedList.includes(item.badge)` supaya data warisan tanpa tahun tidak terjejas.

**(b) Kunci dedup KEKAL tanpa siri** — `dataProcessing.ts:77-79`

```js
uniqueKey = `${cleanIC}_${item.badge}_${year}`      // TIDAK diubah
```

Kerana **seorang peserta hanya boleh berada dalam satu siri bagi program yang sama** (Keputusan #1c), kunci tanpa siri adalah betul dan berfungsi sebagai jaring keselamatan terakhir. Menambah siri di sini akan **melemahkan** perlindungan — ia akan membenarkan orang sama dikira dua kali merentas siri.

Orang yang sama **boleh** menyertai program berlainan dalam siri berlainan (cth Keris Emas Siri 1 + Keris Perak Siri 2) — kunci sedia ada sudah membenarkannya kerana `badge` berbeza.

**(c) Pengecualian `draft` diletak dalam `deduplicateRecords`, BUKAN dalam fetch**

`fetchCloudData` mengambil **semua** `submission_people` tanpa menapis `submissions.status`, dan `deduplicateRecords` hanya menyemak `approvedBadges`. Maka peserta dalam submission `draft` (belum bayar) **akan masuk statistik** sebaik badge+tahun+siri itu disahkan atas apa-apa sebab. Ini melubangkan pintu bayaran dan mesti ditutup.

⚠ **Tetapi jangan tapis semasa fetch.** Senarai yang sama (`existingData`) digunakan oleh semakan pendua di `UserForm.tsx:283-305`. Jika draf dibuang semasa fetch, semakan pendua menjadi buta terhadap pendaftaran yang sedang menunggu bayaran — dua sekolah boleh mendaftar orang yang sama, kedua-duanya membayar, dan hanya seorang bertahan selepas dedup. Itu menukar satu lubang dengan lubang yang lebih mahal.

Sebaliknya:
- Tambah `submissionStatus` pada `SubmissionData` (mapping `supabaseApi.ts:182-214`)
- Tapis `submissionStatus === 'draft'` **di dalam `deduplicateRecords`** — iaitu pada pintu statistik
- Semakan pendua terus melihat senarai penuh, termasuk draf

### 7.2 Peraturan pendua merentas siri — perlu dikuatkuasakan server-side

Semakan pendua sedia ada (`UserForm.tsx:283-305`) sudah menguatkuasakan Keputusan #1c dengan tepat: padanan IC + badge + tahun **tanpa siri**, merentas semua sekolah. Tiada perubahan logik diperlukan.

Tetapi ia **berjalan dalam browser sahaja**, berdasarkan senarai yang sudah dimuat turun. Sebagai panduan pengguna itu memadai; sebagai penjaga wang ia tidak. Jika ia dipintas, sekolah membayar untuk peserta yang kemudiannya **dibuang secara senyap** oleh dedup — duit masuk, orang tak dikira, dan tiada siapa perasan.

Maka semakan yang sama mesti diulang **server-side**, dalam transaksi yang sama dengan pemberian tempat (`claim_siri_seats`), sebelum bil dijana. Dua nota:
- Semakan sedia ada hanya terpakai bila IC ada dan panjangnya > 4 aksara. Peserta tanpa IC tidak tersemak langsung — hadkan dengan padanan nama + sekolah sebagai lapisan kedua
- Peraturan ini terpakai kepada **semua peranan** dalam kod sekarang, termasuk PEMIMPIN (lihat Soalan Terbuka #3)

### 7.3 Backfill siri — bahagian paling berisiko dalam keseluruhan rancangan

**Andaian awal yang TERBUKTI SALAH.** Draf terdahulu menganggap semua `submission_people` sedia ada berada pada `siri = 1`, jadi backfill seragam `siri = 1` dianggap selamat. Ia tidak. Keris Emas 2026 sudah pun mempunyai sekolah yang menghantar **Siri 2**.

Inilah yang berlaku dengan backfill naif:

```
Sebelum
  school_badge_status: (SK Contoh, Keris Emas, 2026) = approved   ← SATU baris sahaja
  submission_people:   sebahagian siri=1, sebahagian siri=2

Selepas backfill seragam siri=1
  approvedBadges: ["Keris Emas_2026_1"]
  peserta siri=1 → cari "Keris Emas_2026_1" → jumpa   ✓
  peserta siri=2 → cari "Keris Emas_2026_2" → TIADA   ✗ hilang dari statistik
```

Kehilangan senyap, tanpa ralat, pada program yang **tidak sepatutnya terjejas langsung** oleh modul bayaran.

**Backfill mesti dipacu data, bukan angka tetap.** Skrip mencari sendiri siri yang wujud dan mencipta baris yang hilang, mewarisi status serta cap masa asal:

```sql
-- konsep, bukan SQL akhir
insert into school_badge_status (school_id, badge_id, year, siri, status, submitted_at, approved_at, …)
select distinct s.school_id, s.badge_id, s.submission_year, sp.siri,
       sbs.status, sbs.submitted_at, sbs.approved_at, …
from submission_people   sp
join submissions         s   on s.id = sp.submission_id
join school_badge_status sbs on sbs.school_id = s.school_id
                            and sbs.badge_id  = s.badge_id
                            and sbs.year      = s.submission_year
where sp.is_deleted = false
  and sp.siri > 1
on conflict do nothing;
```

Betul sama ada satu sekolah terjejas atau seratus — tiada angka perlu diketahui terlebih dahulu.

**Urutan migrasi:**
1. Tambah lajur `siri smallint not null default 1`
2. Jalankan backfill dipacu data di atas
3. Barulah tukar kunci unik kepada `(school_id, badge_id, year, siri)`

**Ujian penerimaan — pintu yang mesti dilepasi.** Skrip: **`scripts/027_garis_dasar.sql`**

Ia mengukur satu-satunya perkara yang migrasi ini boleh rosakkan — cara peserta dipadankan dengan baris pengesahannya:

```
SEBELUM : padan pada (sekolah, program, tahun)          — siri diabaikan
SELEPAS : padan pada (sekolah, program, tahun, SIRI)
```

Sebelum migrasi, semua peserta sesebuah sekolah berkongsi satu baris pengesahan. Selepas migrasi, setiap peserta mesti menemui baris siri mereka sendiri. Jika backfill terlepas satu baris, peserta siri itu jatuh keluar daripada kiraan "disahkan" tanpa sebarang ralat.

Urutan: Langkah 1 sebelum migrasi (rakam) → Langkah 2 selepas (banding) → **senarai kosong = lulus**. Sebarang baris yang keluar = gulung semula. Langkah 3 mengemas jadual garis dasar selepas disahkan.

Keris Emas ialah kes ujian utama — ia mempunyai data pelbagai siri dan tiada kaitan langsung dengan modul bayaran, jadi ia patut keluar dari migrasi tanpa sebarang perbezaan.

### 7.4 Kesan mengikut keadaan program

| Keadaan program | Kesan |
|---|---|
| Tiada yuran ditetapkan (majoriti sedia ada) | **100% tiada perubahan.** Hantar → terus masuk giliran pengesahan. Had tempat tidak berkuat kuasa (Keputusan #10c2) |
| `payment_online_required = true`, belum bayar | Pendaftaran kekal `draft` — tidak masuk giliran pengesahan langsung. Sekolah nampak "Menunggu Bayaran" |
| Dah bayar / bukti dihantar | Muncul dalam `PengesahanTab` dengan lencana bayaran — admin sahkan macam biasa |

Tab/paparan baharu:
- **"Belum Bayar"** — pendaftaran `draft` dengan bil `pending`, untuk susulan
- **"Dibayar tanpa tempat"** — kes jual lebih yang perlu tindakan admin

**Nota implementasi:** `SubmissionData` sekarang tak bawa apa-apa medan bayaran (mapping `fetchCloudData` hanya hantar `personId`/`participantId`). Status bayaran perlu ditambah pada objek `School` (bersama `lockedBadges`/`approvedBadges`, berkunci `${badge}_${year}`) — bukan pada `SubmissionData`. Konsisten dengan granulariti yang dipilih.

---

## 8. Reuse Infrastruktur Sedia Ada

| Keperluan | Reuse daripada | Status semakan |
|-----------|-----------------|---|
| Keadaan "belum dihantar" semasa menunggu bayaran | `submissions.status = 'draft'` | ✅ Sudah wujud dalam check constraint & digunakan (`supabaseApi.ts:259, 289`) |
| Presign upload bukti bayaran | `r2-presigned-upload` | ✅ Generik — `bucket`/`folder` bebas, had 10MB, JPEG/PNG/WEBP/HEIC/PDF |
| Simpan metadata bukti | Jadual `attachments` | ✅ Wujud & kosong. RLS sedia ada betul (berskop secara tidak langsung melalui RLS bersarang); dijadikan eksplisit dalam migrasi 030 |
| UI giliran semak & sahkan/tolak | `PengesahanTab.tsx` | ⚠ Corak boleh dicontohi, tapi query kena baharu + tapisan pukal |
| Kunci pendaftaran | `school_badge_status` + `lockedBadges` | ✅ Sedia berfungsi |
| Buka semula untuk edit | `reopenSchoolBadge` | ✅ Terus boleh guna |
| Kira jumlah yuran | `buildProgramSummary` | ⚠ Logik dicontohi tapi **jangan panggil dari client untuk cipta bil** — tulis semula server-side |
| Tarik diri | `is_withdrawn` | ✅ Sedia berfungsi, dah dikecualikan dari kiraan yuran |
| Dimensi siri | `submission_people.siri` | ✅ Sedia ada (migrasi 025) — dimensi yang had tempat dikira |
| Jejak audit | `audit_logs` | ✅ Wujud — perlu diwayarkan |
| Notifikasi | `notifications` + Telegram | ✅ Wujud — perlu diwayarkan |
| Resit PDF | `services/pdfService.ts` (jsPDF) | ✅ Ada asas penjanaan PDF |
| Tapisan statistik | `deduplicateRecords` | ⚠ **Dua sentuhan kecil** — kunci pengesahan mengandungi siri, dan tapis submission `draft`. Kunci dedup **dibiarkan** (§7.1) |
| Pengesahan berasingan per siri | `attendance_verifications.siri` (migrasi 025) | ✅ Preseden sedia ada untuk corak yang sama pada `school_badge_status` |

---

## 9. Fasa Pembangunan

### Fasa 0 — Semakan pra-implementasi (buat DULU)
- [x] ~~Sahkan `pg_cron` + `pg_net`~~ → **kedua-dua tersedia tetapi belum dipasang**; pendekatan dalam-DB dipilih, cron luaran tidak diperlukan
- [x] ~~Sahkan Supabase Vault~~ → **v0.3.1 dipasang & aktif**, skema `vault` wujud
- [x] ~~Hidupkan `pg_cron`~~ → **dipasang**, skema `cron` wujud
- [x] ~~Hidupkan `pg_net`~~ → **dipasang**, skema `net` wujud
- [x] ~~Ujian asap penjadual~~ → **LULUS**: 5 larian berturut-turut `succeeded`, tepat pada minit
- [x] ~~Ujian egress HTTP~~ → **LULUS**: `status_code 200` dari `dev.toyyibpay.com`, tiada ralat

**Kesimpulan teknikal Fasa 0: tiada penghalang.** Corak `pg_cron` → `net.http_post` → Edge Function → ToyyibPay disahkan boleh dilaksana. Vault sedia untuk kredensial. Tiada keperluan cron luaran, tiada perubahan pada reka bentuk Fasa 1.
- [x] ~~Putuskan siapa tanggung caj transaksi~~ → **sekolah tanggung, ditambah atas bil; FPX sahaja** (Keputusan #11c, #11d)
- [x] ~~Sahkan akaun ToyyibPay~~ → **ada, skop DAERAH, aktif digunakan 3–4 tahun**. Satu akaun buat masa ini; skop lain menyusul tanpa perubahan skema. Implikasi akaun dikongsi: §6.5

- [x] ~~Daftar akaun **sandbox**~~ → **selesai**. Pendaftaran berasingan disahkan; skrin "Profile Verification 3 hari" ialah teks bawaan templat produksi dan tidak menghalang penggunaan API sandbox
- [x] ~~Cipta kategori ScoutNadi di sandbox~~ → **selesai**

- [x] ~~Pilih program perintis~~ → **Keris Perak 2026, Kinta Utara** (lihat bawah)

**Boleh ditangguh sehingga pelancaran produksi** (tidak menghalang Fasa 1):
- [ ] Cipta `categoryCode` ScoutNadi pada akaun **produksi** — berasingan daripada kategori kegunaan sedia ada (§6.5)
- [ ] Sahkan kadar caj FPX sebenar (isi `transaction_fee_flat`; andaian semasa RM1.00). Sandbox tiada caj sebenar

**Program di luar skop perintis:** Keris Emas 2026 kekal `payment_online_required = false`. Yuran RM67 kekal sebagai paparan maklumat seperti hari ini — tiada bil, tiada pintu bayaran, tiada perubahan aliran kerja. Tetapi ia **tetap tersentuh oleh migrasi siri**, kerana itu perubahan skema pada jadual yang dikongsi semua program (§7.3).

---

### Persekitaran Perintis

**Akaun ToyyibPay:** skop **daerah — Kinta Utara, Perak (`PRK-KU`)**. Digunakan aktif 3–4 tahun untuk tujuan lain; implikasi akaun dikongsi di §6.5. Baris pertama `payment_gateway_settings` dipetakan kepada daerah ini.

**Program perintis: Keris Perak 2026 · Kinta Utara**

| Tetapan | Nilai | Kenapa sesuai |
|---|---|---|
| Skop program | `daerah` | Padan dengan skop akaun — resolusi akaun tiada fallback (§3.3) |
| Yuran | Peserta **RM80.00** sahaja | Satu peranan dicaj → satu peranan mengambil tempat. Peraturan #10 dalam bentuk paling mudah |
| Baju | Tidak aktif | Tiada isu harga baju yang belum wujud |
| Siri | Aktif, maks 3 — perintis pada **Siri 2** | |
| Had tempat | Belum ditetapkan | Disyorkan **tanpa had** pada larian pertama |

Contoh bil: 30 peserta × RM80.00 = RM2,400.00 **+ RM1.00 caj** = **RM2,401.00** dibayar; Kinta Utara terima RM2,400.00.

**Nota:** siri diaktifkan pada perintis, jadi migrasi `school_badge_status.siri` dan perubahan `dataProcessing.ts` (§7.1) berada pada **laluan kritikal** — bukan boleh ditangguh ke program kedua. Ini menguji bahagian paling berisiko lebih awal, yang baik, tetapi bermakna ujian regresi statistik mesti bersih sebelum perintis bermula.

**Belum ditetapkan pada perintis:** `badges.deadline` masih kosong, jadi tiada apa yang menutup pendaftaran secara automatik. Tetapkan `payment_deadline` bagi Siri 2 sebelum sekolah sebenar dijemput.
- [ ] Pilih **satu program perintis** — **mesti berskop `daerah`** dan milik daerah yang sama dengan akaun. Resolusi akaun tiada fallback senyap (§3.3), jadi program skop `negeri` akan gagal cipta bil

### Fasa 1 (Teras — ketiga-tiga kaedah bayaran)

**Data & keselamatan**

_Migrasi 027 — dimensi siri (DITULIS, belum dipasang)_
- [x] ~~`school_badge_status.siri`~~ → lajur → backfill dipacu data → tukar kunci unik
- [x] ~~`dataProcessing.ts`: kunci pengesahan bersiri~~ → `badgeStatusKey()` / `parseBadgeStatusKey()` sebagai satu sumber kebenaran
- [x] ~~`supabaseApi.ts`: kunci bersiri + 9 upsert `onConflict`~~
- [x] ~~`UserForm.tsx`: semakan `lockKey` ikut siri terpilih~~
- [x] ~~Skrip garis dasar~~ → `scripts/027_garis_dasar.sql`
- [x] ~~Tiga laluan masuk siri selamat~~ → borang, Import Naik (`lockSchoolBadge` ambil siri dari data sebenar), Set Siri (warisi status)

_Migrasi 028 — skema bayaran (DITULIS, belum dipasang)_
- [x] ~~`payments`~~ → kunci (school, badge, year, siri), snapshot, `seat_status`, indeks unik separa, RLS baca-sahaja tanpa polisi tulis
- [x] ~~`program_siri_settings`~~ → had nullable, `payment_deadline`, `is_closed`
- [x] ~~`payment_gateway_settings`~~ → rujukan Vault, RLS deny-all + view berskop tanpa lajur rahsia
- [x] ~~`school_badge_status.payment_status`~~ + ~~`program_settings.payment_online_required`~~

_Migrasi 029 — kuatkuasa (DITULIS, belum dipasang)_
- [x] ~~`claim_siri_seats`~~ → `FOR UPDATE` pada baris tetapan siri + kiraan langsung; mengembalikan hasil dan bukan membuang ralat, supaya webhook boleh menanda `no_seat`
- [x] ~~`siri_seats_taken`~~ → satu sumber kebenaran kiraan tempat; had seluruh program, bukan per sekolah
- [x] ~~`check_siri_availability`~~ → semakan baca-sahaja untuk dropdown & pra-bil
- [x] ~~`resolve_program_setting`~~ → padanan tetapan ikut skop sekolah (cerminan `findSetting`)
- [x] ~~**Trigger DB**: halang `approved` jika bayaran diwajibkan tapi belum `paid`~~ — meliputi INSERT dan UPDATE, kerana `approveSchoolBadge` menggunakan upsert

_Belum ditulis_
- [ ] `dataProcessing.ts`: tapis submission `draft` di sini, **bukan** semasa fetch (§7.1c)
- [ ] `types.ts` + mapping `fetchCloudData`: tambah `submissionStatus` pada `SubmissionData`
- [x] ~~Migrasi 030: `attachments.category` + `payment_id`, polisi eksplisit, sekolah boleh buang bukti sendiri selagi `pending_review`~~ → ditulis, belum dipasang
- [ ] Semakan pendua merentas siri **server-side** sebelum bil dijana (§7.2)

**Backend**
- [ ] Edge Function `create-payment-bill` — kira jumlah server-side, semak tempat & tarikh, resolusi akaun ikut skop
- [ ] Edge Function `toyyibpay-callback` — webhook + double-check + `claim_siri_seats` + idempoten + log
- [ ] Edge Function `check-payment-status` — dipanggil masa sekolah redirect balik (lapisan 1)
- [ ] Edge Function `submit-payment-proof` — terima resit/cek, tanda `pending_review`, `claim_siri_seats`
- [ ] Ubah suai aliran hantar: `draft` sehingga bayaran diuruskan, kemudian `submitted`
- [ ] Batalkan bil `pending` bila senarai peserta berubah
- [ ] Job cron: semak bayaran tersangkut + batalkan bil lepas tarikh tutup
- [ ] `audit_logs` pada setiap transisi status bayaran
- [ ] Notifikasi: admin bila bayaran masuk; sekolah bila disahkan/ditolak/tiada tempat

**UI**
- [ ] Admin: togol "Wajib Bayar Online" per program (`AdminBadges.tsx`) — **dihalang jika tiada yuran ditetapkan**
- [ ] Admin: had peserta + tarikh tutup bayaran + butang Tutup Siri, **setiap program × siri**. Label had mesti papar peranan mana yang dikira, ikut yuran semasa (§3.2)
- [ ] Admin: amaran berangka + sekatan bila menukar yuran selepas ada bayaran (§3.9)
- [ ] Admin: tetapan akaun ToyyibPay + maklumat akaun bank per skop, dengan ujian sambungan
- [ ] Admin: lencana bayaran + papar bukti dalam `PengesahanTab`; lumpuhkan Sahkan bila belum bayar
- [ ] **Tapis "Sahkan Pukal"** supaya langkau yang belum bayar
- [ ] Admin: giliran "Dibayar tanpa tempat"
- [ ] Sekolah: dropdown siri papar baki tempat; penuh/tertutup/lepas tarikh dikelabukan
- [ ] Sekolah: skrin bayaran tiga pilihan (ToyyibPay / pindahan bank / cek) selepas tekan Hantar
- [ ] Sekolah: muat naik bukti + no. rujukan (guna `r2-presigned-upload`)
- [ ] Sekolah: papar status "Menunggu Bayaran" / "Bukti Sedang Disemak" dengan jelas
- [ ] Tambah `payment_status` pada objek `School` dalam `fetchCloudData`
- [ ] Resit PDF selepas `paid` (guna `pdfService`)

**Ujian**
- [ ] Uji penuh di sandbox ToyyibPay sebelum akaun sebenar
- [ ] Uji kes: webhook gagal, browser ditutup sebelum redirect, webhook dua kali, callback palsu
- [ ] **Uji SBI BANK C (pending 30 minit)**: bil TIDAK dibatalkan semasa transaksi tergantung; bila bank akhirnya lulus, bayaran diproses seperti biasa
- [ ] Uji SBI BANK B: `failed` dikendali, sekolah boleh jana bil baharu
- [ ] Uji bil yang benar-benar tidak disentuh: dibatalkan selepas 30 minit seperti sepatutnya
- [ ] Uji callback untuk `order_id` yang bukan milik kita (akaun dikongsi, §6.5) → log, balas 200, jangan proses
- [ ] **Uji tekanan tempat**: dua sekolah bayar SERENTAK untuk tempat terakhir — sahkan seorang dapat, seorang masuk giliran "dibayar tanpa tempat"
- [ ] **Uji regresi statistik** selepas tukar kunci bersiri: jumlah keseluruhan untuk program sedia ada mesti KEKAL SAMA sebelum & selepas migrasi
- [ ] Uji sekolah hantar Siri 1 → disahkan & dikunci → **masih boleh hantar Siri 2** untuk badge yang sama
- [ ] Uji orang yang sama cuba didaftar dalam Siri 2 program yang sama — **ditolak**, di UI dan di server
- [ ] Uji orang yang sama dalam **program berlainan** siri berlainan (Emas Siri 1 + Perak Siri 2) — **dibenarkan & kedua-duanya dikira**
- [ ] Uji semakan pendua masih nampak pendaftaran `draft` yang belum bayar (jangan sampai dua sekolah bayar untuk orang sama)
- [ ] Uji peserta `draft` (belum bayar) TIDAK muncul dalam statistik walaupun siri lain program sama sudah disahkan
- [ ] Uji program **tanpa had** (`max_peserta` NULL) — hanya tarikh yang menutup
- [ ] Uji hanya `fee_peserta` diisi → pemimpin & penolong didaftar tetapi **tidak dicaj dan tidak makan tempat**
- [ ] Uji ketiga-tiga yuran diisi → ketiga-tiganya **masuk bil dan makan tempat**
- [ ] Uji PENGUJI tidak pernah dicaj & tidak pernah makan tempat, walau apa pun tetapan
- [ ] **Uji tukar yuran pertengahan program**: tambah `fee_pemimpin` selepas 250 peserta dibayar → amaran papar angka sebenar; simpanan ditolak jika had dilanggar
- [ ] Uji bil yang sudah `paid` **tidak** dikira semula selepas yuran ditukar
- [ ] Uji **jumlah RM0** (hanya pemimpin didaftar, hanya `fee_peserta` ditetapkan) → langkau pintu bayaran, terus `submitted`, bukan tersangkut
- [ ] Uji togol "Wajib Bayar Online" **ditolak** bila tiada satu pun yuran ditetapkan
- [ ] Uji program tanpa yuran: hantar terus masuk giliran pengesahan, tiada skrin bayaran muncul
- [ ] Uji caj transaksi: ToyyibPay = yuran + caj · pindahan bank & cek = yuran sahaja
- [ ] Uji `getBillTransactions` dibandingkan dengan `total_amount`, bukan `amount` — kalau tersalah, setiap bayaran ToyyibPay akan ditolak sebagai jumlah tak sepadan
- [ ] Uji resit papar yuran & caj sebagai baris berasingan
- [ ] Uji medan had **dilumpuhkan** bila tiada yuran — admin tidak boleh menetapkan had yang senyap-senyap tidak berfungsi
- [ ] Uji bukti ditolak → tempat betul-betul dilepaskan
- [ ] Uji tarik diri melepaskan tempat
- [ ] Uji ubah senarai semasa bil `pending` → bil lama dibatalkan
- [ ] Uji kitaran buka-semula: TIADA bil kedua dijana
- [ ] Sahkan program `payment_online_required = false` betul-betul tak terjejas

### Fasa 2 (Kemasan)
- [ ] Invois rasmi bernombor
- [ ] Reminder automatik (Telegram/WhatsApp) untuk bil belum dibayar sebelum tarikh tutup
- [ ] Rumusan kutipan per program × siri (dikutip/pending/ditolak) dalam `ProgramSummaryView`
- [ ] Paparan awam "baki tempat" untuk sekolah membuat keputusan lebih awal

### Fasa 3 (Lanjutan)
- [ ] Harga baju (`shirt_price`) supaya baju boleh dicaj
- [ ] Senarai menunggu bila siri penuh
- [ ] Pilihan bayar individu (bukan sekali gus)
- [ ] Workflow refund/kredit
- [ ] Reconcile dengan `BILLING_MODULE_DESIGN.md`

---

## 9b. Jurang Wajib Ditutup Sebelum Program Berbayar Pertama

### Peserta boleh ditambah SELEPAS pengesahan, tanpa dibil

**Disahkan dalam data sebenar (2026-08-09).** Keris Emas 2026 Siri 1 mempunyai **41 peserta** dalam submission berstatus `draft`, tersebar merentas **7 sekolah**. 19 daripadanya berada di bawah baris status `approved`, jadi mereka **dikira dalam statistik rasmi hari ini** walaupun submission induknya draf.

Puncanya: `createSubmissionWithPeople` lalainya `'draft'`, dan Import Naik tidak pernah menghantar nilai lain. Draf hanya bertukar `submitted` apabila sekolah menekan Hantar (`lockSchoolBadge`). Peserta yang ditambah selepas itu kekal draf tetapi **menumpang pengesahan sedia ada**, dan statistik hanya menyemak pengesahan.

Taburan merentas 7 sekolah menunjukkan ini **rutin, bukan terpencil**. Corak nama menimbulkan hipotesis bahawa ia berlaku apabila pemimpin/penolong ditambah melalui penghantaran berasingan selepas peserta.

**Kenapa ia mematikan untuk bayaran:**

```
Sekolah bayar untuk 20 peserta       →  disahkan, 20 tempat diambil
Kemudian tambah 5 pemimpin (draf)    →  menumpang pengesahan yang sama
                                     →  dikira dalam statistik
                                     →  TIDAK pernah dibil, TIDAK ambil tempat
```

Duit terlepas, dan kuota terlepas.

**Bukan penyelesaiannya:** menapis `submissionStatus === 'draft'` dalam `deduplicateRecords`. Dicuba pada 2026-08-09 dan digulung semula — ia akan melenyapkan 20 peserta sah daripada laporan rasmi, kerana draf ialah keadaan biasa bagi penambahan yang sah dan bukan penanda "belum bayar".

**Arah penyelesaian yang perlu diputuskan:**
- Tambahan kepada program yang sudah `approved` mengembalikan status kepada `submitted` (memaksa pengesahan semula), atau
- Bil tambahan dijana automatik untuk peserta yang ditambah selepas bayaran, atau
- Sekat penambahan sepenuhnya selepas pengesahan bagi program `payment_online_required`

Ketiga-tiganya mengubah aliran kerja sedia ada, jadi ia perlu keputusan sebelum dilaksana.

---

## 10. Soalan Terbuka

| # | Soalan | Nota |
|---|--------|------|
| 2 | Sekolah yang bilnya luput berulang kali (jana-luput-jana) — perlu had percubaan? | Tiada tempat dipegang, jadi tiada kemudaratan langsung; cuma bunyi bising dalam data & log |
| 3 | **Peraturan "satu siri sahaja" patut terpakai kepada PEMIMPIN juga?** | Kod sekarang menyekat **semua peranan**, termasuk pemimpin. Tapi pemimpin sekolah yang sama munasabah mengiringi Siri 1 **dan** Siri 2. Jika perlu dibenarkan, hadkan sekatan kepada PESERTA sahaja. Ini tingkah laku sedia ada, bukan sesuatu yang modul bayaran perkenalkan — tetapi ia jadi lebih ketara bila setiap siri ada bil sendiri |
| 4 | Admin boleh naikkan had selepas penuh? | Boleh secara teknikal. Perlu diputuskan sama ada perlu audit khas + notifikasi sekolah yang tertolak sebelum ini |
| 5 | Cek yang ditolak bank selepas admin sahkan — proses macam mana? | Bayaran sudah `paid` & tempat sudah diberi. Perlu jalan untuk admin patah balik |
| 6 | Baju perlu dicaj bersama yuran? | Perlu lajur `shirt_price` — Fasa 3 |
| 7 | Refund penuh/sebahagian — proses & rekod? | ToyyibPay tiada refund API |
| 8 | Kes pengecualian (sekolah dikecualikan yuran)? | Cadangan: `payment_status = 'not_required'` boleh diset admin dengan sebab + audit |
| 9 | Senarai menunggu bila siri penuh? | Fasa 3 jika perlu |

---

## 11. Prinsip Utama

1. **Bayar dahulu, hantar kemudian** — pendaftaran kekal `draft` sehingga bayaran diuruskan. Tiada bayaran, tiada penghantaran.
2. **Tempat milik yang sudah bayar** — tiada tempahan, tiada penahanan. Bil yang belum dibayar tidak memegang apa-apa.
3. **Bukti yang dihantar dikira sudah bayar** — `pending_review` mengambil tempat kerana duit sudah keluar dari sekolah; jika bukti ditolak, tempat dilepaskan.
4. **Had melekat pada program × siri** — dua program dalam siri yang sama tidak berkongsi kolam tempat. Had adalah opsyenal; tarikh tutup bayaran sentiasa ada.
4b. **Sesiapa yang dicaj, mengambil tempat** — satu sumber kebenaran (tetapan yuran) menentukan kedua-dua bil dan kiraan tempat. Tiada tetapan kuota berasingan yang boleh terpesong daripada tetapan yuran.
5. **Pengesahan admin kekal pintu statistik** — bayaran ialah syarat masuk giliran, bukan pintu kedua.
6. **Setiap siri ialah pusingan berasingan** — hantaran, bil, tempat, kunci dan pengesahan semuanya per siri. Siri 1 selesai tidak menghalang Siri 2.
7. **Bayaran terikat pada `sekolah + program + tahun + siri`** — hantar semula dalam siri yang sama tidak menjana bil baharu.
8. **Setiap negeri/daerah kutip ke akaun sendiri** — kredensial berskop, dalam Vault, tidak pernah didedah ke browser.
9. **Duit tak dipercayai dari client** — jumlah dikira server-side, status hanya ditulis oleh Edge Function service role, status gateway disahkan semula dengan ToyyibPay.
10. **Kuatkuasa di peringkat DB, bukan UI** — trigger dan penguncian baris, bukan semakan dalam React.
11. **Kiraan tempat dikira langsung di bawah kunci** — bukan kaunter yang boleh menyimpang. Penyimpangan pada data berbayar bermakna refund manual.
12. **Jual lebih diakui, bukan disembunyikan** — akibat langsung "tiada tempahan"; dikurangkan dengan semakan awal & bil bertempoh, dan kes yang terlepas masuk giliran tindakan admin.
13. **Opsyenal & tak menjejaskan sedia ada** — program tanpa `payment_online_required` kekal 100% macam sekarang.
14. **Jejak audit penuh** — setiap percubaan, bukti, pengesahan/penolakan direkod (siapa, bila, kenapa).
15. **Sistem papar maklumat, admin buat keputusan kewangan** — tiada automasi buta untuk refund atau beza jumlah.

---

## 12. Semakan Terhadap Kod Sebenar (rujukan implementasi)

| Perkara | Fail & baris | Penemuan |
|---|---|---|
| Setiap Hantar cipta baris `submissions` baharu | `supabase/functions/submit-registration/index.ts:77-90` | Sebab bil tak boleh diikat pada `submission_id` |
| Status `draft` sudah wujud & digunakan | `supabase/migrations/001_schema.sql:125`, `services/supabaseApi.ts:259, 289, 365` | Boleh terus diguna sebagai keadaan "menunggu bayaran" — tiada status baharu diperlukan |
| Buka semula membenarkan hantar sekali lagi | `services/supabaseApi.ts:1107-1129` | `status='reopened'` → `lockedBadges` tak lagi mengandungi kunci → borang terbuka semula |
| Kunci selepas hantar | `components/UserForm.tsx:246-250`, `components/UserDashboard.tsx:576-583` | Sekolah terkunci sejak `submitted` |
| Pintu statistik sedia ada | `utils/dataProcessing.ts:56-71`, `services/supabaseApi.ts:174-177` | `approvedBadges` berkunci `${badge}_${year}` |
| `school_badge_status` unique key | `supabase/migrations/001_schema.sql:170-184` | `unique(school_id, badge_id, year)` — kunci untuk bayaran |
| Approve ialah upsert client-side | `services/supabaseApi.ts:669-683` | Sekatan UI tak memadai → perlu trigger DB (§3.7) |
| Sahkan pukal tiada syarat | `components/PengesahanTab.tsx:109-137` | Akan sahkan yang belum bayar sekali — perlu ditapis |
| Skop tetapan yuran | `supabase/migrations/023_program_payment_shirt.sql`, `services/programSummary.ts:59-65` | Per negeri/daerah + tahun → sokong akaun ToyyibPay per skop |
| Logik kiraan yuran | `services/programSummary.ts:85-158`, khususnya `:149-152` | `(p.feePeserta \|\| 0) * count` — yuran `null` menyumbang RM0, jadi **"isi yuran = dicaj, kosong = tak dicaj" sudah berkuat kuasa** (Keputusan #10c). PENGUJI tak dicaj langsung; `isWithdrawn` dilangkau; tiada harga baju |
| Yuran memang nullable by design | `supabase/migrations/023_program_payment_shirt.sql` | Komen migrasi: *"Yuran ikut peranan: Peserta, Pemimpin, Penolong Pemimpin (null = tak caj)"* — niat asal memang begitu |
| Satu borang = satu siri | `components/UserForm.tsx:312, 560-572` | `withSiri()` menandakan **satu siri untuk semua peserta dalam borang**; label pengguna pun menyatakannya. Jadi satu bil = satu kolam tempat, tiada logik merentas siri diperlukan |
| Kunci sekarang tak kenal siri | `components/UserForm.tsx:247`, `supabase/migrations/001_schema.sql:170-184` | `lockKey = ${badgeType}_${currentYear}` dan `unique(school_id, badge_id, year)` — sekolah yang dah hantar Siri 1 **terkunci daripada hantar Siri 2** untuk badge sama. Punca Keputusan #1b |
| Preseden siri pada pengesahan | `supabase/migrations/025_program_siri.sql` | `attendance_verifications.siri` ditambah supaya kehadiran setiap siri disahkan berasingan — corak yang sama diikuti untuk `school_badge_status` |
| Peraturan "satu siri sahaja" sudah dikuatkuasakan | `components/UserForm.tsx:283-305`, khususnya `:294-297` | Padan IC + badge + tahun **tanpa siri**, merentas semua sekolah. Ini tepat dengan Keputusan #1c — jadi kunci dedup `dataProcessing.ts:77-79` **dibiarkan seperti sedia ada** |
| Semakan pendua client-side sahaja | `components/UserForm.tsx:283` (`if (existingData)`) | Berdasarkan senarai yang sudah dimuat turun. Memadai sebagai panduan, tidak memadai sebagai penjaga wang → ulang server-side (§7.2). Juga: hanya terpakai bila IC ada & > 4 aksara |
| Draf tidak ditapis semasa fetch | `services/supabaseApi.ts:103-110` | `fetchCloudData` ambil semua `submission_people` tanpa menapis `submissions.status` → peserta belum bayar boleh masuk statistik. **Tapis dalam `deduplicateRecords`, bukan dalam fetch** — senarai penuh masih diperlukan oleh semakan pendua (§7.1c) |
| `max_siri` bukan had orang | `supabase/migrations/026_program_siri_max.sql` | Hadkan **bilangan siri** sahaja (default 5, maks 20) — had tempat ciri baharu sepenuhnya |
| Kuota kursus ada race condition | `services/courseService.ts:332`, `:277, 301` | Baca-dulu-tulis-kemudian dari client. **Jangan tiru** untuk tempat berbayar |
| Tarikh tutup program sedia ada | `supabase/migrations/001_schema.sql:62`, `components/UserForm.tsx:12` | `badges.deadline` + `isBadgeClosed()` — tarikh tutup **pendaftaran**; tarikh tutup **bayaran** adalah medan berasingan |
| `SubmissionData` tiada medan bayaran | `types.ts:34-69`, `services/supabaseApi.ts:182-214` | Status bayaran diletak pada objek `School`, bukan per peserta |
| RLS `attachments` longgar | `supabase/migrations/002_rls_policies.sql:294-307` | `select` tak diskop ke sekolah sendiri; tiada polisi update; delete admin-sahaja |
| R2 presign generik | `supabase/functions/r2-presigned-upload/index.ts:16-27` | Boleh terus diguna untuk bukti bayaran |
| pg_cron belum tentu aktif | `supabase/migrations/020_data_retention_policy.sql:47-50` | Perlu disahkan (§9 Fasa 0) |
| Corak RLS berskop | `supabase/migrations/002_rls_policies.sql:24-44, 186+` | `get_my_role()` / `get_my_negeri_id()` / `get_my_daerah_id()` |
