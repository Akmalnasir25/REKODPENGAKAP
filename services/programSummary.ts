import { SubmissionData, SchoolType } from '../types';
import { ProgramSetting, ProgramFeeOverride } from './supabaseApi';

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
  siri: number;
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

/**
 * Cermin klien bagi resolve_program_fees() (migrasi 031). Kedua-duanya MESTI
 * memberi jawapan sama — satu memandu paparan, satu lagi memandu bil sebenar.
 *
 * Keutamaan, paling khusus menang:
 *   (siri tepat, jenis tepat) > (siri tepat, semua) > (semua, jenis tepat) > (semua, semua)
 *
 * Peranan yang tidak dicaj pada aras program kekal tidak dicaj, walau apa pun
 * yang override tetapkan. Ini yang memastikan set peranan berbayar sama untuk
 * setiap sekolah, yang seterusnya mengekalkan peraturan kuota.
 */
export const resolveFees = (
  setting: ProgramSetting,
  overrides: ProgramFeeOverride[],
  siri: number,
  schoolType: SchoolType,
): { feePeserta: number | null; feePemimpin: number | null; feePenolong: number | null } => {
  const calon = overrides
    .filter(o => o.programSettingId === setting.id
      && (o.siri === null || o.siri === siri)
      && (o.schoolType === null || o.schoolType === schoolType))
    .sort((a, b) => keutamaan(a) - keutamaan(b));
  const pilih = calon[0];

  return {
    feePeserta:  setting.feePeserta  === null ? null : (pilih?.feePeserta  ?? setting.feePeserta),
    feePemimpin: setting.feePemimpin === null ? null : (pilih?.feePemimpin ?? setting.feePemimpin),
    feePenolong: setting.feePenolong === null ? null : (pilih?.feePenolong ?? setting.feePenolong),
  };
};

const keutamaan = (o: ProgramFeeOverride): number =>
  o.siri !== null && o.schoolType !== null ? 1
  : o.siri !== null ? 2
  : o.schoolType !== null ? 3
  : 4;

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
  overrides: ProgramFeeOverride[] = [],
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

    // Yuran boleh berbeza antara siri, jadi rumusan dipecah per program x siri.
    // Jenis sekolah tetap dalam satu sekolah, jadi ia tidak memecahkan lagi.
    const siri = rec.siri || 1;
    const yuran = resolveFees(setting, overrides, siri, (rec.schoolType || 'lain') as SchoolType);

    let prog = school.programs.find(p => p.badge === badge && p.siri === siri);
    if (!prog) {
      prog = {
        badge,
        siri,
        countPeserta: 0, countPemimpin: 0, countPenolong: 0,
        feePeserta: setting.paymentEnabled ? yuran.feePeserta : null,
        feePemimpin: setting.paymentEnabled ? yuran.feePemimpin : null,
        feePenolong: setting.paymentEnabled ? yuran.feePenolong : null,
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
    school.programs.sort((a, b) => a.badge.localeCompare(b.badge) || a.siri - b.siri);
  });

  return Array.from(schoolMap.values()).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
};

export const formatRM = (n: number): string =>
  `RM ${n.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
