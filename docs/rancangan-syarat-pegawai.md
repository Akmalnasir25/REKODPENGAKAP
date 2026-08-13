# Rancangan: Syarat Pegawai Sebelum Hantar

Status: **rancangan · belum implementasi**. Tiga soalan terbuka di hujung mesti ditutup sebelum sebarang kod ditulis.

---

## 1. Keperluan

Sesetengah program menuntut sekolah menyertakan sekurang-kurangnya seorang **Pemimpin** dan seorang **Penguji** bersama pendaftaran pesertanya. Menghantar peserta tanpa mereka tidak dibenarkan.

Admin menghidupkan atau mematikan syarat ini per program dalam Urus Program. Bila dimatikan, peserta boleh dihantar tanpa pegawai — tingkah laku hari ini.

---

## 2. Di mana ia dikuatkuasakan

Kedua-dua laluan Hantar berakhir di tempat yang sama:

| Laluan | Apa yang berlaku |
|---|---|
| Program berbayar | `create-payment-bill` mencipta bil; pengesahan bayaran menulis status |
| Program percuma | `create-payment-bill` menolaknya ke `terusHantar` dan menulis status terus |

Kedua-duanya menulis `school_badge_status.status = 'submitted'`. Itu **satu titik sempit**, dan pencetus di situ sudah wujud: `enforce_submission_open` (migrasi 049) sudah membaca `new.school_id`, `new.badge_id`, `new.year` dan `new.siri` — tepat kunci yang diperlukan untuk mengira orang.

Jadi syarat ini mendapat pencetusnya sendiri pada jadual yang sama, bukan sisipan ke dalam yang sedia ada. Dua peraturan berbeza dengan mesej ralat berbeza tidak sepatutnya berkongsi satu fungsi.

Tiga lapisan, sama seperti §14:

| Lapisan | Peranan |
|---|---|
| Butang Hantar | Menyatakan apa yang kurang, sebelum guru menekan apa-apa. Kemudahan sahaja |
| `create-payment-bill` | Melangkau program yang gagal, dengan sebabnya. Mengelakkan bil dicipta untuk pendaftaran yang tidak boleh masuk |
| Pencetus | Pintu sebenar. Program percuma tidak pernah melalui Edge Function |

---

## 3. Keputusan

**K1 — Aras program, bukan per siri.**

Migrasi 049 memindahkan dua togol ke aras siri kerana ia terlalu kasar. Ini berbeza, dan bukan sekadar lebih mudah: `payment_online_required` dan `submission_open` ialah keputusan **penjadualan** — pusingan ini berbayar, pusingan itu belum dibuka. Syarat pegawai ialah **peraturan program**: kalau Keris Emas menuntut seorang penguji hadir, ia menuntutnya pada setiap pusingan.

Kalau satu siri kelak memerlukan pengecualian, ia berpindah ke `program_siri_settings` mengikut corak NULL-mewarisi yang sama seperti 049.

**K2 — Syarat hanya terpakai kepada program yang MEMPUNYAI peserta dalam siri itu.**

Keperluannya berbunyi "kalau nak hantar peserta". Program yang hanya mengandungi pegawai dalam siri itu tidak disekat, dan program tanpa sebarang orang tidak pernah sampai ke sini.

**K3 — Kiraan mengikut program × siri sekolah itu sendiri.**

Seorang penguji yang didaftarkan bagi Keris Emas Siri 1 tidak memenuhi syarat Keris Emas Siri 2. Setiap pusingan berdiri sendiri, sama seperti tempat dan bayaran.

Baris yang dipadam (`is_deleted`) dan ditarik balik (`is_withdrawn`) tidak dikira.

**K4 — Mesej mesti menamakan apa yang kurang.**

Bukan "syarat tidak dipenuhi", tetapi "Keris Perak Siri 2: tiada Penguji didaftarkan". Guru yang tidak tahu apa yang kurang akan menghubungi admin, dan itulah kos sebenar mesej yang kabur.

---

## 4. Keputusan lanjut

**K5 — Hanya PEMIMPIN memenuhi syarat pemimpin.**
Penolong Pemimpin dan Pembantu tidak. Syaratnya bermaksud seorang ketua, dan menerima Penolong menjadikannya bermaksud "seorang dewasa". Sekolah yang hanya mendaftarkan Penolong akan tersekat, dan mesej ralat mesti menyatakan sebabnya dengan cukup jelas untuk mereka membetulkan peranan itu sendiri.

**K6 — Program yang gagal DILANGKAU; yang lain diteruskan.**
Laluan `dilangkau` sudah wujud dalam `create-payment-bill` dan sudah memulangkan sebab kepada UI. Sekolah membayar program yang lengkap hari ini, membetulkan yang kurang, dan menghantarnya kemudian melalui bil susulan (§13.11).

**K7 — Dua medan nombor, 0 bermakna tidak diwajibkan.**
`min_pemimpin` dan `min_penguji`, integer, lalai 0. Lalai sifar bermakna migrasi tidak mengubah tingkah laku mana-mana program sedia ada.

**K8 — Wang mengatasi syarat.**
Pencetus tidak menyekat baris yang `payment_status`-nya sudah `paid` atau `pending_review`.

Ini bukan kelonggaran; ia perlindungan terhadap corak tersekat yang sama seperti §13.12, §13.14 dan §14. Edge Function menyemak syarat sebelum bil dicipta, tetapi guru boleh memadam pemimpin itu selepas membayar dan sebelum admin mengesahkan. Tanpa pengecualian ini, wang sudah masuk dan pendaftaran tidak boleh keluar — hanya SQL boleh membaikinya.
