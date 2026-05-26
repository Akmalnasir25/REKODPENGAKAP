/**
 * Import data peserta dari folder "PERKHEMAHAN UDARA 2026"
 * masuk ke Supabase di bawah program (badge) "Pengenalan Pengakap Udara".
 *
 * Penggunaan:
 *   npx tsx scripts/import-perkhemahan-udara-2026.ts          # dry-run
 *   npx tsx scripts/import-perkhemahan-udara-2026.ts --apply  # benar-benar insert
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const BADGE_NAME = 'Pengenalan Pengakap Udara';
const SUBMISSION_YEAR = 2026;
const SUBMITTED_AT = '2026-06-12T00:00:00.000Z'; // tarikh perkhemahan
const SOURCE_DIR = resolve(__dirname, '..', 'PERKHEMAHAN UDARA 2026');

// Fail untuk skip (template kosong / sample sahaja)
const SKIP_FILES = new Set<string>([
  '_1.BORANG KELOMPOK PERKHEMAHAN UDARA 2026.xlsx',
]);

// Override / pembetulan untuk fail xlsx yang ada kod salah atau sekolah tiada dalam DB.
// Key = nama fail xlsx (case-sensitive).
// forceCode  : guna kod ini untuk match sekolah, abaikan apa yang tertulis dalam xlsx.
// createIfMissing : kalau sekolah masih tak wujud, cipta dengan kod & nama ni.
const FILE_OVERRIDES: Record<string, {
  forceCode?: string;
  forceName?: string;
  createIfMissing?: { schoolCode: string; name: string; negeriId: string; daerahId: string };
}> = {
  // SK PENGKALAN dlm xlsx tulis kod ABA2052 (salah - itu kod SK SERI KELEBANG).
  // Kod sebenar SK PENGKALAN ialah ABA2057.
  'SK PENGKALAN.xlsx': {
    forceCode: 'ABA2057',
    forceName: 'SK PENGKALAN',
  },
  // SMK RAJA PEREMPUAN belum wujud dalam DB. Cipta baru.
  'SMK RAJA PEREMPUAN.xlsx': {
    forceCode: 'AEB2046',
    forceName: 'SMK RAJA PEREMPUAN',
    createIfMissing: {
      schoolCode: 'AEB2046',
      name: 'SMK RAJA PEREMPUAN',
      negeriId: 'e86fbce5-28bf-47c6-9439-8967eb0c7ef9', // Perak
      daerahId: 'ada7b07f-16a3-4d23-aa6b-022f31ac1677', // Kinta Utara
    },
  },
};

// Wipe semua submission sedia ada untuk badge+year SEBELUM re-import.
// Kalau true, script akan padam semua submission Pengenalan Pengakap Udara 2026 dahulu.
const WIPE_BEFORE_IMPORT = process.argv.includes('--wipe');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ----------------------------- helpers -----------------------------
const norm = (v: any) => (v == null ? '' : String(v).trim());
const normUpper = (v: any) => norm(v).toUpperCase().replace(/\s+/g, ' ');
const stripSpaces = (v: any) => norm(v).replace(/\s+/g, '').toUpperCase();

const formatIc = (v: any): string | null => {
  if (v == null || v === '') return null;
  // Handle number (Excel IC sometimes parsed as number e.g. 160819080743)
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = String(Math.round(v));
    const padded = s.padStart(12, '0');
    if (padded.length === 12) return `${padded.slice(0, 6)}-${padded.slice(6, 8)}-${padded.slice(8)}`;
    return s;
  }
  const digits = norm(v).replace(/\D/g, '');
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  if (digits.length > 0 && digits.length < 12) {
    // pad short numbers (Excel may strip leading zeros)
    const padded = digits.padStart(12, '0');
    return `${padded.slice(0, 6)}-${padded.slice(6, 8)}-${padded.slice(8)}`;
  }
  const s = norm(v);
  return s || null;
};

const formatPhone = (v: any): string | null => {
  let s = norm(v);
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  s = s.replace(/^\+6/, '').replace(/^6(?=0)/, '');
  if (s.startsWith('0')) s = '+6' + s;
  else if (!s.startsWith('+')) s = '+6' + s;
  return s;
};

const normalizeGender = (v: any): string | null => {
  const r = norm(v).toUpperCase();
  if (['L', 'LELAKI', 'MALE'].includes(r)) return 'Lelaki';
  if (['P', 'PEREMPUAN', 'FEMALE'].includes(r)) return 'Perempuan';
  return null;
};

const normalizeRace = (v: any): string => {
  const r = normUpper(v);
  if (!r) return '';
  // standard list
  return r;
};

const CATEGORY_MAP: Record<string, string> = {
  'PENGAKAP KANAK-KANAK': 'Pengakap Kanak-kanak',
  'PENGAKAP KANAK KANAK': 'Pengakap Kanak-kanak',
  'PENGAKAP MUDA': 'Pengakap Muda',
  'PENGAKAP REMAJA': 'Pengakap Remaja',
  'KELANA': 'Kelana',
};

const isLeaderCategory = (raw: string) => {
  const r = normUpper(raw);
  return r === 'PEMIMPIN' || r === 'PENOLONG PEMIMPIN' || r === 'PENGUJI';
};

const normalizeRole = (raw: string): 'PESERTA' | 'PEMIMPIN' | 'PENOLONG PEMIMPIN' | 'PENGUJI' => {
  const r = normUpper(raw);
  if (r === 'PEMIMPIN') return 'PEMIMPIN';
  if (r === 'PENOLONG PEMIMPIN' || r === 'PENOLONG') return 'PENOLONG PEMIMPIN';
  if (r === 'PENGUJI') return 'PENGUJI';
  return 'PESERTA';
};

const normalizeMakanan = (v: any): string | null => {
  const r = normUpper(v);
  if (r === 'BIASA' || r === '') return 'Biasa';
  if (r === 'VEGETARIAN' || r === 'VEGE') return 'Vegetarian';
  return 'Biasa';
};

const normalizeMasalah = (v: any): string => {
  const r = normUpper(v);
  if (!r || r === 'TIADA' || r === '-') return 'Tiada';
  if (r === 'ALAHAN' || r === 'ASMA' || r === 'GASTRIK' || r === 'PENYAKIT JANTUNG' || r === 'MIGRAIN' || r === 'PENYAKIT KRONIK') {
    return r.charAt(0) + r.slice(1).toLowerCase()
      .replace(/\bjantung\b/i, 'Jantung')
      .replace(/\bkronik\b/i, 'Kronik')
      .replace(/\bpenyakit\b/i, 'Penyakit');
  }
  // anything else -> Lain-lain
  return 'Lain-lain';
};

// -------------------------- school resolver --------------------------
type SchoolRow = { id: string; school_code: string; name: string };

let schoolsCache: SchoolRow[] = [];

async function loadSchools() {
  const { data, error } = await supabase.from('schools').select('id, school_code, name');
  if (error) throw error;
  schoolsCache = (data || []) as SchoolRow[];
}

async function ensureSchool(opts: { schoolCode: string; name: string; negeriId: string; daerahId: string }): Promise<SchoolRow> {
  const existing = schoolsCache.find(s => stripSpaces(s.school_code) === stripSpaces(opts.schoolCode));
  if (existing) return existing;
  if (!APPLY) {
    // dalam dry-run, pulangkan stub untuk tunjuk planning
    return { id: 'NEW', school_code: opts.schoolCode, name: opts.name };
  }
  const { data, error } = await supabase.from('schools').insert({
    name: normUpper(opts.name),
    school_code: opts.schoolCode,
    negeri_id: opts.negeriId,
    daerah_id: opts.daerahId,
    is_active: true,
    allow_students: true,
    allow_assistants: true,
    allow_examiners: true,
  }).select('id, school_code, name').single();
  if (error || !data) throw error || new Error('gagal cipta sekolah');
  schoolsCache.push(data as SchoolRow);
  console.log(`  [+SCHOOL] dicipta: ${data.school_code} | ${data.name}`);
  return data as SchoolRow;
}

function resolveSchool(kod: string, nama: string): SchoolRow | null {
  const kodNorm = stripSpaces(kod);
  const namaNorm = normUpper(nama);
  // 1) exact code match
  let hit = schoolsCache.find(s => stripSpaces(s.school_code) === kodNorm);
  if (hit) return hit;
  // 2) exact name match
  hit = schoolsCache.find(s => normUpper(s.name) === namaNorm);
  if (hit) return hit;
  // 3) startsWith / contains name
  hit = schoolsCache.find(s => normUpper(s.name).startsWith(namaNorm) || namaNorm.startsWith(normUpper(s.name)));
  if (hit) return hit;
  // 4) fuzzy: ignore commas / extra words
  const cleanedTarget = namaNorm.replace(/[,]/g, '').replace(/\s+IPOH$/i, '').trim();
  hit = schoolsCache.find(s => normUpper(s.name).replace(/[,]/g, '').includes(cleanedTarget) ||
    cleanedTarget.includes(normUpper(s.name).replace(/[,]/g, '')));
  if (hit) return hit;
  return null;
}

// -------------------------- xlsx parsing --------------------------
type ParsedPerson = {
  bil: string;
  name: string;
  ic: string;
  gender: string | null;
  race: string;
  membershipId: string;
  rawCategory: string; // e.g. PEMIMPIN / PENGAKAP KANAK-KANAK
  groupNumber: string;
  daerah: string;
  makanan: string | null;
  phone: string | null;
  email: string;
  masalah: string;
  masalahLain: string;
};

type ParsedFile = {
  file: string;
  schoolCode: string;
  schoolName: string;
  daerah: string;
  people: ParsedPerson[];
};

function parseFile(filePath: string, fileName: string): ParsedFile | null {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Info Peserta'];
  if (!ws) {
    console.warn(`  [SKIP] ${fileName}: sheet "Info Peserta" tiada`);
    return null;
  }
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
  const daerah = norm(rows[7]?.[2]);
  const schoolName = norm(rows[9]?.[2]);
  const schoolCode = norm(rows[10]?.[2]);

  const people: ParsedPerson[] = [];
  for (let i = 15; i < rows.length; i++) {
    const r = rows[i] || [];
    const bil = norm(r[0]);
    const name = norm(r[1]);
    const ic = norm(r[2]);
    if (!name || !ic) continue;
    if (!/^\d+$/.test(bil)) continue; // baris bukan peserta
    people.push({
      bil,
      name,
      ic,
      gender: normalizeGender(r[4]),
      race: normalizeRace(r[5]),
      membershipId: norm(r[6]),
      rawCategory: norm(r[7]),
      groupNumber: norm(r[8]),
      daerah: norm(r[9]),
      makanan: normalizeMakanan(r[10]),
      phone: formatPhone(r[11]),
      email: norm(r[12]),
      masalah: norm(r[13]),
      masalahLain: norm(r[14]),
    });
  }
  return { file: fileName, schoolCode, schoolName, daerah, people };
}

// -------------------------- main --------------------------
async function main() {
  console.log('Mode:', APPLY ? 'APPLY (insert ke DB)' : 'DRY-RUN (preview sahaja)');
  console.log('Folder:', SOURCE_DIR);

  const { data: badge } = await supabase.from('badges').select('id, name').eq('name', BADGE_NAME).maybeSingle();
  if (!badge) {
    console.error(`Badge "${BADGE_NAME}" tidak wujud dalam DB.`);
    process.exit(1);
  }
  console.log(`Badge: ${badge.name} (${badge.id})`);

  await loadSchools();
  console.log(`Schools loaded: ${schoolsCache.length}`);

  const files = readdirSync(SOURCE_DIR)
    .filter(f => f.toLowerCase().endsWith('.xlsx'))
    .filter(f => !SKIP_FILES.has(f));
  console.log(`\nFiles: ${files.length} (skipped ${SKIP_FILES.size} template fail)\n`);

  const parsed: ParsedFile[] = [];
  for (const f of files) {
    const pf = parseFile(resolve(SOURCE_DIR, f), f);
    if (pf) parsed.push(pf);
  }

  let totalPeople = 0;
  let unresolvedFiles: { file: string; schoolName: string; schoolCode: string }[] = [];
  const resolvedPlans: { file: ParsedFile; school: SchoolRow }[] = [];

  for (const pf of parsed) {
    const override = FILE_OVERRIDES[pf.file];
    let school: SchoolRow | null = null;

    if (override) {
      const codeToUse = override.forceCode || pf.schoolCode;
      const nameToUse = override.forceName || pf.schoolName;
      school = resolveSchool(codeToUse, nameToUse);
      if (!school && override.createIfMissing) {
        school = await ensureSchool(override.createIfMissing);
      }
    } else {
      school = resolveSchool(pf.schoolCode, pf.schoolName);
    }

    if (!school) {
      unresolvedFiles.push({ file: pf.file, schoolName: pf.schoolName, schoolCode: pf.schoolCode });
      continue;
    }
    resolvedPlans.push({ file: pf, school });
    totalPeople += pf.people.length;
    const tag = override ? '[OVR]' : 'OK  ';
    console.log(`${tag} ${pf.file}  ->  ${school.school_code} | ${school.name}  (${pf.people.length} orang)`);
  }

  if (unresolvedFiles.length) {
    console.log('\n[!] Sekolah tidak dijumpai dalam DB:');
    for (const u of unresolvedFiles) {
      console.log(`    ${u.file}  | kod="${u.schoolCode}"  nama="${u.schoolName}"`);
    }
  }

  console.log(`\nTotal: ${resolvedPlans.length} sekolah, ${totalPeople} rekod`);

  if (!APPLY) {
    if (WIPE_BEFORE_IMPORT) {
      console.log('\n[DRY-RUN] --wipe akan padam SEMUA submission untuk badge ni tahun 2026 sebelum re-import.');
    }
    console.log('\n[DRY-RUN] Tiada data dimasukkan. Jalankan semula dengan --apply untuk insert.');
    return;
  }

  // ============================ WIPE (optional) ============================
  if (WIPE_BEFORE_IMPORT) {
    console.log('\n[WIPE] Padam submission sedia ada untuk badge ' + BADGE_NAME + ' tahun ' + SUBMISSION_YEAR + '...');
    const { data: oldSubs, error: listErr } = await supabase
      .from('submissions')
      .select('id')
      .eq('badge_id', badge.id)
      .eq('submission_year', SUBMISSION_YEAR);
    if (listErr) throw listErr;
    const ids = (oldSubs || []).map((s: any) => s.id);
    if (ids.length === 0) {
      console.log('  (tiada submission sedia ada)');
    } else {
      const { error: delErr } = await supabase.from('submissions').delete().in('id', ids);
      if (delErr) throw delErr;
      console.log(`  ${ids.length} submission dipadam (cascade ke submission_people).`);
    }
    // padam school_badge_status juga
    await supabase.from('school_badge_status').delete()
      .eq('badge_id', badge.id)
      .eq('year', SUBMISSION_YEAR);
  }

  // ============================ INSERT ============================
  let insertedSubmissions = 0;
  let insertedPeople = 0;
  let errors = 0;

  for (const plan of resolvedPlans) {
    const { file, school } = plan;
    try {
      // upsert submission untuk school+badge+year
      let submissionId: string;
      const { data: existing } = await supabase
        .from('submissions')
        .select('id')
        .eq('school_id', school.id)
        .eq('badge_id', badge.id)
        .eq('submission_year', SUBMISSION_YEAR)
        .maybeSingle();

      if (existing) {
        submissionId = existing.id;
        console.log(`  -> submission sedia ada untuk ${school.school_code}, append peserta`);
      } else {
        const { data: ins, error: insErr } = await supabase.from('submissions').insert({
          school_id: school.id,
          badge_id: badge.id,
          submission_year: SUBMISSION_YEAR,
          submitted_at: SUBMITTED_AT,
          status: 'submitted',
          source: 'bulk_import',
          remarks: 'Import dari folder PERKHEMAHAN UDARA 2026',
        }).select('id').single();
        if (insErr || !ins) throw insErr || new Error('gagal insert submission');
        submissionId = ins.id;
        insertedSubmissions++;
      }

      // build rows
      const rows = file.people.map(p => {
        const isLeader = isLeaderCategory(p.rawCategory);
        const role = isLeader ? normalizeRole(p.rawCategory) : 'PESERTA';
        const category = isLeader ? null : (CATEGORY_MAP[normUpper(p.rawCategory)] || 'Pengakap Kanak-kanak');
        const masalahNorm = isLeader ? null : normalizeMasalah(p.masalah);
        const masalahLain = !isLeader && masalahNorm === 'Lain-lain'
          ? (p.masalah || p.masalahLain || null)
          : (p.masalahLain || null);

        const remarksParts: string[] = [];
        if (p.email) remarksParts.push(p.email);
        if (p.groupNumber) remarksParts.push(`Kumpulan ${p.groupNumber}`);

        return {
          submission_id: submissionId,
          name: normUpper(p.name),
          gender: p.gender,
          race: p.race || null,
          membership_id: normUpper(p.membershipId) || null,
          ic_number: formatIc(p.ic),
          phone_number: p.phone,
          role,
          category,
          unit: isLeader ? null : 'Udara',
          makanan: isLeader ? null : (p.makanan || 'Biasa'),
          masalah_kesihatan: masalahNorm,
          masalah_kesihatan_lain: masalahLain || null,
          remarks: remarksParts.join(' | ') || null,
        };
      });

      // chunk insert (50)
      const CHUNK = 50;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error: pErr } = await supabase.from('submission_people').insert(slice);
        if (pErr) {
          console.error(`  [ERR] ${file.file} batch ${i}: ${pErr.message}`);
          errors += slice.length;
        } else {
          insertedPeople += slice.length;
        }
      }

      // upsert school_badge_status
      await supabase.from('school_badge_status').upsert({
        school_id: school.id,
        badge_id: badge.id,
        year: SUBMISSION_YEAR,
        status: 'submitted',
        submitted_at: SUBMITTED_AT,
      }, { onConflict: 'school_id,badge_id,year' });

      console.log(`  [OK] ${file.file}: ${rows.length} rekod`);
    } catch (e: any) {
      console.error(`  [FAIL] ${plan.file.file}: ${e.message || e}`);
      errors++;
    }
  }

  console.log('\n============ REPORT ============');
  console.log(`Submissions baru:      ${insertedSubmissions}`);
  console.log(`Peserta dimasukkan:    ${insertedPeople}`);
  console.log(`Sekolah tak dijumpai:  ${unresolvedFiles.length}`);
  console.log(`Errors:                ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
