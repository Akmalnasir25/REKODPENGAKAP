# Senarai scan: buka kepada semua tarikh, bukan hari ini sahaja

Ditulis 21 Ogos 2026. Lanjutan daripada
`rancangan-padam-kehadiran-dari-statistik.md`.

## Apa yang masih tersekat

Senarai rekod imbasan di panel admin menapis pada satu baris:

```js
const todayStr = new Date().toDateString();
const todayRecords = attendanceRecords.filter(r => new Date(r.verified_at).toDateString() === todayStr);
```

Selepas tengah malam, imbasan semalam lenyap dari senarai itu bersama butang
padamnya. Perkhemahan berjalan beberapa hari; silap yang disedari pagi esok
adalah perkara biasa, bukan kes tepi.

Padam melalui lencana hijau di Statistik memang sudah meliputi tarikh lampau
— `getAttendanceVerifications` mengambil SETAHUN dan penapisnya ialah siri,
bukan tarikh. Tetapi laluan itu menuntut petugas tahu sekolah mana yang
tersilap. Bila yang diingati hanyalah "ada satu salah semalam", senarai
kronologi ialah tempat yang betul untuk mencarinya — dan senarai itulah yang
tertutup.

## Keputusan

Senarai menjadi **sejarah imbasan**, bukan log hari ini.

- Dua mod: **Hari Ini** (kekal lalai — itu yang dipandang sepanjang hari di
  meja pendaftaran) dan **Semua**.
- Rekod dikumpulkan mengikut tarikh dengan tajuk kecil, supaya "semalam"
  benar-benar kelihatan sebagai semalam dan bukan sekadar cap masa yang
  perlu dibaca satu per satu.
- Kotak carian pada nama sekolah, kod sekolah dan nama program. Senarai
  seminggu perkhemahan terlalu panjang untuk diimbas dengan mata.
- Dialog pengesahan padam kini menyebut **tarikh** dan **siri**. Memadam
  rekod lampau lebih berisiko daripada membatalkan imbasan yang baru
  dibuat sepuluh saat lalu, jadi dialognya mesti menyatakan apa sebenarnya
  yang akan hilang.

Tiada pertanyaan baharu diperlukan: `getAttendanceVerifications(tahun, skop)`
sudah memulangkan setahun penuh. Yang dibuang hanyalah penapis tarikh di
lapisan paparan.

## Satu komponen, bukan dua salinan

Blok ini wujud dua kali — Panel Daerah dan Panel Negeri — hampir baris demi
baris, berbeza hanya pada satu ruangan kod daerah. Itulah keadaan yang sama
yang menyebabkan `StatistikKehadiranProgram` diasingkan dahulu: setiap pepijat
perlu dibetulkan dua kali dan satu daripadanya pasti terlepas.

Diasingkan ke `components/ui/SenaraiScanKehadiran.tsx`. Perbezaan daerah
dikawal oleh prop `tunjukDaerah`, sama seperti komponen statistik.

## Tidak disentuh

Skema, RLS, API, dan padam melalui lencana di Statistik. `deleteAttendanceVerification`
digunakan seperti sedia ada.
