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
  if (badge) infoLines.push(`Lencana: ${badge}`);
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
    if (r === 'PENGUJI') return 4;
    return 5;
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
        item.badge || '',
        item.role || 'PESERTA',
        item.category || '-',
        item.id || '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: yPos + 2,
    head: [[
      'No.', 'Nama', 'No. KP', 'Jantina', 'Kaum', 'Sekolah', 'Kod', 'Lencana', 'Peranan', 'Kategori', 'No. Ahli'
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
  const totalExaminers = currentYearData.filter(d => (d.role || '').toUpperCase() === 'PENGUJI').length;

  // Badge breakdown
  const badgeCount: Record<string, number> = {};
  currentYearData.forEach(d => {
    const badge = d.badge || 'Tidak Dinyatakan';
    badgeCount[badge] = (badgeCount[badge] || 0) + 1;
  });

  // School breakdown — pecahan lengkap setiap sekolah
  type SchoolStats = { name: string; code: string; peserta: number; pemimpin: number; penolong: number; penguji: number; total: number; lelaki: number; perempuan: number };
  const schoolStatsMap: Record<string, SchoolStats> = {};
  currentYearData.forEach(d => {
    const school = d.school || 'Tidak Dinyatakan';
    const code = d.schoolCode || '';
    const key = school + '||' + code;
    if (!schoolStatsMap[key]) {
      schoolStatsMap[key] = { name: school, code, peserta: 0, pemimpin: 0, penolong: 0, penguji: 0, total: 0, lelaki: 0, perempuan: 0 };
    }
    const s = schoolStatsMap[key];
    s.total++;
    const role = (d.role || 'PESERTA').toUpperCase();
    const gender = (d.gender || '').toUpperCase();
    if (role === 'PENGUJI') s.penguji++;
    else if (role === 'PEMIMPIN') s.pemimpin++;
    else if (role.includes('PENOLONG')) s.penolong++;
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
    } else if (role === 'PENGUJI') {
      categoryCount['Penguji'] = (categoryCount['Penguji'] || 0) + 1;
    } else if (d.category) {
      categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
    } else {
      categoryCount['Tidak Dinyatakan'] = (categoryCount['Tidak Dinyatakan'] || 0) + 1;
    }
  });

  let yPos = (negeri || daerah) ? headerStartY + 20 : headerStartY + 14;

  // Summary table
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN KESELURUHAN', 14, yPos);
  yPos += 2;

  autoTable(doc, {
    startY: yPos,
    head: [['Kategori', 'Jumlah']],
    body: [
      ['Jumlah Peserta', totalParticipants.toString()],
      ['Jumlah Pemimpin', totalLeaders.toString()],
      ['Jumlah Penolong Pemimpin', totalAssistants.toString()],
      ['Jumlah Penguji', totalExaminers.toString()],
      ['JUMLAH KESELURUHAN', currentYearData.length.toString()],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Badge breakdown table
  doc.setFont('helvetica', 'bold');
  doc.text('PECAHAN MENGIKUT LENCANA', 14, yPos);
  yPos += 2;

  autoTable(doc, {
    startY: yPos,
    head: [['Lencana', 'Bilangan']],
    body: Object.entries(badgeCount).sort((a, b) => b[1] - a[1]).map(([badge, count]) => [badge, count.toString()]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Category breakdown (if exists)
  if (Object.keys(categoryCount).length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('PECAHAN MENGIKUT KATEGORI', 14, yPos);
    yPos += 2;

    autoTable(doc, {
      startY: yPos,
      head: [['Kategori', 'Bilangan']],
      body: Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).map(([cat, count]) => [cat, count.toString()]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Pecahan setiap sekolah - peserta + pemimpin dalam satu jadual
  if (schoolStatsList.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(`PECAHAN PER SEKOLAH (${schoolStatsList.length} sekolah)`, 14, yPos);
    yPos += 2;

    const grandTotal = schoolStatsList.reduce((acc, s) => ({
      peserta: acc.peserta + s.peserta,
      pemimpin: acc.pemimpin + s.pemimpin,
      penolong: acc.penolong + s.penolong,
      penguji: acc.penguji + s.penguji,
      lelaki: acc.lelaki + s.lelaki,
      perempuan: acc.perempuan + s.perempuan,
      total: acc.total + s.total,
    }), { peserta: 0, pemimpin: 0, penolong: 0, penguji: 0, lelaki: 0, perempuan: 0, total: 0 });

    autoTable(doc, {
      startY: yPos,
      head: [['No.', 'Sekolah', 'Kod', 'Peserta (L)', 'Peserta (P)', 'Pemimpin', 'Penolong', 'Penguji', 'Jumlah']],
      body: [
        ...schoolStatsList.map((s, i) => [
          (i + 1).toString(),
          s.name,
          s.code || '-',
          s.lelaki.toString(),
          s.perempuan.toString(),
          s.pemimpin.toString(),
          s.penolong.toString(),
          s.penguji.toString(),
          s.total.toString(),
        ]),
        [
          { content: 'JUMLAH', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
          { content: grandTotal.lelaki.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.perempuan.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.pemimpin.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.penolong.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.penguji.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
          { content: grandTotal.total.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199] } },
        ],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 60 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center', fontStyle: 'bold' },
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
  if (badge) infoLines.push(`Lencana: ${badge}`);
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
    if (r === 'PENGUJI') return 4;
    return 5;
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
        item.badge || '',
        item.role || 'PESERTA',
        item.category || '-',
        item.id || '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: yPos + 2,
    head: [[
      'No.', 'Nama', 'No. KP', 'Jantina', 'Kaum', 'Sekolah', 'Kod', 'Lencana', 'Peranan', 'Kategori', 'No. Ahli'
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
