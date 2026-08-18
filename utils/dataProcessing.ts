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
  /** PEMBANTU. Dikira berasingan daripada `assistants` walaupun kadar yuran
   *  dan pengiraan tempatnya sama — mencampurkannya bermakna papan pemuka
   *  tidak dapat memaparkan kedua-duanya. */
  pembantu: number;
  examiners: number;
  rambu: number;
  total: number;
}

export function computeRoleStats(records: SubmissionData[]): RoleStats {
  const stats: RoleStats = { students: 0, maleStudents: 0, femaleStudents: 0, leaders: 0, assistants: 0, pembantu: 0, examiners: 0, rambu: 0, total: records.length };
  for (const d of records) {
    const role = (d.role || 'PESERTA').toUpperCase();
    const gender = (d.gender || '').toUpperCase();
    if (role === 'PESERTA') {
      stats.students++;
      if (gender === 'LELAKI' || gender === 'L') stats.maleStudents++;
      else if (gender === 'PEREMPUAN' || gender === 'P') stats.femaleStudents++;
    } else if (role === 'PEMIMPIN') stats.leaders++;
    else if (role.includes('PENOLONG')) stats.assistants++;
    else if (role === 'PEMBANTU') stats.pembantu++;
    else if (role === 'PENGUJI') stats.examiners++;
    // Pegawai yang merangkap penguji dikira dalam KEDUA-DUA baldi dengan
    // sengaja — dia benar-benar memenuhi kedua-dua tugas (migrasi 054). `else
    // if` di atas memastikan baris berperanan PENGUJI tidak dikira dua kali.
    if (role !== 'PENGUJI' && d.isPenguji) stats.examiners++;
    if (role.includes('RAMBU')) stats.rambu++;
  }
  return stats;
}

/**
 * Kunci status pendaftaran: program + tahun + siri.
 *
 * Setiap siri ialah pusingan pendaftaran berasingan dengan kitaran
 * hantar/sahkan/kunci tersendiri (migrasi 027), jadi siri sebahagian daripada
 * kunci. Format ini WAJIB sama di kedua-dua belah — tempat kunci dibina
 * (lockedBadges/approvedBadges dalam supabaseApi) dan tempat ia disemak
 * (deduplicateRecords di bawah, UserForm, UserDashboard). Ditakrif di sini
 * supaya hanya ada satu sumber kebenaran.
 */
export const badgeStatusKey = (badge: string, year: number | string, siri: number = 1): string =>
  `${badge}_${year}_${siri || 1}`;

/**
 * Kebenaran edit bagi satu program, tahun dan siri.
 *
 * Kebenaran DISIMPAN mengikut siri, kerana ia hidup dalam `notes` pada baris
 * school_badge_status dan baris itu dikunci pada (sekolah, program, tahun,
 * siri). Tetapi UI admin — "Kawalan Edit Pukal Mengikut Program" — tidak
 * mempunyai dimensi siri langsung. Ia menulis kepada siri yang sudah wujud,
 * yang biasanya Siri 1 sahaja.
 *
 * Tanpa sandaran ini, menutup Peserta menyekat Siri 1 dan membiarkan Siri 2
 * terbuka sepenuhnya — sekolah hanya perlu bertukar siri untuk memintasnya.
 * Itu bukan yang admin fikir mereka tetapkan.
 *
 * Jadi: kunci tepat dahulu, kemudian jatuh kembali kepada Siri 1 sebagai
 * kedudukan peringkat program. Kalau admin tidak pernah menyentuh togol itu,
 * kedua-duanya tiada dan pemanggil menggunakan kebenaran peringkat sekolah.
 */
export const resolveBadgePermissions = <T,>(
  peta: Record<string, T> | undefined | null,
  badge: string,
  year: number | string,
  siri: number = 1,
): T | undefined => {
  if (!peta || !badge) return undefined;
  return peta[badgeStatusKey(badge, year, siri)] ?? peta[badgeStatusKey(badge, year, 1)];
};

/**
 * Songsangan `badgeStatusKey`. Menerima format baharu `<program>_<tahun>_<siri>`
 * DAN format lama `<program>_<tahun>` yang masih wujud dalam data tersimpan.
 *
 * Kedua-duanya dibezakan dengan menyemak sama ada bahagian itu munasabah
 * sebagai tahun — bukan dengan mengira bilangan bahagian, kerana nama program
 * sendiri boleh mengandungi garis bawah.
 */
export const parseBadgeStatusKey = (key: string): { badge: string; year: number; siri: number } => {
  const parts = String(key || '').split('_');
  const looksLikeYear = (n: number) => Number.isFinite(n) && n >= 2000 && n <= 2100;
  const last = parseInt(parts[parts.length - 1], 10);
  const secondLast = parts.length > 2 ? parseInt(parts[parts.length - 2], 10) : NaN;

  // <program>_<tahun>_<siri>
  if (parts.length > 2 && looksLikeYear(secondLast)) {
    return {
      badge: parts.slice(0, -2).join('_'),
      year: secondLast,
      siri: Number.isFinite(last) && last >= 1 ? last : 1,
    };
  }
  // <program>_<tahun> (warisan)
  if (parts.length > 1 && looksLikeYear(last)) {
    return { badge: parts.slice(0, -1).join('_'), year: last, siri: 1 };
  }
  // Nama program sahaja
  return { badge: key, year: new Date().getFullYear(), siri: 1 };
};

export function deduplicateRecords(data: SubmissionData[], schools: School[], showDrafts: boolean): SubmissionData[] {
  const schoolMap = new Map<string, School>();
  schools.forEach(s => { if (s && s.name) schoolMap.set(s.name, s); });

  const uniqueKeys = new Set<string>();
  return data.filter(item => {
    if (item.school === '__SYSTEM_YEAR_MARKER__') return false;
    if (!item.student || typeof item.student !== 'string' || !item.student.trim()) return false;

    // NOTA: JANGAN tapis submissionStatus === 'draft' di sini.
    // Dicuba dan digulung semula: dalam sistem ini 'draft' bukan sahaja bermakna
    // "menunggu bayaran" — ia juga keadaan biasa bagi peserta yang ditambah
    // SELEPAS sekolah menekan Hantar (cth melalui Import Naik). Peserta tersebut
    // menumpang pengesahan sedia ada dan memang dikira hari ini; menapisnya akan
    // melenyapkan rekod sah daripada laporan rasmi.
    //
    // Pintu bayaran tidak memerlukannya: trigger enforce_payment_before_approval
    // (migrasi 029) menghalang 'approved' selagi bayaran belum selesai, dan
    // statistik hanya mengira yang 'approved'.

    let isApproved = false;
    if (showDrafts) {
      isApproved = true;
    } else {
      const schoolConfig = schoolMap.get(item.school);
      if (schoolConfig && schoolConfig.approvedBadges) {
        const itemYear = safeGetYear(item.date);
        if (itemYear === null) return false;
        const badgeYearKey = badgeStatusKey(item.badge, itemYear, item.siri || 1);
        const approvedList = Array.isArray(schoolConfig.approvedBadges) ? schoolConfig.approvedBadges : [];
        // Fallback `includes(item.badge)` dikekalkan untuk data warisan yang
        // disahkan tanpa tahun. Jangan buang — ada rekod lama bergantung padanya.
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
    // Siri WAJIB ada dalam kunci. Tanpanya, orang yang sama didaftarkan
    // dalam Siri 1 dan Siri 2 bagi program yang sama runtuh menjadi satu
    // baris, dan salah satu sirinya lenyap daripada papan pemuka tanpa
    // amaran — pemimpin yang mengiringi kedua-dua pusingan ialah kes biasa.
    const siri = item.siri || 1;
    const uniqueKey = cleanIC && cleanIC.length > 4
      ? `${cleanIC}_${item.badge}_${year}_${siri}`
      : `${cleanName}_${item.school}_${item.badge}_${year}_${siri}`;

    if (uniqueKeys.has(uniqueKey)) return false;
    uniqueKeys.add(uniqueKey);
    return true;
  });
}

/**
 * Peranan yang dikira sebagai PEGAWAI bagi tujuan penggabungan.
 * Peserta sengaja tiada — lihat komen dalam gabungPegawaiSiri.
 */
const adalahPegawai = (role?: string) => {
  const r = (role || 'PESERTA').toUpperCase();
  return r === 'PEMIMPIN' || r.includes('PENOLONG') || r === 'PEMBANTU' || r === 'PENGUJI';
};

/**
 * Identiti orang. Peraturan yang SAMA seperti deduplicateRecords — nombor KP
 * bila ia cukup panjang untuk dipercayai, jika tidak nama + sekolah.
 * Dua definisi "orang yang sama" akan menyimpang, jadi hanya ada satu.
 */
const kunciOrang = (d: SubmissionData) => {
  const ic = d.icNumber ? String(d.icNumber).trim() : '';
  return ic.length > 4
    ? ic
    : `${String(d.student || '').trim().toUpperCase()}_${d.school}`;
};

/**
 * Gabungkan pegawai yang sama merentas program dalam SIRI yang sama.
 *
 * Satu siri lazimnya mengandungi beberapa program, dan sekolah mendaftarkan
 * pemimpin serta penguji yang sama untuk setiap satu. Tanpa penggabungan ini
 * nama yang sama muncul tiga kali dalam senarai dan dikira tiga kali dalam
 * statistik.
 *
 * PESERTA TIDAK DIGABUNGKAN. Seorang murid yang muncul dalam dua program
 * dalam satu siri ialah DUA pendaftaran sebenar — dua tempat, dua yuran.
 * Menyembunyikannya menyembunyikan sama ada kesilapan pendaftaran atau kos
 * sebenar. Pegawai berbeza: seorang guru yang mengiringi tiga program tetap
 * seorang guru.
 *
 * INI PAPARAN SAHAJA. Bil dan kiraan tempat kekal per program — seorang
 * pemimpin yang didaftarkan untuk tiga program masih dicaj tiga kali. Jubin
 * statistik dan bil akan berbeza dengan sengaja.
 *
 * Baris gabungan membawa `programGabung` berisi setiap nama program, dan
 * `digabung` supaya paparan boleh melumpuhkan butang Sunting dan Padam:
 * baris itu mewakili tiga pendaftaran dan butang hanya boleh menyentuh satu.
 */
export function gabungPegawaiSiri(data: SubmissionData[]): SubmissionData[] {
  const pertama = new Map<string, SubmissionData>();
  const program = new Map<string, string[]>();
  const keluar: SubmissionData[] = [];

  for (const d of data) {
    if (!adalahPegawai(d.role)) { keluar.push(d); continue; }

    const tahun = safeGetYear(d.date);
    if (tahun === null) { keluar.push(d); continue; }

    // Program TIDAK dalam kunci — itulah dimensi yang digabungkan.
    // Siri ada di dalamnya: Siri 1 dan Siri 2 ialah pusingan berasingan.
    const kunci = `${kunciOrang(d)}_${tahun}_${d.siri || 1}_${(d.role || '').toUpperCase()}`;
    const sedia = pertama.get(kunci);

    if (!sedia) {
      const salinan: SubmissionData = { ...d, programGabung: [d.badge] };
      pertama.set(kunci, salinan);
      program.set(kunci, [d.badge]);
      keluar.push(salinan);
      continue;
    }

    const senarai = program.get(kunci)!;
    if (!senarai.includes(d.badge)) senarai.push(d.badge);
    sedia.programGabung = senarai;
    sedia.digabung = senarai.length > 1;
  }

  return keluar;
}
