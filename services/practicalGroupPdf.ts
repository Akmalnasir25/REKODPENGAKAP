import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JadualAmali, PesertaAmali, tajukKumpulan, isPpki, bersihkanLajur } from './practicalGroupService';

export interface KumpulanAmali {
  nombor: number;
  tajuk: string;
  ahli: PesertaAmali[];
}

/**
 * Borang kumpulan ujian amali (ikatan).
 *
 * Ini borang KERJA, bukan senarai rujukan — penguji memegangnya di padang dan
 * menanda pada hari ujian. Kerana itu petak tanda sengaja dibiarkan kosong
 * dengan saiz yang cukup untuk ditanda pen, dan setiap baris diberi tinggi
 * tulisan tangan.
 *
 * BIL dan NAMA PESERTA tetap. Lajur tanda datang daripada tetapan larian
 * (migrasi 070) — satu hingga enam, dinamakan oleh admin — dan CATATAN boleh
 * dimatikan. Lebar dikira daripada bilangan lajur, bukan ditetapkan keras.
 *
 * Satu kumpulan tidak pernah dipecahkan antara dua halaman. Borang yang
 * separuh muka surat pertama dan separuh muka surat kedua tidak boleh
 * dipegang oleh seorang penguji di padang.
 *
 * Lajur SEKOLAH muncul hanya pada kumpulan CAMPUR. Untuk kumpulan satu
 * sekolah, tajuk kumpulan sudah membawanya dan lajur itu hanya merampas lebar
 * daripada nama yang panjang.
 */
export const muatTurunPdfAmali = (
  jadual: JadualAmali,
  kumpulan: KumpulanAmali[],
  daerahName?: string,
  nota?: string[],
): void => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const TEPI = 14;
  const GUNA = lebar - TEPI * 2;

  // Lajur datang daripada larian tersimpan (migrasi 070). bersihkanLajur
  // melindungi cetakan daripada larian lama yang tiada nilai tersimpan, dan
  // daripada label kosong yang akan mencetak petak tanpa kepala.
  const lajurTanda = bersihkanLajur(jadual.lajurTanda);
  const gunaCatatan = jadual.gunaCatatan !== false;

  const jumPeserta = kumpulan.reduce((n, k) => n + k.ahli.length, 0);
  const bilCampur = kumpulan.filter(k => k.tajuk.startsWith('CAMPUR')).length;
  const bilPpki = kumpulan.filter(k => k.ahli.length > 0 && k.ahli.every(a => isPpki(a.unit))).length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('JADUAL KUMPULAN IKATAN', lebar / 2, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.text(
    `${jadual.badgeName.toUpperCase()} ${jadual.year} — SIRI ${jadual.siri}`
    + (daerahName ? ` — DAERAH ${daerahName.toUpperCase()}` : ''),
    lebar / 2, 25, { align: 'center' });

  // Kiraan yang admin sebenarnya perlukan untuk merancang penguji dan bahan:
  // berapa kumpulan, berapa yang bercampur sekolah, berapa PPKI.
  const pecahan = [
    `biasa ${jadual.saizKumpulan}/kumpulan`,
    bilCampur ? `${bilCampur} CAMPUR` : null,
    bilPpki ? `${bilPpki} PPKI` : null,
  ].filter(Boolean).join('; ');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`${jumPeserta} peserta  •  ${kumpulan.length} kumpulan  (${pecahan})`,
    lebar / 2, 31, { align: 'center' });
  doc.setFontSize(8);
  doc.text('Tanda pada petak yang berjaya dilakukan oleh peserta.',
    lebar / 2, 36, { align: 'center' });
  doc.setTextColor(0);

  let y = 43;

  kumpulan.forEach(k => {
    const campur = k.tajuk.startsWith('CAMPUR');

    // Tinggi diramal sebelum merender supaya keputusan halaman baharu dibuat
    // sebelum jadual dilukis, bukan selepas ia sudah terpotong.
    const perlu = 7 + 7 + Math.max(1, k.ahli.length) * 7.6 + 5;
    if (y + perlu > tinggi - 12) { doc.addPage(); y = 18; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`KUMPULAN ${k.nombor} — ${k.tajuk.toUpperCase()}`, TEPI, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(`${k.ahli.length} orang`, lebar - TEPI, y, { align: 'right' });
    doc.setTextColor(0);

    // Lebar dikira, bukan ditetapkan keras: bilangan lajur tanda kini datang
    // daripada tetapan admin (1..6), jadi tiada satu susunan tetap yang muat
    // untuk semuanya. NAMA PESERTA mengambil apa yang tinggal — ia satu-satunya
    // lajur yang isinya benar-benar berubah panjang.
    const W_BIL = 10;
    const W_SEKOLAH = campur ? 38 : 0;
    const W_CATATAN = gunaCatatan ? (campur ? 22 : 30) : 0;
    // Petak tanda: cukup lebar untuk ditanda pen, tetapi mengecil bila lajur
    // bertambah supaya nama tidak dihimpit sampai terpotong.
    const ruangTanda = GUNA - W_BIL - W_SEKOLAH - W_CATATAN - 46;
    const W_TANDA = Math.max(11, Math.min(20, ruangTanda / lajurTanda.length));
    const W_NAMA = GUNA - W_BIL - W_SEKOLAH - W_CATATAN - W_TANDA * lajurTanda.length;

    const gaya: Record<number, any> = { 0: { cellWidth: W_BIL, halign: 'center' } };
    let kol = 1;
    gaya[kol++] = { cellWidth: W_NAMA };
    if (campur) gaya[kol++] = { cellWidth: W_SEKOLAH, fontSize: 7 };
    lajurTanda.forEach(() => { gaya[kol++] = { cellWidth: W_TANDA }; });
    if (gunaCatatan) gaya[kol++] = { cellWidth: W_CATATAN };

    const kepala = [
      'BIL', 'NAMA PESERTA',
      ...(campur ? ['SEKOLAH'] : []),
      ...lajurTanda.map(x => x.toUpperCase()),
      ...(gunaCatatan ? ['CATATAN'] : []),
    ];
    // Petak tanda dan CATATAN sengaja kosong — itu kerja penguji di padang.
    const kosong = Array(lajurTanda.length + (gunaCatatan ? 1 : 0)).fill('');

    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: TEPI, right: TEPI },
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        // Kepala mengecil bersama lajurnya supaya label panjang seperti
        // "KEMAS DIRI" tidak terpotong pada enam lajur.
        fontSize: lajurTanda.length >= 5 ? 6 : 7,
        halign: 'center', valign: 'middle',
      },
      styles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 7.2, valign: 'middle' },
      columnStyles: gaya,
      head: [kepala],
      body: k.ahli.length
        ? k.ahli.map((a, i) => [
            String(i + 1), a.nama, ...(campur ? [a.sekolah] : []), ...kosong,
          ])
        : [['', 'Tiada peserta', ...(campur ? [''] : []), ...kosong]],
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  });

  // Nota lalai menamakan lajur SEBENAR. Menyenaraikan Seraya/Silang/Tungku
  // pada borang yang mengujinya sesuatu yang lain akan mengarahkan penguji
  // membuat ujian yang salah.
  const senarai = lajurTanda.length === 1
    ? lajurTanda[0]
    : `${lajurTanda.slice(0, -1).join(', ')} dan ${lajurTanda[lajurTanda.length - 1]}`;
  const baris = nota && nota.length ? nota : [
    `Setiap peserta diuji ${lajurTanda.length} perkara: ${senarai}.`,
    'Tanda pada petak yang berjaya; biarkan kosong jika gagal.',
    'Serahkan borang kepada urus setia sebaik ujian kumpulan selesai.',
  ];
  if (y + baris.length * 4.5 + 12 > tinggi - 12) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CATATAN:', TEPI, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  baris.forEach((t, i) => doc.text(`•  ${t}`, TEPI + 3, y + 9.5 + i * 4.5));

  // Cap masa pada setiap halaman: borang ini diedarkan sebagai helaian
  // berasingan kepada penguji berlainan, jadi setiap helaian perlu mengaku
  // versi mana ia.
  const bilHalaman = doc.getNumberOfPages();
  doc.setFontSize(7);
  doc.setTextColor(130);
  for (let h = 1; h <= bilHalaman; h++) {
    doc.setPage(h);
    doc.text(
      `${jadual.badgeName} S${jadual.siri} ${jadual.year} · dijana `
      + `${new Date(jadual.createdAt).toLocaleDateString('ms-MY')}`,
      TEPI, tinggi - 8);
    doc.text(`Halaman ${h}/${bilHalaman}`, lebar - TEPI, tinggi - 8, { align: 'right' });
  }

  doc.save(`Kumpulan-Ikatan-${jadual.badgeName.replace(/\s+/g, '-')}-S${jadual.siri}-${jadual.year}.pdf`);
};

/** Bina senarai kumpulan bernombor daripada baris ahli yang tersimpan. */
export const susunKumpulan = (jadual: JadualAmali | null): KumpulanAmali[] => {
  if (!jadual) return [];
  const peta = new Map<number, PesertaAmali[]>();
  jadual.ahli.forEach(a => peta.set(a.kumpulan, [...(peta.get(a.kumpulan) || []), a]));
  return Array.from(peta.keys()).sort((a, b) => a - b).map(n => {
    const ahli = (peta.get(n) || []).sort(
      (a, b) => a.sekolah.localeCompare(b.sekolah) || a.nama.localeCompare(b.nama));
    return { nombor: n, tajuk: tajukKumpulan(ahli), ahli };
  });
};
