import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JadualAmali, PesertaAmali, tajukKumpulan, isPpki } from './practicalGroupService';

export interface KumpulanAmali {
  nombor: number;
  tajuk: string;
  ahli: PesertaAmali[];
}

/**
 * Borang kumpulan ujian amali (ikatan).
 *
 * Ini borang KERJA, bukan senarai rujukan — penguji memegangnya di padang dan
 * menanda pada hari ujian. Kerana itu lajur SERAYA, SILANG dan TUNGKU sengaja
 * dibiarkan kosong dengan petak yang cukup besar untuk ditanda pen, dan setiap
 * baris diberi tinggi tulisan tangan.
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
  doc.text('Tanda pada petak ikatan yang berjaya diikat oleh peserta.',
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

    const lajurCampur = {
      0: { cellWidth: 10, halign: 'center' as const },
      1: { cellWidth: GUNA - 10 - 40 - 16 * 3 - 22 },
      2: { cellWidth: 40, fontSize: 7 },
      3: { cellWidth: 16 },
      4: { cellWidth: 16 },
      5: { cellWidth: 16 },
      6: { cellWidth: 22 },
    };
    const lajurTulen = {
      0: { cellWidth: 10, halign: 'center' as const },
      1: { cellWidth: GUNA - 10 - 18 * 3 - 36 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 18 },
      5: { cellWidth: 36 },
    };

    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: TEPI, right: TEPI },
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 7, halign: 'center', valign: 'middle' },
      styles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 7.2, valign: 'middle' },
      columnStyles: campur ? lajurCampur : lajurTulen,
      head: [campur
        ? ['BIL', 'NAMA PESERTA', 'SEKOLAH', 'SERAYA', 'SILANG', 'TUNGKU', 'CATATAN']
        : ['BIL', 'NAMA PESERTA', 'SERAYA', 'SILANG', 'TUNGKU', 'CATATAN']],
      body: k.ahli.length
        ? k.ahli.map((a, i) => campur
            ? [String(i + 1), a.nama, a.sekolah, '', '', '', '']
            : [String(i + 1), a.nama, '', '', '', ''])
        : [campur ? ['', 'Tiada peserta', '', '', '', '', ''] : ['', 'Tiada peserta', '', '', '', '']],
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  });

  const baris = nota && nota.length ? nota : [
    'Setiap peserta diuji tiga ikatan: Seraya, Silang dan Tungku.',
    'Tanda pada petak ikatan yang berjaya; biarkan kosong jika gagal.',
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
