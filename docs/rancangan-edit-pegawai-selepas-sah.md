# Rancangan: Edit Pegawai Selepas Pengesahan

Status: **rancangan · belum implementasi**. Tiga soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

---

## 1. Keperluan

Hari ini, sebaik pendaftaran dihantar dan disahkan, sekolah tidak boleh mengedit apa-apa. Dalam amalan senarai pegawai masih berubah selepas itu: pemimpin bertukar sekolah, penolong ditambah, penguji ditetapkan lewat.

Yang dikehendaki ialah togol per program: walaupun sudah dihantar dan disahkan, sekolah masih boleh **edit, tambah dan buang** bagi tiga peranan — **PEMIMPIN**, **PENOLONG PEMIMPIN**, **PENGUJI**. PESERTA kekal terkunci.

Perubahan itu mesti terus dikira dalam statistik, kerana pendaftaran itu sudah disahkan.

---

## 2. Apa yang ditemui dalam kod

### 2.1 Statistik sudah berkelakuan seperti yang dikehendaki

`buildProgramSummary` (`services/programSummary.ts`) membina rumusan daripada **semua** rekod peserta, ditapis mengikut tahun dan tetapan program. Ia tidak pernah menapis mengikut status pengesahan.

Jadi sesiapa yang ditambah kepada pendaftaran yang sudah disahkan akan muncul dalam statistik serta-merta. **Tiada kerja diperlukan untuk bahagian ini.**

### 2.2 Kunci selepas pengesahan hanyalah paparan

Ini penemuan yang penting, dan ia mengubah bentuk kerja.

`canModifyRecord` (`components/UserDashboard.tsx:605`) menolak pengeditan apabila lencana berstatus `locked` atau `approved`. Itu sahaja tempat kunci itu wujud.

Di sebelah pelayan, dasar RLS `submission_people_update`, `_insert` dan `_delete` (migrasi 002) hanya memeriksa bahawa baris itu milik sekolah pengguna:

```sql
submission_id in (select id from public.submissions where school_id = public.get_my_school_id())
```

Tiada rujukan kepada status. `updateParticipantFields` (`services/supabaseApi.ts:1392`) juga tidak menyemaknya — ia terus memanggil `.update()`.

Dua akibat:

- Melaksanakan togol ini **tidak memerlukan perubahan RLS**. Ia perubahan paparan sahaja, kerana pelayan memang sudah membenarkannya.
- Kunci sedia ada boleh dipintas oleh sesiapa yang memanggil API terus. Itu kelemahan yang sudah wujud hari ini, bukan yang diperkenalkan oleh togol ini — tetapi menambah togol yang "membenarkan" sesuatu yang sebenarnya tidak pernah disekat patut direkodkan dengan jujur, bukan dijual sebagai kawalan keselamatan.

### 2.3 Pegawai boleh dicaj, dan yang dicaj mengambil tempat

`enforce_payment_before_approval` dan `siri_seats_taken` berkongsi satu takrifan (migrasi 029 baris 111–112, 269–270):

```sql
or (sp.role = 'PEMIMPIN'          and ps.fee_pemimpin is not null)
or (sp.role = 'PENOLONG PEMIMPIN' and ps.fee_penolong is not null)
```

Sesiapa yang dicaj mengambil tempat (Keputusan #10). Jadi bagi program yang menetapkan `fee_pemimpin` atau `fee_penolong`, menambah pemimpin selepas pengesahan bermakna menambah orang yang **sepatutnya dicaj dan sepatutnya mengambil tempat** — tanpa bil dan tanpa tuntutan tempat, kerana kedua-duanya hanya berlaku melalui aliran Hantar yang sudah tamat.

PENGUJI tidak pernah dicaj; tiada `fee_penguji` wujud. Peranan itu selamat tanpa syarat.

Ini bukan sebab untuk menolak permintaan. Ia sebab kenapa Soalan 1 di bawah mesti dijawab sebelum kod ditulis.

---

### 2.4 Tambah dan edit tidak konsisten hari ini

`UserForm` menyekat pendaftaran baharu dengan menyemak `lockedBadges` sahaja (`components/UserForm.tsx:290`). Senarai itu dibina daripada baris berstatus **`submitted`** (`services/supabaseApi.ts:172`); `approvedBadges` ialah senarai berasingan, dan `UserForm` tidak pernah merujuknya.

Akibatnya, pada lencana yang sudah **disahkan**:

| Tindakan | Keadaan hari ini |
|---|---|
| Tambah orang baharu | **Dibenarkan** — lencana sudah keluar daripada `lockedBadges` |
| Edit orang sedia ada | Disekat oleh `canModifyRecord` |
| Buang orang sedia ada | Disekat oleh `canModifyRecord` |

Ini bukan reka bentuk; ia kesan sampingan dua senarai berasingan yang hanya satu daripadanya disemak. Kerja ini mesti menyeragamkan ketiga-tiganya di bawah satu peraturan, bukan menambah togol di atas percanggahan tersebut.

---

## 3. Reka bentuk

**R1 — Togol tinggal dalam Urus Sekolah, bersebelahan togol sedia ada.**
Panel "Kawalan Edit Pukal Mengikut Program" (`components/AdminSchools.tsx:488`) sudah memegang tiga butang per program: Peserta, Penolong, Penguji. Togol baharu ialah baris **kedua** dalam panel yang sama, berlabel "Selepas Hantar", dengan dua butang sahaja: **Penolong** dan **Penguji**.

Tiada migrasi diperlukan. Kebenaran sedia ada disimpan sebagai JSON dalam `school_badge_status.notes` di bawah kunci `editPermissions`; yang baharu duduk bersebelahannya sebagai `editPermissionsSelepas`. Struktur, penulis pukal dan pembaca semuanya sudah wujud.

Butang "Peserta" sengaja tiada pada baris kedua. PESERTA kekal terkunci selepas penghantaran dalam semua keadaan.

**R2 — Hanya peranan yang TIDAK dicaj boleh dibuka.**
Kalau program menetapkan `fee_pemimpin` atau `fee_penolong`, butang Penolong pada baris "Selepas Hantar" tidak berkuat kuasa bagi program itu. Sesiapa yang dicaj mengambil tempat (Keputusan #10), dan membenarkan penambahan mereka selepas pengesahan bermakna tempat digunakan tanpa bil.

PENGUJI tidak pernah dicaj — tiada `fee_penguji` wujud — jadi peranan itu sentiasa boleh dibuka.

Butang mesti **menyatakan** perkara ini, bukan hanya gagal secara senyap. Program yang mengecaj pemimpin memaparkan butang Penolong dalam keadaan lumpuh dengan sebabnya, supaya admin tidak menandakannya dan tertanya kenapa tiada apa berubah.

**R3 — Satu peraturan untuk edit, tambah dan buang.**
Ketiga-tiganya diselaraskan di bawah pemeriksaan yang sama. Ini turut membetulkan percanggahan §2.4: selepas pengesahan, menambah kini mengikut peraturan yang sama seperti mengedit, dan bukan terbuka luas kerana lencana keluar daripada satu senarai.

`UserForm` mesti mengehadkan pilihan peranan kepada yang benar-benar dibuka apabila lencana sudah dihantar atau disahkan. Tanpa itu, guru menambah PESERTA melalui pintu yang dibuka untuk pegawai — tepat kegagalan "butang Tambah sentiasa mencipta peranan PESERTA" yang dibetulkan awal sesi ini.

**R4 — Statistik tidak disentuh.** Lihat §2.1.

**R5 — Granulariti mengikut kawalan sedia ada: per program, semua siri, semua sekolah.**
Panel itu memang beroperasi begitu, dan togol baharu mengikutinya supaya kedua-dua baris bermaksud perkara yang sama. Kesannya: membuka Keris Emas turut membuka Siri 1 yang mungkin sudah selesai. Bagi peranan pegawai yang tidak dicaj, risikonya kecil — tiada wang dan tiada tempat terlibat. Kalau ia menyusahkan kemudian, ia berpindah ke jadual "Kawalan Per Siri" seperti yang dilakukan migrasi 049 kepada dua togol lain.

---

## 4. Keputusan tertutup

Tiada soalan terbuka. Wang tidak pernah masuk ke dalam ciri ini: peranan yang dicaj kekal terkunci seperti sekarang (R2), jadi tiada persoalan bil susulan, tiada refund, dan tiada tempat berpindah tangan.
