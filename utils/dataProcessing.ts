import { SubmissionData, School } from '../types';

export const safeParseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(value as string);
  return isNaN(date.getTime()) ? null : date;
};

export const safeGetYear = (value: unknown): number | null => {
  const date = safeParseDate(value);
  return date ? date.getFullYear() : null;
};

export const safeGetMonth = (value: unknown): number | null => {
  const date = safeParseDate(value);
  return date ? date.getMonth() : null;
};

export interface RoleStats {
  students: number;
  maleStudents: number;
  femaleStudents: number;
  leaders: number;
  assistants: number;
  examiners: number;
  rambu: number;
  total: number;
}

export function computeRoleStats(records: SubmissionData[]): RoleStats {
  const stats: RoleStats = { students: 0, maleStudents: 0, femaleStudents: 0, leaders: 0, assistants: 0, examiners: 0, rambu: 0, total: records.length };
  for (const d of records) {
    const role = (d.role || 'PESERTA').toUpperCase();
    const gender = (d.gender || '').toUpperCase();
    if (role === 'PESERTA') {
      stats.students++;
      if (gender === 'LELAKI' || gender === 'L') stats.maleStudents++;
      else if (gender === 'PEREMPUAN' || gender === 'P') stats.femaleStudents++;
    } else if (role === 'PEMIMPIN') stats.leaders++;
    else if (role.includes('PENOLONG')) stats.assistants++;
    else if (role === 'PENGUJI') stats.examiners++;
    if (role.includes('RAMBU')) stats.rambu++;
  }
  return stats;
}

export function deduplicateRecords(data: SubmissionData[], schools: School[], showDrafts: boolean): SubmissionData[] {
  const schoolMap = new Map<string, School>();
  schools.forEach(s => { if (s && s.name) schoolMap.set(s.name, s); });

  const uniqueKeys = new Set<string>();
  return data.filter(item => {
    if (item.school === '__SYSTEM_YEAR_MARKER__') return false;
    if (!item.student || typeof item.student !== 'string' || !item.student.trim()) return false;

    let isApproved = false;
    if (showDrafts) {
      isApproved = true;
    } else {
      const schoolConfig = schoolMap.get(item.school);
      if (schoolConfig && schoolConfig.approvedBadges) {
        const itemYear = safeGetYear(item.date);
        if (itemYear === null) return false;
        const badgeYearKey = `${item.badge}_${itemYear}`;
        const approvedList = Array.isArray(schoolConfig.approvedBadges) ? schoolConfig.approvedBadges : [];
        if (approvedList.includes(badgeYearKey) || approvedList.includes(item.badge)) {
          isApproved = true;
        }
      }
    }
    if (!isApproved) return false;

    const year = safeGetYear(item.date);
    if (year === null) return false;
    const cleanName = String(item.student).trim().toUpperCase();
    const cleanIC = item.icNumber ? String(item.icNumber).trim() : '';
    const uniqueKey = cleanIC && cleanIC.length > 4
      ? `${cleanIC}_${item.badge}_${year}`
      : `${cleanName}_${item.school}_${item.badge}_${year}`;

    if (uniqueKeys.has(uniqueKey)) return false;
    uniqueKeys.add(uniqueKey);
    return true;
  });
}
