import jsPDF from 'jspdf';
import { formatRM } from './programSummary';

// ============================================================
// Resit bayaran pendaftaran.
//
// Sekolah selalunya perlukan resit untuk tuntutan kewangan sekolah, jadi ia
// mesti mengandungi maklumat yang pegawai kewangan cari: nombor resit, tarikh,
// jumlah, kaedah, dan rujukan transaksi.
//
// Nombor resit diterbitkan daripada ID bayaran dan bukan dijana berasingan.
// Kaunter berasingan akan menyimpang bila bayaran dibatalkan atau ditolak, dan
// dua resit dengan nombor sama adalah masalah yang lebih teruk daripada
// nombor yang tidak berturutan.
// ============================================================

export interface ItemResit {
  program: string;
  amount: number;
  peserta: number;
  pemimpin: number;
  penolong: number;
}

export interface DataResit {
  paymentId: string;
  schoolName: string;
  schoolCode?: string;
  siri: number;
  year: number;
  amount: number;              // yuran sahaja
  transactionFee: number;      // caj gateway, 0 untuk bayaran manual
  totalAmount: number;         // yang sekolah bayar
  method: string;
  referenceNumber?: string | null;
  paidAt?: string | null;
  confirmedAt?: string | null;
  daerahName?: string;
  negeriName?: string;
  /** Satu resit meliputi semua program dalam satu siri (§13). */
  items: ItemResit[];
  logoUrl?: string;
}

const namaKaedah = (m: string) =>
  m === 'toyyibpay' ? 'Bayaran Online (FPX)'
  : m === 'bank_transfer' ? 'Pindahan Bank'
  : m === 'cheque' ? 'Cek'
  : m === 'cash' ? 'Tunai'
  : m;

/** RSN-2026-A1B2C3D4 — stabil, unik, dan boleh dijejaki balik ke baris bayaran. */
export const nomborResit = (paymentId: string, year: number) =>
  `RSN-${year}-${paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const tarikhMY = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ms-MY', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
};

export const janaResitPDF = (data: DataResit): jsPDF => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 20;                       // margin kiri
  const R = 190;                      // margin kanan
  let y = 18;

  if (data.logoUrl) {
    try { doc.addImage(data.logoUrl, 'PNG', L, y - 4, 18, 18); } catch { /* logo opsyenal */ }
  }

  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.text('RESIT BAYARAN', data.logoUrl ? L + 24 : L, y + 3);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  doc.text('Persekutuan Pengakap Malaysia', data.logoUrl ? L + 24 : L, y + 9);
  const skop = [data.daerahName, data.negeriName].filter(Boolean).join(', ');
  if (skop) doc.text(skop, data.logoUrl ? L + 24 : L, y + 14);

  // Nombor resit — sebelah kanan, medan pertama yang pegawai kewangan cari.
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0);
  doc.text(nomborResit(data.paymentId, data.year), R, y + 3, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90);
  doc.text(tarikhMY(data.confirmedAt || data.paidAt), R, y + 9, { align: 'right' });

  y += 24;
  doc.setDrawColor(200).line(L, y, R, y);
  y += 10;

  const baris = (label: string, nilai: string, tebal = false) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
    doc.text(label, L, y);
    doc.setFont('helvetica', tebal ? 'bold' : 'normal').setTextColor(0);
    doc.text(nilai, L + 45, y);
    y += 6.5;
  };

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0);
  doc.text('MAKLUMAT PENDAFTARAN', L, y); y += 7;
  baris('Sekolah', data.schoolName + (data.schoolCode ? ` (${data.schoolCode})` : ''), true);
  baris('Siri', `Siri ${data.siri}`);
  baris('Tahun', String(data.year));

  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('BUTIRAN BAYARAN', L, y); y += 7;

  // Satu bil merangkumi beberapa program, jadi resit mesti menunjukkan
  // pecahannya. Sekolah yang menuntut balik daripada kewangan perlu tahu
  // program mana menyumbang berapa — jumlah tunggal tidak boleh disemak.
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(120);
  doc.text('PROGRAM', L, y);
  doc.text('BILANGAN', L + 78, y);
  doc.text('JUMLAH', R, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(220).line(L, y, R, y);
  y += 5;

  // Senarai kosong tidak sepatutnya berlaku, tetapi resit yang GAGAL DIJANA
  // memberitahu sekolah lebih sedikit daripada resit tanpa pecahan.
  (data.items || []).forEach((it) => {
    // Peranan tanpa seorang pun tidak disenaraikan — "0 pemimpin" hanya
    // menambah bunyi pada dokumen yang perlu dibaca pantas.
    const bil = [
      it.peserta ? `${it.peserta} peserta` : '',
      it.pemimpin ? `${it.pemimpin} pemimpin` : '',
      it.penolong ? `${it.penolong} pen. pemimpin` : '',
    ].filter(Boolean).join(', ') || '-';

    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0);
    doc.text(it.program, L, y, { maxWidth: 74 });
    doc.setFontSize(8).setTextColor(90);
    doc.text(bil, L + 78, y, { maxWidth: 58 });
    doc.setFontSize(9).setTextColor(0);
    doc.text(formatRM(it.amount), R, y, { align: 'right' });
    y += 6.5;
  });

  y += 1;
  doc.setDrawColor(230).line(L, y, R, y); y += 7;

  baris('Yuran', formatRM(data.amount));
  if (data.transactionFee > 0) baris('Caj perkhidmatan', formatRM(data.transactionFee));

  doc.setFillColor(240, 253, 244);
  doc.rect(L, y - 4.5, R - L, 11, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(6, 95, 70);
  doc.text('JUMLAH DIBAYAR', L + 2, y + 2.5);
  doc.text(formatRM(data.totalAmount), R - 2, y + 2.5, { align: 'right' });
  y += 15;
  doc.setTextColor(0);

  baris('Kaedah', namaKaedah(data.method));
  if (data.referenceNumber) baris('No. rujukan', data.referenceNumber);
  baris('Tarikh bayaran', tarikhMY(data.paidAt));

  y += 8;
  doc.setDrawColor(200).line(L, y, R, y); y += 6;
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120);
  doc.text('Resit ini dijana secara automatik oleh sistem ScoutNadi dan sah tanpa tandatangan.', L, y);
  y += 4;
  doc.text(`Rujukan sistem: ${data.paymentId}`, L, y);

  return doc;
};

export const muatTurunResit = (data: DataResit) => {
  const doc = janaResitPDF(data);
  const namaFail = `Resit_${nomborResit(data.paymentId, data.year)}_${data.schoolName.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
  doc.save(namaFail);
};
