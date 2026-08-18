import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JadualStesen } from './stationGroupService';

interface Stesen {
  label: string;
  sekolah: { schoolId: string; sekolah: string; peserta: number; stesen: string }[];
}

/**
 * Cetakan jadual kumpulan stesen.
 *
 * Susun aturnya mengikut bentuk yang admin sudah guna di atas kertas: satu
 * tajuk per bahagian dengan jumlahnya, kemudian setiap stesen menyenaraikan
 * sekolahnya bernombor, besar ke kecil.
 *
 * Potret, bukan landskap: senarai ini panjang ke bawah, bukan lebar. Dua
 * lajur stesen sehalaman supaya satu bahagian enam stesen muat dalam tiga
 * baris tanpa memaksa pembaca membelek.
 */
export const muatTurunPdfStesen = (
  jadual: JadualStesen,
  stesen: Stesen[],
  daerahName?: string,
): void => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const TEPI = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PEMBAHAGIAN KUMPULAN STESEN', lebar / 2, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`${jadual.badgeName.toUpperCase()} ${jadual.year} — SIRI ${jadual.siri}`,
    lebar / 2, 25, { align: 'center' });

  if (daerahName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`DAERAH ${daerahName.toUpperCase()}`, lebar / 2, 31, { align: 'center' });
    doc.setTextColor(0);
  }

  // Dikumpulkan mengikut huruf bahagian, mengekalkan susunan label.
  const bahagian = new Map<string, Stesen[]>();
  stesen.forEach(s => {
    const h = s.label.slice(-1);
    bahagian.set(h, [...(bahagian.get(h) || []), s]);
  });

  let y = daerahName ? 39 : 33;
  const LEBAR_KOL = (lebar - TEPI * 2 - 6) / 2;

  bahagian.forEach((ls, huruf) => {
    const jumBahagian = ls.reduce(
      (n, s) => n + s.sekolah.reduce((m, x) => m + x.peserta, 0), 0);

    if (y > tinggi - 50) { doc.addPage(); y = 18; }

    doc.setFillColor(30, 41, 59);
    doc.rect(TEPI, y, lebar - TEPI * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255);
    doc.text(`BAHAGIAN ${huruf}  (STESEN ${ls[0]?.label} – ${ls[ls.length - 1]?.label})`,
      TEPI + 3, y + 4.8);
    doc.text(`${jumBahagian} peserta`, lebar - TEPI - 3, y + 4.8, { align: 'right' });
    doc.setTextColor(0);
    y += 11;

    // Dua lajur. Setiap stesen ialah satu jadual kecil; tinggi baris tetap,
    // jadi kedudukan lajur kanan boleh dikira tanpa merender dahulu.
    for (let i = 0; i < ls.length; i += 2) {
      const pasangan = [ls[i], ls[i + 1]].filter(Boolean) as Stesen[];
      const tinggiBlok = 8 + Math.max(...pasangan.map(s => s.sekolah.length)) * 5 + 4;

      if (y + tinggiBlok > tinggi - 12) { doc.addPage(); y = 18; }

      pasangan.forEach((s, k) => {
        const x = TEPI + k * (LEBAR_KOL + 6);
        const bil = s.sekolah.reduce((n, v) => n + v.peserta, 0);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(`STESEN ${s.label}`, x, y);
        doc.text(`${bil} peserta`, x + LEBAR_KOL, y, { align: 'right' });
        doc.setDrawColor(210);
        doc.line(x, y + 1.5, x + LEBAR_KOL, y + 1.5);

        autoTable(doc, {
          startY: y + 3,
          margin: { left: x },
          tableWidth: LEBAR_KOL,
          theme: 'plain',
          styles: { fontSize: 8, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
          columnStyles: {
            0: { cellWidth: 6, textColor: 130 },
            1: { cellWidth: LEBAR_KOL - 16 },
            2: { cellWidth: 10, halign: 'right', fontStyle: 'bold' },
          },
          body: s.sekolah.map((v, n) => [String(n + 1), v.sekolah, String(v.peserta)]),
        });
      });

      y += tinggiBlok;
    }
    y += 3;
  });

  const jum = stesen.reduce((n, s) => n + s.sekolah.reduce((m, x) => m + x.peserta, 0), 0);
  const saiz = stesen.map(s => s.sekolah.reduce((n, x) => n + x.peserta, 0));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `${jum} peserta · ${jadual.sekolah.length} sekolah · ${stesen.length} stesen · `
    + `julat ${Math.min(...saiz)}–${Math.max(...saiz)} · `
    + `dijana ${new Date(jadual.createdAt).toLocaleDateString('ms-MY')}`,
    TEPI, tinggi - 8);

  doc.save(`Kumpulan-Stesen-${jadual.badgeName.replace(/\s+/g, '-')}-S${jadual.siri}-${jadual.year}.pdf`);
};

interface StesenPenguji {
  label: string;
  nama: string;
  penguji: { nama: string; sekolah: string }[];
}

/**
 * Cetakan jadual penguji.
 *
 * Berbeza daripada cetakan peserta: ini borang kerja, bukan senarai rujukan.
 * Lajur KEHADIRAN dan CATATAN sengaja dibiarkan kosong dengan ruang yang cukup
 * untuk ditulis tangan pada hari ujian.
 *
 * Satu jadual per stesen, dengan nama ujian pada tajuknya. Potret, satu lajur
 * — barisnya perlu lebar kerana nama penguji dan nama sekolah kedua-duanya
 * panjang, dan dua lajur akan memaksa keduanya terpotong.
 */
export const muatTurunPdfPenguji = (
  jadual: JadualStesen,
  stesen: StesenPenguji[],
  daerahName?: string,
  nota?: string[],
): void => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const TEPI = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('JADUAL PENGUJI MENGIKUT STESEN', lebar / 2, 18, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`${jadual.badgeName.toUpperCase()} ${jadual.year} — SIRI ${jadual.siri}`,
    lebar / 2, 25, { align: 'center' });
  if (daerahName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`DAERAH ${daerahName.toUpperCase()}`, lebar / 2, 31, { align: 'center' });
    doc.setTextColor(0);
  }

  const bahagian = new Map<string, StesenPenguji[]>();
  stesen.forEach(s => {
    const h = s.label.slice(-1);
    bahagian.set(h, [...(bahagian.get(h) || []), s]);
  });

  let y = daerahName ? 39 : 33;

  bahagian.forEach((ls, huruf) => {
    if (y > tinggi - 45) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`BAHAGIAN ${huruf}  (STESEN ${ls[0]?.label} – ${ls[ls.length - 1]?.label})`, TEPI, y);
    y += 5;

    ls.forEach(s => {
      // 12mm cukup untuk satu baris tulisan tangan setiap penguji, ditambah
      // tajuk. Kalau tidak muat, mulakan halaman baharu — memecahkan satu
      // stesen antara dua halaman menjadikan borang itu sukar digunakan.
      const perlu = 12 + Math.max(1, s.penguji.length) * 7;
      if (y + perlu > tinggi - 14) { doc.addPage(); y = 18; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`STESEN ${s.label}${s.nama ? ` — ${s.nama.toUpperCase()}` : ''}`, TEPI, y);

      autoTable(doc, {
        startY: y + 2,
        margin: { left: TEPI, right: TEPI },
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5, halign: 'left' },
        styles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 7 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 62 },
          2: { cellWidth: 52 },
          3: { cellWidth: 25 },   // KEHADIRAN — kosong, diisi tangan
          4: { cellWidth: 33 },   // CATATAN   — kosong, diisi tangan
        },
        head: [['BIL', 'PEMIMPIN (PENGUJI)', 'SEKOLAH', 'KEHADIRAN', 'CATATAN']],
        body: s.penguji.length
          ? s.penguji.map((p, i) => [String(i + 1), p.nama, p.sekolah, '', ''])
          : [['', 'Tiada penguji ditempatkan', '', '', '']],
      });

      y = (doc as any).lastAutoTable.finalY + 5;
    });
    y += 2;
  });

  const baris = nota && nota.length ? nota : [
    'Taklimat penguji: 8:45 pagi pada hari pengujian di Dewan Utama.',
    'Bahan dan modul disediakan.',
    'Sarapan pagi dan makan tengah hari disediakan.',
  ];
  if (y + baris.length * 4.5 + 10 > tinggi - 12) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CATATAN:', TEPI, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  baris.forEach((t, i) => doc.text(`•  ${t}`, TEPI + 3, y + 9.5 + i * 4.5));

  doc.save(`Jadual-Penguji-${jadual.badgeName.replace(/\s+/g, '-')}-S${jadual.siri}-${jadual.year}.pdf`);
};
