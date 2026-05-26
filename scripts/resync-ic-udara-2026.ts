/**
 * Re-sync IC numbers dari fail xlsx ke Supabase untuk badge Pengenalan Pengakap Udara 2026.
 * Match peserta ikut Membership ID + sekolah, kemudian update IC kalau berbeza.
 *
 * Rules:
 *   - Kalau IC 12-digit number (atau 12 digit string), format ke XXXXXX-XX-XXXX.
 *   - Kalau bukan 12 digit (mis. passport asing), guna apa yang ada dalam xlsx (uppercase, no spaces).
 *
 * Usage:
 *   npx tsx scripts/resync-ic-udara-2026.ts             # dry-run
 *   npx tsx scripts/resync-ic-udara-2026.ts --apply     # update DB
 *   npx tsx scripts/resync-ic-udara-2026.ts --school=SK_PENGKALAN.xlsx  # filter fail
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
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');
const SOURCE_DIR = resolve(__dirname, '..', 'PERKHEMAHAN UDARA 2026');
const BADGE_ID = '3ae0a641-f71f-4ace-9119-a870d9f50180';
const YEAR = 2026;

const SKIP_FILES = new Set<string>(['_1.BORANG KELOMPOK PERKHEMAHAN UDARA 2026.xlsx']);
const FILE_OVERRIDES: Record<string, { forceCode?: string }> = {
  'SK PENGKALAN.xlsx': { forceCode: 'ABA2057' },
  'SMK RAJA PEREMPUAN.xlsx': { forceCode: 'AEB2046' },
  'SEKOLAH IZZUDDIN SHAH.xlsx': { forceCode: 'AXM2001' },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const norm = (v: any) => (v == null ? '' : String(v).trim());
const stripSpaces = (v: any) => norm(v).replace(/\s+/g, '').toUpperCase();
const normUpper = (v: any) => norm(v).toUpperCase().replace(/\s+/g, ' ');

/**
 * Format IC dari nilai xlsx.
 * - Kalau number atau string 12 digit -> XXXXXX-XX-XXXX
 * - Kalau pendek dari 12 digit (Excel buang leading zero) -> pad dengan 0 then format
 * - Kalau ada huruf (passport) -> return as-is uppercase, no spaces
 */
function formatIcOrPassport(v: any): { value: string | null; isPassport: boolean } {
  if (v == null || v === '') return { value: null, isPassport: false };

  // Number from Excel (e.g. 160819080743)
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = String(Math.round(v)).padStart(12, '0');
    if (s.length === 12) return { value: `${s.slice(0,6)}-${s.slice(6,8)}-${s.slice(8)}`, isPassport: false };
    return { value: s, isPassport: false };
  }

  const raw = norm(v);
  // Has letters? Treat as passport - keep as-is uppercase, no spaces
  if (/[A-Za-z]/.test(raw)) {
    return { value: raw.replace(/\s+/g, '').toUpperCase(), isPassport: true };
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) return { value: `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`, isPassport: false };
  if (digits.length > 0 && digits.length < 12) {
    const padded = digits.padStart(12, '0');
    return { value: `${padded.slice(0,6)}-${padded.slice(6,8)}-${padded.slice(8)}`, isPassport: false };
  }
  return { value: raw || null, isPassport: false };
}

type XlsxPerson = { name: string; ic: string | null; isPassport: boolean; membershipId: string };
type XlsxFile = { file: string; schoolCode: string; people: XlsxPerson[] };

function parseFile(filePath: string, fileName: string): XlsxFile | null {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Info Peserta'];
  if (!ws) return null;
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  const schoolCode = stripSpaces(rows[10]?.[2]);
  const people: XlsxPerson[] = [];
  for (let i = 15; i < rows.length; i++) {
    const r = rows[i] || [];
    const bil = r[0];
    const name = norm(r[1]);
    const icRaw = r[2];
    if (!name || !icRaw) continue;
    if (typeof bil !== 'number' && !/^\d+$/.test(String(bil || ''))) continue;
    const fmt = formatIcOrPassport(icRaw);
    people.push({
      name: normUpper(name),
      ic: fmt.value,
      isPassport: fmt.isPassport,
      membershipId: normUpper(r[6]),
    });
  }
  return { file: fileName, schoolCode, people };
}

async function main() {
  console.log('Mode:', APPLY ? 'APPLY (update DB)' : 'DRY-RUN');

  // Get all submissions for badge+year
  const { data: subs } = await supabase
    .from('submissions')
    .select('id, school_id, schools(school_code, name)')
    .eq('badge_id', BADGE_ID)
    .eq('submission_year', YEAR);
  if (!subs) throw new Error('no submissions');
  const submissionByCode: Record<string, string> = {};
  for (const s of subs as any[]) submissionByCode[s.schools.school_code] = s.id;

  const files = readdirSync(SOURCE_DIR)
    .filter(f => f.toLowerCase().endsWith('.xlsx'))
    .filter(f => !SKIP_FILES.has(f));

  let totalDiff = 0, totalApplied = 0, totalSkipped = 0;
  const passportRecords: { school: string; name: string; passport: string }[] = [];

  for (const f of files) {
    const parsed = parseFile(resolve(SOURCE_DIR, f), f);
    if (!parsed) continue;

    const override = FILE_OVERRIDES[f];
    const codeToUse = override?.forceCode || parsed.schoolCode;
    const submissionId = submissionByCode[codeToUse];
    if (!submissionId) {
      console.log(`[SKIP] ${f}: no submission for ${codeToUse}`);
      continue;
    }

    // Load current DB rows for this submission
    const { data: dbRows } = await supabase
      .from('submission_people')
      .select('id, name, ic_number, membership_id')
      .eq('submission_id', submissionId);

    // Match strategy: PRIORITY name (paling unique dalam sekolah), fallback memID.
    // Skip kalau ambiguous (>1 match) untuk elak corrupt data.
    const dbByName: Record<string, any[]> = {};
    const dbByMemId: Record<string, any[]> = {};
    for (const r of dbRows || []) {
      (dbByName[r.name] = dbByName[r.name] || []).push(r);
      if (r.membership_id) (dbByMemId[r.membership_id] = dbByMemId[r.membership_id] || []).push(r);
    }

    for (const xp of parsed.people) {
      if (xp.isPassport) {
        passportRecords.push({ school: codeToUse, name: xp.name, passport: xp.ic || '' });
      }

      let dbRow: any = null;
      let matchBy = '';
      // 1) Match by NAME (unique)
      const nameHits = dbByName[xp.name] || [];
      if (nameHits.length === 1) { dbRow = nameHits[0]; matchBy = 'name'; }
      // 2) Match by MemID (unique)
      else if (xp.membershipId && dbByMemId[xp.membershipId]?.length === 1) {
        dbRow = dbByMemId[xp.membershipId][0]; matchBy = 'memID';
      }
      // 3) Match by NAME + MemID combo (when both ambiguous individually)
      else if (xp.membershipId) {
        const combo = (dbByMemId[xp.membershipId] || []).filter(r => r.name === xp.name);
        if (combo.length === 1) { dbRow = combo[0]; matchBy = 'name+memID'; }
      }

      if (!dbRow) {
        console.log(`  [NOT-FOUND] ${codeToUse} | ${xp.name} | memID=${xp.membershipId}`);
        totalSkipped++;
        continue;
      }
      if (dbRow.ic_number === xp.ic) continue;

      totalDiff++;
      console.log(`  [DIFF/${matchBy}] ${codeToUse} | ${xp.name}: "${dbRow.ic_number}" -> "${xp.ic}"${xp.isPassport ? ' [PASSPORT]' : ''}`);
      if (APPLY) {
        const { error } = await supabase
          .from('submission_people')
          .update({ ic_number: xp.ic })
          .eq('id', dbRow.id);
        if (error) console.error('    update error:', error.message);
        else totalApplied++;
      }
    }
  }

  console.log('\n============ REPORT ============');
  console.log('Rekod IC berbeza :', totalDiff);
  console.log('Rekod tak jumpa  :', totalSkipped);
  if (APPLY) console.log('Rekod diupdate   :', totalApplied);

  if (passportRecords.length) {
    console.log(`\nPassport detected (${passportRecords.length} rekod):`);
    for (const p of passportRecords) console.log('  ', p.school, '|', p.name, '| passport=', p.passport);
  }
  if (!APPLY) console.log('\n[DRY-RUN] Jalankan dengan --apply untuk update.');
}

main().catch(e => { console.error(e); process.exit(1); });
