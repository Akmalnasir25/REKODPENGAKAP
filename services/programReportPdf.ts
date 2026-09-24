import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SubmissionData } from '../types';

// ============================================================
// LAPORAN PROGRAM — borang rasmi 7 perkara diikuti jadual
// "Butiran Penyertaan" (pecahan sekolah x jantina x bangsa).
// Enam medan pertama diisi oleh admin; perkara 7.0 dikira
// terus daripada rekod pendaftaran dalam tapisan semasa.
// ============================================================

export interface ProgramReportHeader {
  namaProgram: string;
  anjuran: string;
  tarikh: string;
  tempat: string;
  mod: string;
  peringkat: string;
}

export interface ProgramReportRow {
  schoolCode: string;
  schoolName: string;
  daerah: string;
  lelaki: number;
  perempuan: number;
  melayu: number;
  cina: number;
  india: number;
  lain: number;
  jumlah: number;
}

export const MOD_PELAKSANAAN = ['Bersemuka', 'Dalam Talian', 'Hibrid'] as const;

export const PERINGKAT_PENYERTAAN = [
  'Peringkat Sekolah',
  'Peringkat Daerah',
  'Peringkat Negeri',
  'Peringkat Kebangsaan',
  'Peringkat Antarabangsa',
] as const;

/**
 * Bangsa direkod dengan huruf besar/kecil yang tidak seragam dan senarainya
 * lebih panjang daripada laporan ini (Bumiputera Sabah, Orang Asli, dsb).
 * Laporan hanya ada empat lajur, jadi apa-apa selain tiga yang pertama
 * jatuh ke "Lain-Lain" — termasuk bangsa yang belum diisi.
 */
const bangsaOf = (race?: string): 'melayu' | 'cina' | 'india' | 'lain' => {
  const r = (race || '').trim().toUpperCase();
  if (r === 'MELAYU') return 'melayu';
  if (r === 'CINA') return 'cina';
  if (r === 'INDIA') return 'india';
  return 'lain';
};

// Jantina disimpan sebagai 'Lelaki'/'Perempuan', tetapi import pukal lama
// boleh meninggalkan 'L'/'P' sahaja.
const jantinaOf = (gender?: string): 'lelaki' | 'perempuan' | null => {
  const g = (gender || '').trim().toUpperCase();
  if (g.startsWith('L')) return 'lelaki';
  if (g.startsWith('P')) return 'perempuan';
  return null;
};

/**
 * Kumpulkan rekod ikut sekolah. `jumlah` ialah bilangan rekod sebenar, bukan
 * hasil tambah lajur jantina — rekod tanpa jantina tetap dikira di sini
 * supaya jumlah besar laporan sepadan dengan jumlah pendaftaran.
 */
export const buildProgramReportRows = (data: SubmissionData[]): ProgramReportRow[] => {
  const map = new Map<string, ProgramReportRow>();

  for (const rec of data) {
    if (rec.isWithdrawn) continue;
    const schoolName = (rec.school || '').trim();
    const schoolCode = (rec.schoolCode || '').trim();
    const key = `${schoolCode}||${schoolName}`;

    let row = map.get(key);
    if (!row) {
      row = {
        schoolCode,
        schoolName,
        daerah: (rec.daerahCode || rec.daerahName || '').trim(),
        lelaki: 0, perempuan: 0,
        melayu: 0, cina: 0, india: 0, lain: 0,
        jumlah: 0,
      };
      map.set(key, row);
    }

    const jantina = jantinaOf(rec.gender);
    if (jantina) row[jantina] += 1;
    row[bangsaOf(rec.race)] += 1;
    row.jumlah += 1;
  }

  return Array.from(map.values()).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
};

export const sumProgramReportRows = (
  rows: ProgramReportRow[],
): Omit<ProgramReportRow, 'schoolCode' | 'schoolName' | 'daerah'> =>
  rows.reduce(
    (acc, r) => ({
      lelaki: acc.lelaki + r.lelaki,
      perempuan: acc.perempuan + r.perempuan,
      melayu: acc.melayu + r.melayu,
      cina: acc.cina + r.cina,
      india: acc.india + r.india,
      lain: acc.lain + r.lain,
      jumlah: acc.jumlah + r.jumlah,
    }),
    { lelaki: 0, perempuan: 0, melayu: 0, cina: 0, india: 0, lain: 0, jumlah: 0 },
  );

const PERKARA: Array<{ no: string; label: string; key: keyof ProgramReportHeader }> = [
  { no: '1.0', label: 'Nama Program', key: 'namaProgram' },
  { no: '2.0', label: 'Anjuran', key: 'anjuran' },
  { no: '3.0', label: 'Tarikh Pelaksanaan', key: 'tarikh' },
  { no: '4.0', label: 'Tempat Pelaksanaan', key: 'tempat' },
  { no: '5.0', label: 'Mod Pelaksanaan', key: 'mod' },
  { no: '6.0', label: 'Peringkat Penyertaan', key: 'peringkat' },
];

export const generateProgramReport = (
  data: SubmissionData[],
  header: ProgramReportHeader,
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const VALUE_X = 26; // lajur teks selepas nombor perkara

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN PROGRAM', pageWidth / 2, 16, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 28;
  for (const p of PERKARA) {
    doc.text(p.no, MARGIN, y);
    doc.text(`${p.label} : ${(header[p.key] || '').trim()}`, VALUE_X, y);
    y += 7.5;
  }

  doc.text('7.0', MARGIN, y);
  doc.text('Butiran Penyertaan :', VALUE_X, y);

  const rows = buildProgramReportRows(data);
  const total = sumProgramReportRows(rows);

  autoTable(doc, {
    startY: y + 4,
    margin: { left: MARGIN, right: MARGIN, bottom: 14 },
    head: [
      [
        { content: 'Bil', rowSpan: 2 },
        { content: 'Kod Sekolah', rowSpan: 2 },
        { content: 'Sekolah', rowSpan: 2 },
        { content: 'Daerah', rowSpan: 2 },
        { content: 'Jantina', colSpan: 2 },
        { content: 'Bangsa', colSpan: 4 },
        { content: 'Jumlah', rowSpan: 2 },
      ],
      ['L', 'P', 'Melayu', 'Cina', 'India', 'Lain-Lain'],
    ],
    body: rows.map((r, i) => [
      (i + 1).toString(),
      r.schoolCode,
      r.schoolName,
      r.daerah,
      r.lelaki, r.perempuan,
      r.melayu, r.cina, r.india, r.lain,
      r.jumlah,
    ]),
    foot: [[
      { content: 'JUMLAH', colSpan: 4, styles: { halign: 'right' as const } },
      total.lelaki, total.perempuan,
      total.melayu, total.cina, total.india, total.lain,
      total.jumlah,
    ]],
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    footStyles: {
      fillColor: [226, 232, 240], // slate-200
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 48 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 10, halign: 'center' },
      5: { cellWidth: 10, halign: 'center' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 16, halign: 'center' },
      10: { cellWidth: 14, halign: 'center' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
  });

  // Footer dilukis selepas jadual siap supaya jumlah halaman betul pada
  // setiap muka surat, bukan hanya yang terakhir.
  const pageCount = doc.getNumberOfPages();
  const dijana = new Date().toLocaleString('ms-MY');
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(128);
    doc.text(
      `Dijana pada: ${dijana} | Halaman ${i} / ${pageCount}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' },
    );
    doc.setTextColor(0);
  }

  return doc;
};

/** `Laporan_Program_Keris_Emas_2026.pdf` */
export const programReportFilename = (namaProgram: string, year: number): string => {
  const safe = (namaProgram || 'Program').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  return `Laporan_Program_${safe || 'Program'}_${year}.pdf`;
};
