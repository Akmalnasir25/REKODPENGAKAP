import { jsPDF } from 'jspdf';
import { supabase } from './supabaseClient';
import { setCertificateUrl, uploadCourseFile } from './courseService';
import type { Course, CourseRegistration, LeaderAccount } from '../types';

export interface CertificateData {
  leaderName: string;
  leaderIC: string;
  courseName: string;
  courseCode: string;
  courseScope: 'negeri' | 'daerah';
  courseStartDate: string;
  courseEndDate: string;
  courseVenue: string;
  resultGrade?: string | null;
  certificateNo?: string;
  issueDate?: string;
}

/**
 * Format tarikh ke "12 Januari 2026"
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Generate sijil PDF (template tetap, landscape A4)
 */
export function generateCertificatePDF(data: CertificateData): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===== Border decorative =====
  doc.setDrawColor(217, 119, 6); // amber-600
  doc.setLineWidth(2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
  doc.setLineWidth(0.5);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // ===== Header =====
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('PERSEKUTUAN PENGAKAP MALAYSIA', pageWidth / 2, 25, { align: 'center' });

  doc.setFontSize(28);
  doc.setTextColor(217, 119, 6);
  doc.setFont('helvetica', 'bold');
  doc.text('SIJIL PENGHARGAAN', pageWidth / 2, 42, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'italic');
  doc.text('Certificate of Achievement', pageWidth / 2, 50, { align: 'center' });

  // ===== Body =====
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text('Adalah dengan ini disahkan bahawa', pageWidth / 2, 70, { align: 'center' });

  // Nama peserta
  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.text(data.leaderName.toUpperCase(), pageWidth / 2, 88, { align: 'center' });

  // Underline nama
  const nameWidth = doc.getTextWidth(data.leaderName.toUpperCase());
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.5);
  doc.line(
    pageWidth / 2 - nameWidth / 2 - 5,
    91,
    pageWidth / 2 + nameWidth / 2 + 5,
    91,
  );

  // No IC
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`No. Kad Pengenalan: ${data.leaderIC}`, pageWidth / 2, 98, { align: 'center' });

  // Course info
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text('telah berjaya mengikuti dan menamatkan', pageWidth / 2, 112, { align: 'center' });

  doc.setFontSize(18);
  doc.setTextColor(217, 119, 6);
  doc.setFont('helvetica', 'bold');
  const courseLine = doc.splitTextToSize(data.courseName, pageWidth - 60);
  doc.text(courseLine, pageWidth / 2, 124, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  const dateLine = `${formatDate(data.courseStartDate)} hingga ${formatDate(data.courseEndDate)}`;
  doc.text(dateLine, pageWidth / 2, 140, { align: 'center' });
  doc.text(`di ${data.courseVenue}`, pageWidth / 2, 147, { align: 'center' });

  // Grade (if any)
  if (data.resultGrade) {
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Keputusan: ${data.resultGrade}`, pageWidth / 2, 158, { align: 'center' });
  }

  // ===== Footer =====
  const footerY = pageHeight - 35;

  // Cert no (left)
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  if (data.certificateNo) {
    doc.text(`No. Sijil: ${data.certificateNo}`, 25, footerY);
  }
  doc.text(`Kod Kursus: ${data.courseCode}`, 25, footerY + 5);
  if (data.issueDate) {
    doc.text(`Tarikh Dikeluarkan: ${formatDate(data.issueDate)}`, 25, footerY + 10);
  }

  // Right: signature line placeholder
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(pageWidth - 90, footerY, pageWidth - 25, footerY);
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(
    data.courseScope === 'negeri' ? 'Pesuruhjaya Pengakap Negeri' : 'Pesuruhjaya Pengakap Daerah',
    pageWidth - 57.5,
    footerY + 5,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'italic');
  doc.text('Persekutuan Pengakap Malaysia', pageWidth - 57.5, footerY + 10, { align: 'center' });

  return doc.output('blob');
}

/**
 * Generate, upload ke storage & save URL ke registration.
 * Hanya akan generate sekiranya course.hasDigitalCertificate = true.
 * Akan guna template kustom jika di-resolve, jika tidak fallback ke design default.
 */
export async function generateAndUploadCertificate(
  registration: CourseRegistration,
  course: Course,
  leader: LeaderAccount,
): Promise<{ success: boolean; url?: string; message?: string; skipped?: boolean }> {
  try {
    // Check sama ada kursus ada sijil digital
    if (!course.hasDigitalCertificate) {
      return {
        success: false,
        skipped: true,
        message: 'Kursus ini tidak menyediakan sijil digital.',
      };
    }

    const certNo = `${course.code}-${(registration.id || '').slice(0, 8).toUpperCase()}`;
    const data: CertificateData = {
      leaderName: leader.fullName,
      leaderIC: leader.icNumber,
      courseName: course.name,
      courseCode: course.code,
      courseScope: course.scope,
      courseStartDate: course.startDate,
      courseEndDate: course.endDate,
      courseVenue: course.venue,
      resultGrade: registration.resultGrade,
      certificateNo: certNo,
      issueDate: new Date().toISOString(),
    };

    // Cuba resolve template kustom
    let blob: Blob;
    try {
      const { resolveTemplateForCourse } = await import('./certificateTemplateService');
      const template = await resolveTemplateForCourse({
        id: course.id,
        scope: course.scope,
        negeriId: course.negeriId,
        daerahId: course.daerahId,
        certificateTemplateId: course.certificateTemplateId,
      });
      if (template && template.templateUrl) {
        blob = await generateCertificateWithTemplate(data, template.templateUrl, template.fieldPositions);
      } else {
        blob = generateCertificatePDF(data);
      }
    } catch {
      blob = generateCertificatePDF(data);
    }

    const file = new File([blob], `${certNo}.pdf`, { type: 'application/pdf' });

    const uploaded = await uploadCourseFile('course-certificates', file, `course-${course.id}`);
    if (!uploaded.success || !uploaded.url) {
      return { success: false, message: uploaded.message || 'Gagal muat naik sijil.' };
    }

    const saved = await setCertificateUrl(registration.id, uploaded.url);
    if (!saved.success) {
      return { success: false, message: saved.message };
    }

    return { success: true, url: uploaded.url };
  } catch (err: any) {
    console.error('generateAndUploadCertificate error:', err);
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

// Suppress unused supabase warning (used indirectly via courseService)
void supabase;

// ============================================================
// Generate sijil dengan custom template (overlay text on PDF/image background)
// ============================================================
import type { FieldPosition } from './certificateTemplateService';

export async function generateCertificateWithTemplate(
  data: CertificateData,
  templateUrl: string,
  fieldPositions: FieldPosition[],
): Promise<Blob> {
  // Tentukan jenis fail dari URL/ext
  const ext = (templateUrl.split('.').pop() || '').toLowerCase().split('?')[0];
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

  // Default canvas A4 landscape: 297 x 210 mm
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Fetch template sebagai blob
  const response = await fetch(templateUrl);
  const blob = await response.blob();

  if (isImage) {
    // Image background - convert to dataUrl
    const dataUrl = await blobToDataUrl(blob);
    doc.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'NONE');
  } else {
    // PDF template - sukar untuk overlay dalam jspdf, simply use first page sebagai image
    // Untuk fasa ni, syorkan admin upload PNG/JPG sebagai template
    const dataUrl = await blobToDataUrl(blob);
    try {
      doc.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'NONE');
    } catch {
      // Kalau jspdf tak boleh embed PDF, fallback design default
      return generateCertificatePDF(data);
    }
  }

  // Letak text fields ikut field_positions
  for (const pos of fieldPositions) {
    if (pos.page && pos.page > 1) continue; // single page sahaja buat masa ni
    const value = resolveFieldValue(data, pos.field);
    if (!value) continue;

    doc.setFontSize(pos.fontSize || 14);
    doc.setFont('helvetica', pos.fontWeight || 'normal');
    if (pos.color) {
      const rgb = hexToRgb(pos.color);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(value, pos.x, pos.y, {
      align: pos.align || 'left',
      maxWidth: pos.width,
    });
  }

  return doc.output('blob');
}

function resolveFieldValue(data: CertificateData, field: FieldPosition['field']): string {
  switch (field) {
    case 'leaderName': return data.leaderName.toUpperCase();
    case 'leaderIC': return data.leaderIC;
    case 'courseName': return data.courseName;
    case 'courseDate':
      return `${formatDate(data.courseStartDate)} - ${formatDate(data.courseEndDate)}`;
    case 'courseVenue': return data.courseVenue;
    case 'certificateNo': return data.certificateNo || '';
    case 'issueDate': return data.issueDate ? formatDate(data.issueDate) : '';
    case 'resultGrade': return data.resultGrade || '';
    default: return '';
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}