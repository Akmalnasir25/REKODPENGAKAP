import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SubmissionData } from '../types';

interface PDFReportOptions {
  title?: string;
  subtitle?: string;
  year?: number;
  badge?: string;
  school?: string;
  daerah?: string;
  negeri?: string;
  orientation?: 'portrait' | 'landscape';
  logoUrl?: string;
}

/**
 * Generate PDF report for participant data
 */
export const generateParticipantReport = (
  data: SubmissionData[],
  options: PDFReportOptions = {}
) => {
  const {
    title = 'SENARAI PENDAFTARAN PENGAKAP',
    subtitle = '',
    year = new Date().getFullYear(),
    badge,
    school,
    daerah,
    negeri,
    orientation = 'landscape',
    logoUrl
  } = options;

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  let headerStartY = 15;
  if (logoUrl) {
    try {
      doc.addImage(logoUrl, 'PNG', 14, 8, 20, 20);
      headerStartY = 18;
    } catch (e) {
      // If logo fails to load, continue without it
    }
  }

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, headerStartY, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`TAHUN ${year}`, pageWidth / 2, headerStartY + 7, { align: 'center' });

  // Subtitle info
  let yPos = headerStartY + 13;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const infoLines: string[] = [];
  if (negeri) infoLines.push(`Negeri: ${negeri}`);
  if (daerah) infoLines.push(`Daerah: ${daerah}`);
  if (badge) infoLines.push(`Program: ${badge}`);
  if (school) infoLines.push(`Sekolah: ${school}`);
  if (subtitle) infoLines.push(subtitle);

  if (infoLines.length > 0) {
    doc.text(infoLines.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
  }

  // Group by school then sort by role priority then name
  const rolePriority = (role?: string) => {
    const r = (role || 'PESERTA').toUpperCase();
    if (r === 'PESERTA' || r === 'PENERIMA RAMBU') return 1;
    if (r === 'PEMIMPIN') return 2;
    if (r.includes('PENOLONG')) return 3;
    if (r === 'PEMBANTU') return 4;
    if (r === 'PENGUJI') return 5;
    return 6;
  };

  const grouped: Record<string, SubmissionData[]> = {};
  for (const item of data) {
    const key = (item.school || 'Tidak Dinyatakan') + '||' + (item.schoolCode || '');
    (grouped[key] = grouped[key] || []).push(item);
  }
  const sortedSchoolKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  // Build flat tableData with section header rows for every school
  const tableData: any[] = [];
  let runningNo = 0;
  for (const key of sortedSchoolKeys) {
    const [schoolName, schoolCode] = key.split('||');
    const items = [...grouped[key]].sort((a, b) => {
      const ra = rolePriority(a.role), rb = rolePriority(b.role);
      if (ra !== rb) return ra - rb;
      return (a.student || '').localeCompare(b.student || '');
    });
    // Section header row
    tableData.push([{
      content: `${schoolName}${schoolCode ? ` (${schoolCode})` : ''} — ${items.length} orang`,
      colSpan: 11,
      styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'left', fontSize: 8 }
    }]);
    for (const item of items) {
      runningNo++;
      tableData.push([
        runningNo.toString(),
        item.student || '',
        item.icNumber || '-',
        item.gender || '',
        item.race || '',
        schoolName,
        schoolCode || '',
        (item.programGabung && item.programGabung.length > 1)
          ? item.programGabung.join(', ')
          : (item.badge || ''),
        item.role || 'PESERTA',
        item.category || '-',
        item.id || '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: yPos + 2,
    head: [[
      'No.', 'Nama', 'No. KP', 'Jantina', 'Kaum', 'Sekolah', 'Kod', 'Program', 'Peranan', 'Kategori', 'No. Ahli'
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 18 },
      5: { cellWidth: 40 },
      6: { cellWidth: 15, halign: 'center' },
      7: { cellWidth: 25 },
      8: { cellWidth: 22, halign: 'center' },
      9: { cellWidth: 18, halign: 'center' },
      10: { cellWidth: 20, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    didDrawPage: (data) => {
      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128);
      doc.text(
        `Dijana pada: ${new Date().toLocaleString('ms-MY')} | Halaman ${data.pageNumber} / ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
      doc.setTextColor(0);
    }
  });

  return doc;
};

/**
 * Generate summary/statistics PDF report
 */
export const generateSummaryReport = (
  data: SubmissionData[],
  options: PDFReportOptions = {}
) => {
  const {
    title = 'LAPORAN RINGKASAN PENDAFTARAN',
    year = new Date().getFullYear(),
    negeri,
    daerah,
    logoUrl
  } = options;

  // LANDSCAPE. Jadual pecahan sekolah mempunyai sembilan lajur; pada potret
  // (~182mm boleh guna) nama sekolah dan kod terpaksa membalut. Landscape
  // memberi ~269mm, cukup untuk setiap lajur berada pada satu baris.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  let headerStartY = 15;
  if (logoUrl) {
    try {
      doc.addImage(logoUrl, 'PNG', 14, 8, 20, 20);
      headerStartY = 18;
    } catch (e) {
      // If logo fails to load, continue without it
    }
  }

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, headerStartY, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`TAHUN ${year}`, pageWidth / 2, headerStartY + 7, { align: 'center' });

  if (negeri || daerah) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text([negeri, daerah].filter(Boolean).join(' - '), pageWidth / 2, headerStartY + 13, { align: 'center' });
  }

  // Statistics
  const currentYearData = data.filter(d => new Date(d.date).getFullYear() === year);
  const totalParticipants = currentYearData.filter(d => (d.role || 'PESERTA').toUpperCase() === 'PESERTA').length;
  const totalLeaders = currentYearData.filter(d => (d.role || '').toUpperCase() === 'PEMIMPIN').length;
  const totalAssistants = currentYearData.filter(d => (d.role || '').toUpperCase() === 'PENOLONG PEMIMPIN').length;
  const totalPembantu = currentYearData.filter(d => (d.role || '').toUpperCase() === 'PEMBANTU').length;
  const totalExaminers = currentYearData.filter(d => (d.role || '').toUpperCase() === 'PENGUJI').length;

  // Badge breakdown
  const badgeCount: Record<string, number> = {};
  currentYearData.forEach(d => {
    const badge = d.badge || 'Tidak Dinyatakan';
    badgeCount[badge] = (badgeCount[badge] || 0) + 1;
  });

  // School breakdown — pecahan lengkap setiap sekolah
  type SchoolStats = { name: string; code: string; peserta: number; pemimpin: number; penolong: number; pembantu: number; penguji: number; total: number; lelaki: number; perempuan: number };
  const schoolStatsMap: Record<string, SchoolStats> = {};
  currentYearData.forEach(d => {
    const school = d.school || 'Tidak Dinyatakan';
    const code = d.schoolCode || '';
    const key = school + '||' + code;
    if (!schoolStatsMap[key]) {
      schoolStatsMap[key] = { name: school, code, peserta: 0, pemimpin: 0, penolong: 0, pembantu: 0, penguji: 0, total: 0, lelaki: 0, perempuan: 0 };
    }
    const s = schoolStatsMap[key];
    s.total++;
    const role = (d.role || 'PESERTA').toUpperCase();
    const gender = (d.gender || '').toUpperCase();
    if (role === 'PENGUJI') s.penguji++;
    else if (role === 'PEMIMPIN') s.pemimpin++;
    else if (role.includes('PENOLONG')) s.penolong++;
    // Berasingan, sama seperti papan pemuka. `else` di bawah ialah baldi
    // PESERTA — mana-mana peranan yang tidak disenaraikan di sini jatuh ke
    // sana dan dikira sebagai peserta.
    else if (role === 'PEMBANTU') s.pembantu++;
    else {
      s.peserta++;
      if (gender.startsWith('L') || gender.startsWith('M')) s.lelaki++;
      else if (gender.startsWith('P') || gender.startsWith('F')) s.perempuan++;
    }
  });
  const schoolStatsList = Object.values(schoolStatsMap).sort((a, b) => a.name.localeCompare(b.name));

  // Category breakdown - termasuk peserta (ikut kategori), pemimpin, penolong, penguji
  const categoryCount: Record<string, number> = {};
  currentYearData.forEach(d => {
    const role = (d.role || 'PESERTA').toUpperCase();
    if (role === 'PEMIMPIN') {
      categoryCount['Pemimpin'] = (categoryCount['Pemimpin'] || 0) + 1;
    } else if (role.includes('PENOLONG')) {
      categoryCount['Penolong Pemimpin'] = (categoryCount['Penolong Pemimpin'] || 0) + 1;
    } else if (role === 'PEMBANTU') {
      categoryCount['Pembantu'] = (categoryCount['Pembantu'] || 0) + 1;
    } else if (role === 'PENGUJI') {
      categoryCount['Penguji'] = (categoryCount['Penguji'] || 0) + 1;
    } else if (d.category) {
      categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
    } else {
      categoryCount['Tidak Dinyatakan'] = (categoryCount['Tidak Dinyatakan'] || 0) + 1;
    }
  });

  let yPos = (negeri || daerah) ? headerStartY + 20 : headerStartY + 14;

  // TIGA JADUAL RINGKAS, BERSEBELAHAN
  //
  // Dahulunya ia bertindan menegak, setiap satu 110mm lebar sedangkan jadual
  // sekolah di bawahnya 253mm — saiz yang tidak sekata, dan jadual ketiga
  // terbelah merentas muka surat. Halaman landscape mempunyai ruang mendatar
  // yang tidak digunakan; tiga lajur 82mm menjajar tepat dengan lebar jadual
  // sekolah dan muat pada satu muka surat.
  const KOL_X = [14, 100, 186];
  const KOL_W = [82, 82, 81];
  const kepalaJadual = yPos;

  const jadualRingkas = (
    idx: number,
    tajuk: string,
    kepala: string[],
    badan: string[][],
    warna: [number, number, number],
  ) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(tajuk, KOL_X[idx], kepalaJadual);
    autoTable(doc, {
      startY: kepalaJadual + 2,
      margin: { left: KOL_X[idx] },
      tableWidth: KOL_W[idx],
      head: [kepala],
      body: badan,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: warna, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 } },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  const hujung: number[] = [];

  hujung.push(jadualRingkas(0, 'RINGKASAN KESELURUHAN', ['Kategori', 'Jumlah'], [
    ['Jumlah Peserta', totalParticipants.toString()],
    ['Jumlah Pemimpin', totalLeaders.toString()],
    ['Jumlah Penolong Pemimpin', totalAssistants.toString()],
    ['Jumlah Pembantu', totalPembantu.toString()],
    ['Jumlah Penguji', totalExaminers.toString()],
    ['JUMLAH KESELURUHAN', currentYearData.length.toString()],
  ], [15, 23, 42]));

  hujung.push(jadualRingkas(1, 'PECAHAN MENGIKUT LENCANA', ['Program', 'Bilangan'],
    Object.entries(badgeCount).sort((a, b) => b[1] - a[1]).map(([badge, count]) => [badge, count.toString()]),
    [30, 58, 138]));

  if (Object.keys(categoryCount).length > 0) {
    hujung.push(jadualRingkas(2, 'PECAHAN MENGIKUT KATEGORI', ['Kategori', 'Bilangan'],
      Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).map(([cat, count]) => [cat, count.toString()]),
      [88, 28, 135]));
  }

  // Ketiga-tiganya bermula pada Y yang sama tetapi berakhir berlainan.
  yPos = Math.max(...hujung) + 10;

  // Pecahan setiap sekolah - peserta + pemimpin dalam satu jadual
  if (schoolStatsList.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(`PECAHAN PER SEKOLAH (${schoolStatsList.length} sekolah)`, 14, yPos);
    yPos += 2;

    const grandTotal = schoolStatsList.reduce((acc, s) => ({
      peserta: acc.peserta + s.peserta,
      pemimpin: acc.pemimpin + s.pemimpin,
      penolong: acc.penolong + s.penolong,
      pembantu: acc.pembantu + s.pembantu,
      penguji: acc.penguji + s.penguji,
      lelaki: acc.lelaki + s.lelaki,
      perempuan: acc.perempuan + s.perempuan,
      total: acc.total + s.total,
    }), { peserta: 0, pemimpin: 0, penolong: 0, pembantu: 0, penguji: 0, lelaki: 0, perempuan: 0, total: 0 });

    autoTable(doc, {
      startY: yPos,
      // Pemimpin dan Penolong Pemimpin dicantum menjadi SATU lajur. Sepuluh
      // lajur memaksa pengepala membalut ("Peser/ta (L)", "Penolo/ng") dan
      // jadual terkeluar halaman. Pecahannya kekal dalam jadual Kategori di
      // atas, yang menyenaraikannya menegak tanpa had lebar.
      head: [['No.', 'Sekolah', 'Kod', 'Peserta (L)', 'Peserta (P)', 'Pemimpin/Penolong', 'Pembantu', 'Penguji', 'Jumlah']],
      body: [
        ...schoolStatsList.map((s, i) => [
          (i + 1).toString(),
          s.name,
          s.code || '-',
          s.lelaki.toString(),
          s.perempuan.toString(),
          (s.pemimpin + s.penolong).toString(),
          s.pembantu.toString(),
          s.penguji.toString(),
          s.total.toString(),
        ]),
        [
          { content: 'JUMLAH', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
          { content: grandTotal.lelaki.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.perempuan.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: (grandTotal.pemimpin + grandTotal.penolong).toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.pembantu.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.penguji.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.total.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
        ],
      ],
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      // Lebar SETIAP lajur ditetapkan. Sebelum ini hanya tiga yang pertama
      // ditetapkan (10 + 60 + 20 = 90mm) dan enam lajur selebihnya berkongsi
      // baki ~92mm pada halaman POTRET — kira-kira 15mm setiap satu, terlalu
      // sempit untuk tajuknya, jadi setiap pengepala membalut di tengah
      // perkataan. Jumlah lebar di bawah ialah 170mm daripada ~182mm yang ada.
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7, valign: 'middle' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },  // No.
        1: { cellWidth: 85 },                    // Sekolah
        2: { halign: 'center', cellWidth: 26 },  // Kod
        3: { halign: 'center', cellWidth: 20 },  // Peserta (L)
        4: { halign: 'center', cellWidth: 20 },  // Peserta (P)
        5: { halign: 'center', cellWidth: 34 },  // Pemimpin/Penolong
        6: { halign: 'center', cellWidth: 20 },  // Pembantu
        7: { halign: 'center', cellWidth: 18 },  // Penguji
        8: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },  // Jumlah
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(128);
    doc.text(
      `Dijana pada: ${new Date().toLocaleString('ms-MY')} | Halaman ${i} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  return doc;
};

/**
 * Generate combined report = Summary first, then participant list (grouped by school)
 */
export const generateCombinedReport = (
  data: SubmissionData[],
  options: PDFReportOptions = {}
) => {
  // Build summary first
  const doc = generateSummaryReport(data, options);
  // Add new page then build participant list onto same doc
  doc.addPage('a4', 'landscape');
  appendParticipantTable(doc, data, options);
  return doc;
};

/**
 * Append participant table (grouped by school) to existing doc.
 * Caller mesti panggil doc.addPage() dahulu jika perlukan halaman baru.
 */
const appendParticipantTable = (
  doc: jsPDF,
  data: SubmissionData[],
  options: PDFReportOptions = {}
) => {
  const { title = 'SENARAI PENDAFTARAN PENGAKAP', year = new Date().getFullYear(), badge, school, daerah, negeri } = options;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`TAHUN ${year}`, pageWidth / 2, 22, { align: 'center' });

  let yPos = 28;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const infoLines: string[] = [];
  if (negeri) infoLines.push(`Negeri: ${negeri}`);
  if (daerah) infoLines.push(`Daerah: ${daerah}`);
  if (badge) infoLines.push(`Program: ${badge}`);
  if (school) infoLines.push(`Sekolah: ${school}`);
  if (infoLines.length > 0) {
    doc.text(infoLines.join('  |  '), pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
  }

  const rolePriority = (role?: string) => {
    const r = (role || 'PESERTA').toUpperCase();
    if (r === 'PESERTA' || r === 'PENERIMA RAMBU') return 1;
    if (r === 'PEMIMPIN') return 2;
    if (r.includes('PENOLONG')) return 3;
    if (r === 'PEMBANTU') return 4;
    if (r === 'PENGUJI') return 5;
    return 6;
  };

  const grouped: Record<string, SubmissionData[]> = {};
  for (const item of data) {
    const key = (item.school || 'Tidak Dinyatakan') + '||' + (item.schoolCode || '');
    (grouped[key] = grouped[key] || []).push(item);
  }
  const sortedSchoolKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  const tableData: any[] = [];
  let runningNo = 0;
  for (const key of sortedSchoolKeys) {
    const [schoolName, schoolCode] = key.split('||');
    const items = [...grouped[key]].sort((a, b) => {
      const ra = rolePriority(a.role), rb = rolePriority(b.role);
      if (ra !== rb) return ra - rb;
      return (a.student || '').localeCompare(b.student || '');
    });
    tableData.push([{
      content: `${schoolName}${schoolCode ? ` (${schoolCode})` : ''} — ${items.length} orang`,
      colSpan: 11,
      styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'left', fontSize: 8 }
    }]);
    for (const item of items) {
      runningNo++;
      tableData.push([
        runningNo.toString(),
        item.student || '',
        item.icNumber || '-',
        item.gender || '',
        item.race || '',
        schoolName,
        schoolCode || '',
        (item.programGabung && item.programGabung.length > 1)
          ? item.programGabung.join(', ')
          : (item.badge || ''),
        item.role || 'PESERTA',
        item.category || '-',
        item.id || '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: yPos + 2,
    head: [[
      'No.', 'Nama', 'No. KP', 'Jantina', 'Kaum', 'Sekolah', 'Kod', 'Program', 'Peranan', 'Kategori', 'No. Ahli'
    ]],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 18 },
      5: { cellWidth: 40 },
      6: { cellWidth: 15, halign: 'center' },
      7: { cellWidth: 25 },
      8: { cellWidth: 22, halign: 'center' },
      9: { cellWidth: 18, halign: 'center' },
      10: { cellWidth: 20, halign: 'center' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
};

/**
 * Download PDF with filename
 */
export const downloadPDF = (doc: jsPDF, filename: string) => {
  doc.save(filename);
};

/**
 * Open PDF in new tab for preview
 */
export const previewPDF = (doc: jsPDF) => {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
