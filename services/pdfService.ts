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

  // Table
  const tableData = data.map((item, i) => [
    (i + 1).toString(),
    item.student || '',
    item.icNumber || '-',
    item.gender || '',
    item.race || '',
    item.school || '',
    item.schoolCode || '',
    item.badge || '',
    item.role || 'PESERTA',
    item.category || '-',
    item.id || '-',
  ]);

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

  // School breakdown
  const schoolCount: Record<string, number> = {};
  currentYearData.forEach(d => {
    const school = d.school || 'Tidak Dinyatakan';
    schoolCount[school] = (schoolCount[school] || 0) + 1;
  });

  // Category breakdown
  const categoryCount: Record<string, number> = {};
  currentYearData.forEach(d => {
    if (d.category) {
      categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
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

  // Top schools
  const topSchools = Object.entries(schoolCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topSchools.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('10 SEKOLAH TERATAS', 14, yPos);
    yPos += 2;

    autoTable(doc, {
      startY: yPos,
      head: [['No.', 'Sekolah', 'Bilangan']],
      body: topSchools.map(([school, count], i) => [(i + 1).toString(), school, count.toString()]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', fontStyle: 'bold' } },
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
