import { SubmissionData } from '../types';
import { ProgramSetting } from './supabaseApi';

// ============================================================
// Pengiraan rumusan yuran & saiz baju untuk modul pendaftaran.
// Digunakan oleh dashboard sekolah (rumusan sendiri) dan admin
// (kutipan dijangka semua sekolah dalam skop).
// ============================================================

export const SHIRT_TYPES = [
  'Kolar',
  'Round Neck Lengan Pendek',
  'Round Neck Lengan Panjang',
  'Round Neck Muslimah',
] as const;

export const SHIRT_SIZES_KIDS = ['24', '26', '28', '30', '32'] as const; // Saiz budak (ukuran dada)
export const SHIRT_SIZES_ADULT = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'] as const;
export const SHIRT_SIZES = [...SHIRT_SIZES_KIDS, ...SHIRT_SIZES_ADULT] as const;

export interface ProgramBreakdown {
  badge: string;
  countPeserta: number;
  countPemimpin: number;
  countPenolong: number;
  feePeserta: number | null;
  feePemimpin: number | null;
  feePenolong: number | null;
  subtotalPeserta: number;
  subtotalPemimpin: number;
  subtotalPenolong: number;
  total: number;
  paymentEnabled: boolean;
  shirtEnabled: boolean;
  shirtByType: Record<string, Record<string, number>>; // jenis -> saiz -> bilangan
  shirtCount: number; // jumlah baju keseluruhan program ini
}

export interface SchoolSummary {
  schoolName: string;
  schoolCode: string;
  programs: ProgramBreakdown[];
  grandTotal: number;
  shirtByType: Record<string, Record<string, number>>; // agregat sekolah
  shirtCount: number;
}

const yearOf = (d: string): number | null => {
  const y = new Date(d).getFullYear();
  return Number.isNaN(y) ? null : y;
};

const findSetting = (
  settings: ProgramSetting[],
  badge: string,
  year: number,
  negeriCode?: string,
  daerahCode?: string,
): ProgramSetting | undefined =>
  settings.find(s =>
    s.badgeName === badge &&
    s.year === year &&
    ((s.scope === 'negeri' && s.negeriCode === negeriCode) ||
     (s.scope === 'daerah' && s.daerahCode === daerahCode)),
  );

const roleOf = (r?: string) => (r || 'PESERTA').toUpperCase();
const isPeserta = (r: string) => r === 'PESERTA' || r === 'PENERIMA RAMBU';
const isPemimpin = (r: string) => r === 'PEMIMPIN';
const isPenolong = (r: string) => r.includes('PENOLONG');

/**
 * Bina rumusan per sekolah untuk tahun tertentu.
 * Hanya program yang ADA TETAPAN (payment_enabled atau shirt_enabled)
 * dipaparkan supaya rumusan kekal relevan.
 */
export const buildProgramSummary = (
  records: SubmissionData[],
  settings: ProgramSetting[],
  year: number,
): SchoolSummary[] => {
  // Kumpulan: schoolCode -> badge -> breakdown
  const schoolMap = new Map<string, SchoolSummary>();

  records.forEach(rec => {
    if (rec.isWithdrawn) return;
    if (yearOf(rec.date) !== year) return;
    const badge = rec.badge || '';
    if (!badge) return;

    const setting = findSetting(settings, badge, year, rec.negeriCode, rec.daerahCode);
    // Hanya kira program yang ada tetapan bayaran atau saiz baju
    if (!setting || (!setting.paymentEnabled && !setting.shirtEnabled)) return;

    const schoolCode = rec.schoolCode || rec.school || '-';
    if (!schoolMap.has(schoolCode)) {
      schoolMap.set(schoolCode, {
        schoolName: rec.school || schoolCode,
        schoolCode,
        programs: [],
        grandTotal: 0,
        shirtByType: {},
        shirtCount: 0,
      });
    }
    const school = schoolMap.get(schoolCode)!;

    let prog = school.programs.find(p => p.badge === badge);
    if (!prog) {
      prog = {
        badge,
        countPeserta: 0, countPemimpin: 0, countPenolong: 0,
        feePeserta: setting.paymentEnabled ? setting.feePeserta : null,
        feePemimpin: setting.paymentEnabled ? setting.feePemimpin : null,
        feePenolong: setting.paymentEnabled ? setting.feePenolong : null,
        subtotalPeserta: 0, subtotalPemimpin: 0, subtotalPenolong: 0,
        total: 0,
        paymentEnabled: setting.paymentEnabled,
        shirtEnabled: setting.shirtEnabled,
        shirtByType: {},
        shirtCount: 0,
      };
      school.programs.push(prog);
    }

    const role = roleOf(rec.role);
    if (isPeserta(role)) prog.countPeserta += 1;
    else if (isPemimpin(role)) prog.countPemimpin += 1;
    else if (isPenolong(role)) prog.countPenolong += 1;

    // Saiz baju (peserta, pemimpin, penolong sahaja — bukan penguji)
    if (setting.shirtEnabled && (isPeserta(role) || isPemimpin(role) || isPenolong(role))) {
      const type = (rec.shirtType || '').trim() || '(Jenis belum diisi)';
      const size = (rec.shirtSize || '').trim() || '(Saiz belum diisi)';
      const addTo = (target: Record<string, Record<string, number>>) => {
        if (!target[type]) target[type] = {};
        target[type][size] = (target[type][size] || 0) + 1;
      };
      addTo(prog.shirtByType);
      addTo(school.shirtByType);
      prog.shirtCount += 1;
      school.shirtCount += 1;
    }
  });

  // Kira subtotal & total
  schoolMap.forEach(school => {
    school.programs.forEach(p => {
      p.subtotalPeserta = (p.feePeserta || 0) * p.countPeserta;
      p.subtotalPemimpin = (p.feePemimpin || 0) * p.countPemimpin;
      p.subtotalPenolong = (p.feePenolong || 0) * p.countPenolong;
      p.total = p.subtotalPeserta + p.subtotalPemimpin + p.subtotalPenolong;
    });
    school.grandTotal = school.programs.reduce((sum, p) => sum + p.total, 0);
    school.programs.sort((a, b) => a.badge.localeCompare(b.badge));
  });

  return Array.from(schoolMap.values()).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
};

export const formatRM = (n: number): string =>
  `RM ${n.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
