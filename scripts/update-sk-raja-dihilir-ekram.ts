/**
 * Update database untuk SK RAJA DIHILIR EKRAM (ABB2077) sahaja.
 * Source: PERKHEMAHAN UDARA 2026/SK RAJA DIHILIR EKRAM.xlsx
 * Badge:  Pengenalan Pengakap Udara, year 2026.
 *
 *   npx tsx scripts/update-sk-raja-dihilir-ekram.ts          # dry-run
 *   npx tsx scripts/update-sk-raja-dihilir-ekram.ts --apply  # apply update
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY perlu di .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const FILE = resolve(__dirname, '..', 'PERKHEMAHAN UDARA 2026', 'SK RAJA DIHILIR EKRAM.xlsx');
const SCHOOL_CODE = 'ABB2077';
const BADGE_NAME = 'Pengenalan Pengakap Udara';
const SUBMISSION_YEAR = 2026;
const SUBMITTED_AT = '2026-06-12T00:00:00.000Z';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const norm = (v: any) => (v == null ? '' : String(v).trim());
const normUpper = (v: any) => norm(v).toUpperCase().replace(/\s+/g, ' ');

const formatIc = (v: any): string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = String(Math.round(v)).padStart(12, '0');
    if (s.length === 12) return `${s.slice(0, 6)}-${s.slice(6, 8)}-${s.slice(8)}`;
    return s;
  }
  const digits = norm(v).replace(/\D/g, '');
  if (digits.length === 12) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  if (digits.length > 0 && digits.length < 12) {
    const padded = digits.padStart(12, '0');
    return `${padded.slice(0, 6)}-${padded.slice(6, 8)}-${padded.slice(8)}`;
  }
  return norm(v) || null;
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

const normalizeMakanan = (v: any): string => {
  const r = normUpper(v);
  if (r === 'VEGETARIAN' || r === 'VEGE') return 'Vegetarian';
  return 'Biasa';
};

const normalizeMasalah = (v: any): string => {
  const r = normUpper(v);
  if (!r || r === 'TIADA' || r === '-') return 'Tiada';
  if (['ALAHAN', 'ASMA', 'GASTRIK', 'MIGRAIN'].includes(r)) {
    return r.charAt(0) + r.slice(1).toLowerCase();
  }
  if (r === 'PENYAKIT JANTUNG') return 'Penyakit Jantung';
  if (r === 'PENYAKIT KRONIK') return 'Penyakit Kronik';
  return 'Lain-lain';
};

type Person = {
  name: string;
  ic: string;
  gender: string | null;
  race: string;
  membershipId: string;
  rawCategory: string;
  groupNumber: string;
  makanan: string;
  phone: string | null;
  email: string;
  masalah: string;
  masalahLain: string;
};

function parseFile(): { schoolCode: string; schoolName: string; people: Person[] } {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets['Info Peserta'];
  if (!ws) throw new Error('Sheet "Info Peserta" tiada');
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
  const schoolName = norm(rows[9]?.[2]);
  const schoolCode = norm(rows[10]?.[2]);
  const people: Person[] = [];
  for (let i = 15; i < rows.length; i++) {
    const r = rows[i] || [];
    const bil = norm(r[0]);
    const name = norm(r[1]);
    const ic = norm(r[2]);
    if (!name || !ic) continue;
    if (!/^\d+$/.test(bil)) continue;
    people.push({
      name,
      ic,
      gender: normalizeGender(r[4]),
      race: normUpper(r[5]),
      membershipId: norm(r[6]),
      rawCategory: norm(r[7]),
      groupNumber: norm(r[8]),
      makanan: normalizeMakanan(r[10]),
      phone: formatPhone(r[11]),
      email: norm(r[12]),
      masalah: norm(r[13]),
      masalahLain: norm(r[14]),
    });
  }
  return { schoolCode, schoolName, people };
}

async function main() {
  console.log('Mode:', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('File:', FILE);

  const parsed = parseFile();
  console.log(`Sekolah xlsx: ${parsed.schoolCode} | ${parsed.schoolName}  (${parsed.people.length} orang)`);
  if (parsed.schoolCode !== SCHOOL_CODE) {
    console.warn(`[!] Kod sekolah dalam xlsx (${parsed.schoolCode}) tidak sama dengan yang dijangka (${SCHOOL_CODE}).`);
  }

  const { data: school, error: sErr } = await supabase
    .from('schools').select('id, school_code, name').eq('school_code', SCHOOL_CODE).maybeSingle();
  if (sErr) throw sErr;
  if (!school) throw new Error(`Sekolah ${SCHOOL_CODE} tiada dalam DB`);
  console.log(`Sekolah DB: ${school.school_code} | ${school.name} (${school.id})`);

  const { data: badge } = await supabase
    .from('badges').select('id, name').eq('name', BADGE_NAME).maybeSingle();
  if (!badge) throw new Error(`Badge "${BADGE_NAME}" tiada dalam DB`);

  const { data: existingSub } = await supabase
    .from('submissions').select('id')
    .eq('school_id', school.id).eq('badge_id', badge.id).eq('submission_year', SUBMISSION_YEAR).maybeSingle();

  let submissionId = existingSub?.id || null;
  console.log('Existing submission:', submissionId || '(none)');

  if (submissionId) {
    const { data: existingPeople } = await supabase
      .from('submission_people')
      .select('id, name, ic_number, membership_id, phone_number, remarks')
      .eq('submission_id', submissionId);
    console.log(`Rekod sedia ada: ${existingPeople?.length || 0}`);
    for (const p of existingPeople || []) {
      console.log(`  - ${p.name} | ${p.ic_number} | mid=${p.membership_id} | phone=${p.phone_number}`);
    }
  }

  console.log('\n=== Plan ===');
  console.log(`- Padam ${submissionId ? 'semua' : '0'} rekod submission_people sedia ada`);
  console.log(`- Insert ${parsed.people.length} rekod baru:`);
  const newRows = parsed.people.map(p => {
    const isLeader = isLeaderCategory(p.rawCategory);
    const role = isLeader ? normalizeRole(p.rawCategory) : 'PESERTA';
    const category = isLeader ? null : (CATEGORY_MAP[normUpper(p.rawCategory)] || 'Pengakap Kanak-kanak');
    const masalahNorm = isLeader ? null : normalizeMasalah(p.masalah);
    const masalahLain = !isLeader && masalahNorm === 'Lain-lain' ? (p.masalah || p.masalahLain || null) : (p.masalahLain || null);
    const remarksParts: string[] = [];
    if (p.email) remarksParts.push(p.email);
    if (p.groupNumber) remarksParts.push(`Kumpulan ${p.groupNumber}`);
    return {
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
  for (const r of newRows) {
    console.log(`  + ${r.name} | ${r.ic_number} | mid=${r.membership_id} | phone=${r.phone_number} | ${r.role}/${r.category || '-'}`);
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] Tiada perubahan dilakukan. Jalankan semula dengan --apply.');
    return;
  }

  if (!submissionId) {
    const { data: ins, error: insErr } = await supabase.from('submissions').insert({
      school_id: school.id,
      badge_id: badge.id,
      submission_year: SUBMISSION_YEAR,
      submitted_at: SUBMITTED_AT,
      status: 'submitted',
      source: 'bulk_import',
      remarks: 'Update dari fail xlsx (PERKHEMAHAN UDARA 2026)',
    }).select('id').single();
    if (insErr || !ins) throw insErr || new Error('gagal cipta submission');
    submissionId = ins.id;
    console.log(`Submission baru dicipta: ${submissionId}`);
  } else {
    const { error: delErr } = await supabase
      .from('submission_people').delete().eq('submission_id', submissionId);
    if (delErr) throw delErr;
    console.log('Rekod submission_people sedia ada dipadam.');
  }

  const payload = newRows.map(r => ({ ...r, submission_id: submissionId }));
  const { error: pErr } = await supabase.from('submission_people').insert(payload);
  if (pErr) throw pErr;
  console.log(`Insert ${payload.length} rekod baru: OK`);

  await supabase.from('school_badge_status').upsert({
    school_id: school.id,
    badge_id: badge.id,
    year: SUBMISSION_YEAR,
    status: 'submitted',
    submitted_at: SUBMITTED_AT,
  }, { onConflict: 'school_id,badge_id,year' });

  console.log('\n[DONE] SK RAJA DIHILIR EKRAM dikemas kini.');
}

main().catch(e => { console.error(e); process.exit(1); });
