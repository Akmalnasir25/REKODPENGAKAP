/**
 * MIGRATION SCRIPT: Google Apps Script (GAS) to Supabase
 * 
 * This script migrates all data from Google Sheets (via GAS API) to Supabase.
 * 
 * PREREQUISITES:
 * 1. Supabase migrations (001_schema.sql, 002_rls_policies.sql, 002_seed_schools.sql) must be applied
 * 2. GAS API must be accessible
 * 3. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env
 * 
 * USAGE:
 * npx tsx scripts/migrate-gas-to-supabase.ts
 * 
 * STEPS:
 * 1. Fetch all data from GAS (negeri, daerah, schools, badges, submissions, profiles)
 * 2. Transform data to match Supabase schema
 * 3. Insert into Supabase with conflict handling
 * 4. Verify migration success
 * 5. Generate migration report
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const GAS_API_URL = process.env.GAS_API_URL || 'https://script.google.com/macros/s/YOUR_GAS_DEPLOYMENT_ID/exec';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required. Set it in .env file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface MigrationStats {
  negeri: { fetched: number; inserted: number; skipped: number; errors: number };
  daerah: { fetched: number; inserted: number; skipped: number; errors: number };
  schools: { fetched: number; inserted: number; skipped: number; errors: number };
  badges: { fetched: number; inserted: number; skipped: number; errors: number };
  submissions: { fetched: number; inserted: number; skipped: number; errors: number };
  profiles: { fetched: number; inserted: number; skipped: number; errors: number };
}

const stats: MigrationStats = {
  negeri: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  daerah: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  schools: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  badges: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  submissions: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  profiles: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
};

const normalize = (value?: string) => (value || '').trim().toUpperCase();

async function fetchGASData() {
  console.log('📡 Fetching data from Google Apps Script...');
  const response = await fetch(`${GAS_API_URL}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`GAS API error: ${response.statusText}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`GAS API returned error: ${data.message}`);
  return data;
}

async function migrateNegeri(negeriList: any[]) {
  console.log('\n🏛️  Migrating Negeri...');
  stats.negeri.fetched = negeriList.length;
  
  for (const n of negeriList) {
    try {
      const { error } = await supabase.from('negeri').upsert({
        code: normalize(n.code),
        name: n.name.trim(),
        created_at: n.createdDate || new Date().toISOString(),
      }, { onConflict: 'code' });
      
      if (error) {
        console.error(`  ❌ Error inserting negeri ${n.code}:`, error.message);
        stats.negeri.errors++;
      } else {
        stats.negeri.inserted++;
        console.log(`  ✅ Negeri ${n.code} - ${n.name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for negeri ${n.code}:`, err.message);
      stats.negeri.errors++;
    }
  }
}

async function migrateDaerah(daerahList: any[]) {
  console.log('\n🏘️  Migrating Daerah...');
  stats.daerah.fetched = daerahList.length;
  
  for (const d of daerahList) {
    try {
      const { data: negeri } = await supabase.from('negeri').select('id').eq('code', normalize(d.negeriCode)).maybeSingle();
      if (!negeri) {
        console.error(`  ⚠️  Negeri ${d.negeriCode} not found for daerah ${d.code}, skipping`);
        stats.daerah.skipped++;
        continue;
      }
      
      const { error } = await supabase.from('daerah').upsert({
        code: normalize(d.code),
        name: d.name.trim(),
        negeri_id: negeri.id,
        created_at: d.createdDate || new Date().toISOString(),
      }, { onConflict: 'code' });
      
      if (error) {
        console.error(`  ❌ Error inserting daerah ${d.code}:`, error.message);
        stats.daerah.errors++;
      } else {
        stats.daerah.inserted++;
        console.log(`  ✅ Daerah ${d.code} - ${d.name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for daerah ${d.code}:`, err.message);
      stats.daerah.errors++;
    }
  }
}

async function migrateSchools(schools: any[]) {
  console.log('\n🏫 Migrating Schools...');
  stats.schools.fetched = schools.length;
  
  for (const s of schools) {
    try {
      let negeriId = null;
      let daerahId = null;
      
      if (s.negeriCode) {
        const { data: negeri } = await supabase.from('negeri').select('id').eq('code', normalize(s.negeriCode)).maybeSingle();
        negeriId = negeri?.id || null;
      }
      
      if (s.daerahCode) {
        const { data: daerah } = await supabase.from('daerah').select('id').eq('code', normalize(s.daerahCode)).maybeSingle();
        daerahId = daerah?.id || null;
      }
      
      const { error } = await supabase.from('schools').upsert({
        name: normalize(s.name),
        school_code: normalize(s.schoolCode || s.name),
        negeri_id: negeriId,
        daerah_id: daerahId,
        allow_students: s.allowStudents !== false,
        allow_assistants: s.allowAssistants !== false,
        allow_examiners: s.allowExaminers !== false,
        is_active: true,
      }, { onConflict: 'school_code' });
      
      if (error) {
        console.error(`  ❌ Error inserting school ${s.schoolCode || s.name}:`, error.message);
        stats.schools.errors++;
      } else {
        stats.schools.inserted++;
        console.log(`  ✅ School ${s.schoolCode || s.name} - ${s.name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for school ${s.schoolCode || s.name}:`, err.message);
      stats.schools.errors++;
    }
  }
}

async function migrateBadges(badges: any[]) {
  console.log('\n🏅 Migrating Badges...');
  stats.badges.fetched = badges.length;
  
  for (const b of badges) {
    try {
      const { error } = await supabase.from('badges').upsert({
        name: b.name.trim(),
        is_open: b.isOpen !== false,
        deadline: b.deadline || null,
      }, { onConflict: 'name' });
      
      if (error) {
        console.error(`  ❌ Error inserting badge ${b.name}:`, error.message);
        stats.badges.errors++;
      } else {
        stats.badges.inserted++;
        console.log(`  ✅ Badge ${b.name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for badge ${b.name}:`, err.message);
      stats.badges.errors++;
    }
  }
}

async function migrateSubmissions(submissions: any[]) {
  console.log('\n📝 Migrating Submissions...');
  stats.submissions.fetched = submissions.length;
  
  const submissionMap = new Map<string, any>();
  
  for (const sub of submissions) {
    try {
      const { data: school } = await supabase.from('schools').select('id').eq('school_code', normalize(sub.schoolCode || sub.school)).maybeSingle();
      if (!school) {
        console.error(`  ⚠️  School ${sub.schoolCode || sub.school} not found, skipping submission`);
        stats.submissions.skipped++;
        continue;
      }
      
      const { data: badge } = await supabase.from('badges').select('id').eq('name', sub.badge.trim()).maybeSingle();
      if (!badge) {
        console.error(`  ⚠️  Badge ${sub.badge} not found, skipping submission`);
        stats.submissions.skipped++;
        continue;
      }
      
      const submittedAt = sub.date || new Date().toISOString();
      const year = new Date(submittedAt).getFullYear();
      const key = `${school.id}-${badge.id}-${year}-${submittedAt}`;
      
      if (!submissionMap.has(key)) {
        const { data: newSub, error: subError } = await supabase.from('submissions').insert({
          school_id: school.id,
          badge_id: badge.id,
          submission_year: year,
          submitted_at: submittedAt,
          status: 'submitted',
          source: 'migration',
          remarks: sub.remarks || null,
        }).select('id').single();
        
        if (subError) {
          console.error(`  ❌ Error creating submission:`, subError.message);
          stats.submissions.errors++;
          continue;
        }
        
        submissionMap.set(key, newSub.id);
      }
      
      const submissionId = submissionMap.get(key);
      
      const { error: personError } = await supabase.from('submission_people').insert({
        submission_id: submissionId,
        name: normalize(sub.student),
        gender: sub.gender || null,
        race: sub.race || null,
        membership_id: normalize(sub.id),
        ic_number: sub.icNumber || null,
        phone_number: sub.studentPhone || null,
        role: sub.role || 'PESERTA',
        category: sub.category || null,
        remarks: sub.remarks || null,
      });
      
      if (personError) {
        console.error(`  ❌ Error inserting person ${sub.student}:`, personError.message);
        stats.submissions.errors++;
      } else {
        stats.submissions.inserted++;
        console.log(`  ✅ Submission ${sub.student} - ${sub.badge} (${year})`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for submission ${sub.student}:`, err.message);
      stats.submissions.errors++;
    }
  }
}

async function migrateProfiles(profiles: any[]) {
  console.log('\n👤 Migrating School Profiles...');
  stats.profiles.fetched = profiles.length;
  
  for (const p of profiles) {
    try {
      const { data: school } = await supabase.from('schools').select('id').eq('school_code', normalize(p.schoolCode)).maybeSingle();
      if (!school) {
        console.error(`  ⚠️  School ${p.schoolCode} not found, skipping profile`);
        stats.profiles.skipped++;
        continue;
      }
      
      const { error } = await supabase.from('school_profiles').upsert({
        school_id: school.id,
        principal_name: normalize(p.principalName),
        principal_phone: p.principalPhone || null,
        leader_name: normalize(p.leaderName),
        leader_phone: p.leaderPhone || null,
        leader_ic: p.leaderIC || null,
        leader_gender: p.leaderGender || null,
        leader_membership_id: p.leaderMembershipId || null,
        leader_race: p.leaderRace || null,
        remarks: p.remarks || null,
      }, { onConflict: 'school_id' });
      
      if (error) {
        console.error(`  ❌ Error inserting profile for ${p.schoolCode}:`, error.message);
        stats.profiles.errors++;
      } else {
        stats.profiles.inserted++;
        console.log(`  ✅ Profile ${p.schoolCode} - ${p.schoolName}`);
      }
    } catch (err: any) {
      console.error(`  ❌ Exception for profile ${p.schoolCode}:`, err.message);
      stats.profiles.errors++;
    }
  }
}

function printReport() {
  console.log('\n\n📊 MIGRATION REPORT');
  console.log('='.repeat(60));
  
  const sections = [
    { name: 'Negeri', stats: stats.negeri },
    { name: 'Daerah', stats: stats.daerah },
    { name: 'Schools', stats: stats.schools },
    { name: 'Badges', stats: stats.badges },
    { name: 'Submissions', stats: stats.submissions },
    { name: 'Profiles', stats: stats.profiles },
  ];
  
  for (const section of sections) {
    console.log(`\n${section.name}:`);
    console.log(`  Fetched:  ${section.stats.fetched}`);
    console.log(`  Inserted: ${section.stats.inserted}`);
    console.log(`  Skipped:  ${section.stats.skipped}`);
    console.log(`  Errors:   ${section.stats.errors}`);
  }
  
  const totalFetched = Object.values(stats).reduce((sum, s) => sum + s.fetched, 0);
  const totalInserted = Object.values(stats).reduce((sum, s) => sum + s.inserted, 0);
  const totalSkipped = Object.values(stats).reduce((sum, s) => sum + s.skipped, 0);
  const totalErrors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
  
  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL:`);
  console.log(`  Fetched:  ${totalFetched}`);
  console.log(`  Inserted: ${totalInserted}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Errors:   ${totalErrors}`);
  console.log('='.repeat(60));
  
  if (totalErrors === 0) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log(`\n⚠️  Migration completed with ${totalErrors} errors. Review logs above.`);
  }
}

async function main() {
  console.log('🚀 Starting GAS to Supabase Migration...\n');
  
  try {
    const gasData = await fetchGASData();
    
    await migrateNegeri(gasData.negeriList || []);
    await migrateDaerah(gasData.daerahList || []);
    await migrateSchools(gasData.schools || []);
    await migrateBadges(gasData.badges || []);
    await migrateSubmissions(gasData.submissions || []);
    await migrateProfiles(gasData.userProfiles || []);
    
    printReport();
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();
