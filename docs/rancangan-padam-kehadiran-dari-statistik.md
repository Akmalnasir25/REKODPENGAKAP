# Padam kehadiran dari skrin statistik

Ditulis 21 Ogos 2026, semasa perkhemahan berjalan. Lanjutan daripada
`rancangan-baiki-statistik-kehadiran-kosong.md`.

## Keupayaan ini sudah wujud — ia cuma tidak berada di tempat kejadian

Semuanya sudah siap kecuali satu perkara:

- `attendance_delete` (migrasi 003) — RLS sudah benarkan admin memadam
- `deleteAttendanceVerification(id)` — API sudah ada
- `handleDeleteAttendance(record)` — pengendali sudah ada di kedua-dua panel

Butang padamnya hanya ada di **"Senarai Scan Hari Ini"**, dan itu memberi dua
sekatan yang tidak disengajakan:

1. **Hanya hari ini.** Senarai itu menapis `verified_at` kepada
   `new Date().toDateString()`. Silap imbas semalam — Siri 1 diimbas sedangkan
   sekolah itu datang untuk Siri 2 — tiada jalan langsung untuk membetulkannya
   melalui UI.
2. **Bukan di tempat silap itu dilihat.** Silap tidak dijumpai dengan membaca
   senarai kronologi imbasan. Ia dijumpai di Statistik: "kenapa sekolah ini
   hijau untuk Keris Emas, ia belum sampai pun." Pada saat itu petugas
   terpaksa turun ke senarai lain, cari semula baris yang sama, dan berharap
   ia diimbas hari ini.

## Keputusan

Letakkan padam pada **lencana program hijau** dalam setiap baris sekolah di
Statistik Kehadiran. Itulah objek yang menyatakan "sudah hadir", jadi itulah
objek yang patut boleh ditarik balik.

Sebab lencana dan bukan baris sekolah: satu sekolah boleh ada tiga program
dalam satu siri dan hanya satu daripadanya tersilap. Memadam pada aras baris
akan memaksa petugas mengimbas semula dua program yang memang betul.

Kekangan yang dihormati:

- **Siri yang sedang dipilih sahaja.** Lencana itu hidup di dalam satu siri,
  jadi padamnya juga. Tiada risiko tersasar ke siri jiran.
- **Semua baris bagi kunci itu.** Kunci ialah sekolah + program + siri. Jika
  imbasan berganda pernah mencipta dua baris, kedua-duanya dipadam — kalau
  tidak, lencana kekal hijau selepas "berjaya dipadam", yang lebih buruk
  daripada tidak memadam langsung.
- **Pengesahan menyebut nama.** Dialog menyatakan sekolah, program dan siri
  secara penuh, kerana kesan sebenarnya ialah "sekolah ini kembali menjadi
  belum hadir".

Selepas padam, QR sekolah itu boleh discan semula untuk siri tersebut —
`kehadiran_sekolah_siri` akan sekali lagi melaporkan program itu belum
disahkan, jadi laluan pemulihan ialah imbas semula, bukan sunting manual.

## Perubahan

1. `StatistikKehadiranProgram` menyimpan **rekod** bagi setiap kunci
   sekolah+program, bukan hanya jumlah peserta. Tanpa `id`, tiada apa yang
   boleh dipadam.
2. Prop baharu `onPadam?(rekodIds, keterangan)`. Opsyenal: tanpa ia, lencana
   kekal label statik seperti sekarang.
3. Lencana hijau menjadi butang bila `onPadam` diberi. Yang kelabu (belum
   disahkan) kekal bukan butang — tiada apa untuk dipadam.
4. Panel Daerah dan Panel Negeri melaksanakan `onPadam`: sahkan, padam setiap
   id, muat semula. Menggunakan `deleteAttendanceVerification` sedia ada.
5. Keadaan sibuk per-lencana supaya tekan dua kali tidak menghantar dua
   permintaan.

## Tidak disentuh

Skema, RLS, API. Butang di "Senarai Scan Hari Ini" kekal — ia berguna untuk
pembatalan segera sebaik tersilap imbas, tanpa perlu mencari sekolah itu
dalam senarai panjang.
