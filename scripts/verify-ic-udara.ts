import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BADGE_ID = '3ae0a641-f71f-4ace-9119-a870d9f50180';

async function main() {
  const { data: subs } = await supabase
    .from('submissions').select('id, schools(school_code, name)')
    .eq('badge_id', BADGE_ID).eq('submission_year', 2026);
  const subIds = (subs || []).map((s: any) => s.id);

  const reIc = /^[0-9]{6}-[0-9]{2}-[0-9]{4}$/;

  const { data: peeps } = await supabase
    .from('submission_people').select('role, ic_number, name').in('submission_id', subIds);

  let validIc = 0, passport = 0, weird = 0;
  const weirdList: any[] = [];
  for (const p of peeps || []) {
    const ic = p.ic_number || '';
    if (reIc.test(ic)) validIc++;
    else if (/[A-Z]/i.test(ic)) passport++;
    else { weird++; weirdList.push(p); }
  }
  const peserta = (peeps || []).filter((p: any) => p.role === 'PESERTA').length;
  const pemimpin = (peeps || []).filter((p: any) => p.role !== 'PESERTA').length;

  console.log('=== FINAL STATUS Pengenalan Pengakap Udara 2026 ===');
  console.log('Total           :', (peeps || []).length);
  console.log('Peserta         :', peserta);
  console.log('Pemimpin        :', pemimpin);
  console.log('Submissions     :', subIds.length);
  console.log('Valid IC format :', validIc);
  console.log('Passport        :', passport);
  console.log('Tidak match     :', weird);
  for (const w of weirdList) console.log('  ', w.name, '|', JSON.stringify(w.ic_number));
}

main().catch(e => { console.error(e); process.exit(1); });
