import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EXCEL_FILE = resolve(__dirname, '..', 'Sistem Pendaftaran Pengakap.xlsx');
const normalize = (v?: any) => (v == null ? '' : String(v).trim().toUpperCase());

function excelDateToISO(serial: number | string): string {
  if (typeof serial === 'string') return serial || new Date().toISOString();
  if (!serial || serial < 1) return new Date().toISOString();
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  return new Date(utcValue).toISOString();
}

interface Stats { fetched: number; inserted: number; skipped: number; errors: number; }

const stats = {
  submissions: { fetched: 0, inserted: 0, skipped: 0, errors: 0 } as Stats,
  profiles: { fetched: 0, inserted: 0, skipped: 0, errors: 0 } as Stats,
};

async function importSubmissions(wb: XLSX.WorkBook) {
  console.log('\n📝 Importing DATA sheet (submissions)...');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['DATA'], { header: 1, defval: '' });
  const dataRows = rows.slice(1).filter(r => r[0] !== '');
  stats.submissions.fetched = dataRows.length;
  console.log(`  Found ${dataRows.length} submission rows`);

  // Cache lookups
  const schoolCache = new Map<string, string>();
  const badgeCache = new Map<string, string>();
  const submissionCache = new Map<string, string>();

  let batchCount = 0;
  const BATCH_SIZE = 50;
  let peopleBatch: any[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const [dateRaw, school, schoolCode, negeriCode, daerahCode, badge, student, gender, race, id, ic, phone, role, remarks] = row;

    if (!student || !schoolCode || !badge) {
      stats.submissions.skipped++;
      continue;
    }

    try {
      // Get school_id
      let schoolId = schoolCache.get(normalize(schoolCode));
      if (!schoolId) {
        const { data } = await supabase.from('schools').select('id').eq('school_code', normalize(schoolCode)).maybeSingle();
        if (!data) { stats.submissions.skipped++; continue; }
        schoolId = data.id;
        schoolCache.set(normalize(schoolCode), schoolId);
      }

      // Get badge_id
      const badgeName = badge.toString().trim();
      let badgeId = badgeCache.get(badgeName);
      if (!badgeId) {
        const { data } = await supabase.from('badges').select('id').eq('name', badgeName).maybeSingle();
        if (!data) { stats.submissions.skipped++; continue; }
        badgeId = data.id;
        badgeCache.set(badgeName, badgeId);
      }

      // Get or create submission
      const submittedAt = excelDateToISO(dateRaw);
      const year = new Date(submittedAt).getFullYear();
      const subKey = `${schoolId}-${badgeId}-${year}`;

      let submissionId = submissionCache.get(subKey);
      if (!submissionId) {
        const { data: existing } = await supabase.from('submissions')
          .select('id')
          .eq('school_id', schoolId)
          .eq('badge_id', badgeId)
          .eq('submission_year', year)
          .maybeSingle();

        if (existing) {
          submissionId = existing.id;
        } else {
          const { data: newSub, error } = await supabase.from('submissions').insert({
            school_id: schoolId,
            badge_id: badgeId,
            submission_year: year,
            submitted_at: submittedAt,
            status: 'submitted',
            source: 'migration',
          }).select('id').single();
          if (error) { console.error(`  Error creating submission:`, error.message); stats.submissions.errors++; continue; }
          submissionId = newSub.id;
        }
        submissionCache.set(subKey, submissionId);
      }

      // Parse category from remarks
      const remarksStr = String(remarks || '');
      const categoryMatch = remarksStr.match(/\[Kategori:\s*([^\]]+)\]/i);
      const category = categoryMatch ? categoryMatch[1] : null;
      const cleanRemarks = remarksStr.replace(/\[Kategori:\s*[^\]]+\]\s*/i, '').trim();

      peopleBatch.push({
        submission_id: submissionId,
        name: normalize(student),
        gender: gender || null,
        race: race || null,
        membership_id: normalize(id),
        ic_number: ic ? String(ic) : null,
        phone_number: phone ? String(phone) : null,
        role: role || 'PESERTA',
        category,
        remarks: cleanRemarks || null,
      });

      if (peopleBatch.length >= BATCH_SIZE) {
        const { error } = await supabase.from('submission_people').insert(peopleBatch);
        if (error) {
          console.error(`  Batch insert error:`, error.message);
          stats.submissions.errors += peopleBatch.length;
        } else {
          stats.submissions.inserted += peopleBatch.length;
        }
        batchCount++;
        if (batchCount % 10 === 0) console.log(`  ... processed ${batchCount * BATCH_SIZE} rows`);
        peopleBatch = [];
      }
    } catch (err: any) {
      console.error(`  Error row ${i}:`, err.message);
      stats.submissions.errors++;
    }
  }

  // Flush remaining
  if (peopleBatch.length > 0) {
    const { error } = await supabase.from('submission_people').insert(peopleBatch);
    if (error) {
      console.error(`  Final batch error:`, error.message);
      stats.submissions.errors += peopleBatch.length;
    } else {
      stats.submissions.inserted += peopleBatch.length;
    }
  }

  console.log(`  Done: ${stats.submissions.inserted} inserted, ${stats.submissions.skipped} skipped, ${stats.submissions.errors} errors`);
}

async function importProfiles(wb: XLSX.WorkBook) {
  console.log('\n👤 Importing USER_PROFILES sheet...');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['USER_PROFILES'], { header: 1, defval: '' });
  const dataRows = rows.slice(1).filter(r => r[0] !== '');
  stats.profiles.fetched = dataRows.length;
  console.log(`  Found ${dataRows.length} profile rows`);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const [schoolCode, schoolName, phone, groupNumber, principalName, principalPhone, leaderName, leaderPhone, leaderIC, leaderGender, leaderMembershipId, leaderRace, remarks, lastUpdated] = row;

    if (!schoolCode) { stats.profiles.skipped++; continue; }

    try {
      const { data: school } = await supabase.from('schools').select('id').eq('school_code', normalize(schoolCode)).maybeSingle();
      if (!school) { stats.profiles.skipped++; continue; }

      const { error } = await supabase.from('school_profiles').upsert({
        school_id: school.id,
        principal_name: principalName ? normalize(principalName) : null,
        principal_phone: principalPhone ? String(principalPhone) : null,
        leader_name: leaderName ? normalize(leaderName) : null,
        leader_phone: leaderPhone ? String(leaderPhone) : null,
        leader_ic: leaderIC ? String(leaderIC) : null,
        leader_gender: leaderGender || null,
        leader_membership_id: leaderMembershipId ? normalize(leaderMembershipId) : null,
        leader_race: leaderRace || null,
        remarks: remarks || null,
      }, { onConflict: 'school_id' });

      if (error) {
        console.error(`  Error profile ${schoolCode}:`, error.message);
        stats.profiles.errors++;
      } else {
        stats.profiles.inserted++;
      }
    } catch (err: any) {
      console.error(`  Error profile ${schoolCode}:`, err.message);
      stats.profiles.errors++;
    }
  }

  console.log(`  Done: ${stats.profiles.inserted} inserted, ${stats.profiles.skipped} skipped, ${stats.profiles.errors} errors`);
}

async function main() {
  console.log('🚀 Importing Excel data to Supabase...');
  console.log(`  File: ${EXCEL_FILE}\n`);

  const wb = XLSX.readFile(EXCEL_FILE);

  await importSubmissions(wb);
  await importProfiles(wb);

  console.log('\n\n📊 IMPORT REPORT');
  console.log('='.repeat(50));
  console.log(`\nSubmissions:`);
  console.log(`  Fetched:  ${stats.submissions.fetched}`);
  console.log(`  Inserted: ${stats.submissions.inserted}`);
  console.log(`  Skipped:  ${stats.submissions.skipped}`);
  console.log(`  Errors:   ${stats.submissions.errors}`);
  console.log(`\nProfiles:`);
  console.log(`  Fetched:  ${stats.profiles.fetched}`);
  console.log(`  Inserted: ${stats.profiles.inserted}`);
  console.log(`  Skipped:  ${stats.profiles.skipped}`);
  console.log(`  Errors:   ${stats.profiles.errors}`);
  console.log('='.repeat(50));

  const totalErrors = stats.submissions.errors + stats.profiles.errors;
  if (totalErrors === 0) {
    console.log('\n✅ Import completed successfully!');
  } else {
    console.log(`\n⚠️  Import completed with ${totalErrors} errors.`);
  }
}

main();
