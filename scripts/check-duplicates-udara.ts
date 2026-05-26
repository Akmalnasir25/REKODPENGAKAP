import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BADGE_ID = '3ae0a641-f71f-4ace-9119-a870d9f50180';
const OUT = 'C:/Users/AKMALN~1/AppData/Local/Temp/opencode/dup-check.txt';

const lines: string[] = [];
const log = (s: string) => lines.push(s);

async function main() {
  const { data: subs } = await supabase
    .from('submissions')
    .select('id, schools(school_code, name)')
    .eq('badge_id', BADGE_ID)
    .eq('submission_year', 2026);
  const subIds = (subs || []).map((s: any) => s.id);
  const subMap: Record<string, any> = {};
  for (const s of subs || []) subMap[(s as any).id] = (s as any).schools;

  const { data: peeps } = await supabase
    .from('submission_people')
    .select('id, name, ic_number, membership_id, role, submission_id')
    .in('submission_id', subIds);

  const byIc: Record<string, any[]> = {};
  const byId: Record<string, any[]> = {};
  for (const p of peeps || []) {
    if (p.ic_number) (byIc[p.ic_number] = byIc[p.ic_number] || []).push(p);
    if (p.membership_id) (byId[p.membership_id] = byId[p.membership_id] || []).push(p);
  }

  log('=== Duplicate IC merentas DB ===');
  let extraIc = 0;
  for (const ic of Object.keys(byIc)) {
    if (byIc[ic].length > 1) {
      extraIc += byIc[ic].length - 1;
      log(ic + ':');
      for (const p of byIc[ic]) {
        const sch = subMap[p.submission_id];
        log('   ' + sch.school_code + ' | ' + p.name + ' | ' + p.role + ' | memID=' + p.membership_id);
      }
    }
  }
  log('Extra rekod sebab duplicate IC: ' + extraIc);

  log('\n=== Duplicate Membership ID merentas DB ===');
  let extraId = 0;
  for (const id of Object.keys(byId)) {
    if (byId[id].length > 1) {
      extraId += byId[id].length - 1;
      log(id + ':');
      for (const p of byId[id]) {
        const sch = subMap[p.submission_id];
        log('   ' + sch.school_code + ' | ' + p.name + ' | ' + p.role + ' | ic=' + p.ic_number);
      }
    }
  }
  log('Extra rekod sebab duplicate Membership ID: ' + extraId);

  writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('WROTE', OUT, 'with', lines.length, 'lines');
}

main().catch(e => { console.error(e); process.exit(1); });
