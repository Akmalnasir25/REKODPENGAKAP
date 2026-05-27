import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '39114512';

async function setMenuButton(chatId: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      menu_button: {
        type: 'commands'
      }
    }),
  });
}

async function setCommands(chatId: string, role: string) {
  const commands = [
    { command: 'broadcast', description: '📢 Hantar Siaran' },
    { command: 'data', description: '📊 Pusat Data' },
    { command: 'scan', description: '🎯 Scan Kehadiran' },
  ];

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands,
      scope: { type: 'chat', chat_id: chatId }
    }),
  });
}

async function sendMessage(chatId: string, text: string, replyMarkup?: object) {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data?.result?.message_id as number | undefined;
}

async function editMessage(chatId: string, messageId: number, text: string, replyMarkup?: object) {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  else body.reply_markup = { inline_keyboard: [] }; // buang buttons lama
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const HEADER = `🛡️ <b>SISTEM DAFTAR PENGAKAP</b>
<i>Pusat Kawalan Admin</i>
━━━━━━━━━━━━━━━━━━━━━━`;

async function answerCallbackQuery(callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function getSession(supabase: any, chatId: string) {
  const { data } = await supabase.from('broadcast_sessions').select('*').eq('id', chatId).single();
  if (!data) {
    // Buat session baru untuk chat ini
    await supabase.from('broadcast_sessions').insert({ id: chatId, step: null, scope: null });
    return null;
  }
  return data;
}

async function updateSession(supabase: any, chatId: string, updates: object) {
  await supabase.from('broadcast_sessions').upsert({ id: chatId, ...updates, updated_at: new Date().toISOString() });
}

async function clearSession(supabase: any, chatId: string) {
  await supabase.from('broadcast_sessions').upsert({
    id: chatId,
    step: null, scope: null, negeri_id: null, negeri_name: null, daerah_id: null, daerah_name: null,
    school_id: null, school_name: null,
    updated_at: new Date().toISOString()
  });
}

async function getGroupByChat(supabase: any, chatId: string) {
  const { data } = await supabase
    .from('telegram_groups')
    .select('*')
    .eq('chat_id', chatId)
    .eq('is_active', true)
    .single();
  return data;
}

function getBroadcastMenuMarkup(role: string, negeriName?: string) {
  const buttons: any[] = [];
  
  if (role === 'developer') {
    // Developer - semua pilihan
    buttons.push([{ text: '🌐 Semua Pengguna', callback_data: 'scope_all' }]);
    buttons.push([{ text: '🗺️ Mengikut Negeri', callback_data: 'scope_negeri' }]);
    buttons.push([{ text: '📍 Mengikut Daerah', callback_data: 'scope_daerah' }]);
    buttons.push([{ text: '🏫 Mengikut Sekolah', callback_data: 'scope_school' }]);
  } else if (role === 'negeri_admin') {
    // Admin negeri - hanya dalam negeri dia
    buttons.push([{ text: `🌐 Semua dalam ${negeriName || 'Negeri'}`, callback_data: 'scope_all' }]);
    buttons.push([{ text: '📍 Mengikut Daerah', callback_data: 'scope_daerah' }]);
    buttons.push([{ text: '🏫 Mengikut Sekolah', callback_data: 'scope_school' }]);
  } else if (role === 'daerah_admin') {
    // Admin daerah - hanya dalam daerah dia
    buttons.push([{ text: '🌐 Semua dalam Daerah', callback_data: 'scope_all' }]);
    buttons.push([{ text: '🏫 Mengikut Sekolah', callback_data: 'scope_school' }]);
  }
  
  return { inline_keyboard: buttons };
}

// =====================================================================
// DATA CENTER HELPERS - untuk command /data
// =====================================================================

const TG_MAX_LEN = 3800;
const PAGE_SIZE = 15;

function truncateMsg(text: string): string {
  if (text.length <= TG_MAX_LEN) return text;
  return text.slice(0, TG_MAX_LEN) + '\n\n<i>...(dipotong - guna butang Lihat Lebih untuk teruskan)</i>';
}

function getDataMenuMarkup(programLabel?: string) {
  return {
    inline_keyboard: [
      [{ text: '📈 Statistik Ringkasan', callback_data: 'd_m_stat' }],
      [{ text: '🏫 Senarai Sekolah', callback_data: 'd_m_sek' }],
      [{ text: '👥 Senarai Peserta', callback_data: 'd_m_peserta' }],
      [{ text: '✅ Status Pengesahan', callback_data: 'd_m_psh' }],
      [{ text: '🎯 Kehadiran Hari Ini', callback_data: 'd_m_hadir' }],
      [{ text: '⚠️ Status Peserta (Tarik Diri)', callback_data: 'd_m_tarik' }],
      [{ text: '🔄 Pilih Program Lain', callback_data: 'd_back' }],
    ],
  };
}

// Helper untuk dapatkan school IDs ikut session scope (program-specific)
async function getSchoolIdsForDataSession(supabase: any, group: any, session: any): Promise<string[] | null> {
  // Daerah admin: hanya daerah dia
  if (group.role === 'daerah_admin') {
    const { data } = await supabase.from('schools').select('id').eq('daerah_id', group.daerah_id);
    return (data || []).map((s: any) => s.id);
  }
  // Negeri admin: hanya negeri dia
  if (group.role === 'negeri_admin') {
    const { data } = await supabase.from('schools').select('id').eq('negeri_id', group.negeri_id);
    return (data || []).map((s: any) => s.id);
  }
  // Developer: ikut session scope
  if (session?.negeri_id) {
    const { data } = await supabase.from('schools').select('id').eq('negeri_id', session.negeri_id);
    return (data || []).map((s: any) => s.id);
  }
  if (session?.daerah_id) {
    const { data } = await supabase.from('schools').select('id').eq('daerah_id', session.daerah_id);
    return (data || []).map((s: any) => s.id);
  }
  return null; // semua
}

async function getDataSessionLabel(supabase: any, group: any, session: any): Promise<string> {
  const parts: string[] = [];
  if (session?.school_id) {
    const { data: b } = await supabase.from('badges').select('name').eq('id', session.school_id).single();
    if (b?.name) parts.push(`🎯 ${b.name}`);
  }
  if (group.role === 'developer') {
    if (session?.negeri_id) {
      const { data: n } = await supabase.from('negeri').select('name').eq('id', session.negeri_id).single();
      parts.push(`🗺️ ${n?.name || ''}`);
    } else if (session?.daerah_id) {
      const { data: d } = await supabase.from('daerah').select('name').eq('id', session.daerah_id).single();
      parts.push(`📍 ${d?.name || ''}`);
    } else {
      parts.push('🌐 Semua');
    }
  } else if (group.role === 'negeri_admin' && group.negeri_id) {
    const { data: n } = await supabase.from('negeri').select('name').eq('id', group.negeri_id).single();
    parts.push(`🗺️ ${n?.name || ''}`);
  } else if (group.role === 'daerah_admin' && group.daerah_id) {
    const { data: d } = await supabase.from('daerah').select('name').eq('id', group.daerah_id).single();
    parts.push(`📍 ${d?.name || ''}`);
  }
  return parts.join(' · ');
}

async function getScopedSchoolIds(supabase: any, group: any): Promise<string[] | null> {
  if (group.role === 'developer') return null;
  let q = supabase.from('schools').select('id');
  if (group.role === 'negeri_admin' && group.negeri_id) q = q.eq('negeri_id', group.negeri_id);
  else if (group.role === 'daerah_admin' && group.daerah_id) q = q.eq('daerah_id', group.daerah_id);
  const { data } = await q;
  return (data || []).map((s: any) => s.id);
}

async function getBadgesForRole(supabase: any, group: any) {
  const { data } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
  if (!data) return [];
  if (group.role === 'developer') return data;
  return data.filter((b: any) => {
    const s = b.scope || 'daerah';
    if (group.role === 'negeri_admin') {
      if (s === 'negeri') return !b.negeri_id || b.negeri_id === group.negeri_id;
      return true;
    }
    if (group.role === 'daerah_admin') {
      if (s === 'daerah') return !b.daerah_id || b.daerah_id === group.daerah_id;
      return true;
    }
    return true;
  });
}

async function renderProgramStats(supabase: any, chatId: string, msgId: number, badge: any, year: number, scopedSchoolIds: string[] | null, scopeLabel: string, backCallback: string) {
  let subQuery = supabase.from('submissions').select('id, school_id, school:schools(school_code, name, daerah:daerah_id(code, name))').eq('badge_id', badge.id).eq('submission_year', year);
  if (scopedSchoolIds) subQuery = subQuery.in('school_id', scopedSchoolIds);
  const { data: subs } = await subQuery;
  const subIds = (subs || []).map((s: any) => s.id);
  if (subIds.length === 0) {
    await editMessage(chatId, msgId, `${HEADER}\n\n📈 <b>${badge.name} ${year}</b>\n<i>${scopeLabel}</i>\n\n<i>Tiada data dalam skop ini.</i>`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: backCallback }], [{ text: '📊 Menu Utama', callback_data: 'd_back' }]] });
    return;
  }
  const { data: peeps } = await supabase.from('submission_people').select('name, role, gender, makanan, masalah_kesihatan, masalah_kesihatan_lain, submission_id').in('submission_id', subIds).eq('is_withdrawn', false);
  const all = peeps || [];
  const peserta = all.filter((p: any) => p.role === 'PESERTA' || p.role === 'PENERIMA RAMBU').length;
  const pemimpin = all.filter((p: any) => p.role === 'PEMIMPIN').length;
  const penolong = all.filter((p: any) => p.role === 'PENOLONG PEMIMPIN').length;
  const penguji = all.filter((p: any) => p.role === 'PENGUJI').length;
  const lelaki = all.filter((p: any) => (p.gender || '').toUpperCase().startsWith('L')).length;
  const perempuan = all.filter((p: any) => (p.gender || '').toUpperCase().startsWith('P')).length;
  const veg = all.filter((p: any) => (p.makanan || '') === 'Vegetarian').length;
  const biasa = all.filter((p: any) => (p.makanan || '') === 'Biasa').length;
  const total = all.length;
  const schoolCount = subIds.length;

  // Map sub_id to school
  const subToSchool: Record<string, { name: string; daerahName: string }> = {};
  const daerahMap: Record<string, { name: string; schools: number; people: number }> = {};
  for (const s of subs || []) {
    const sid = (s as any).id;
    const sch = (s as any).school;
    subToSchool[sid] = { name: sch?.name || '-', daerahName: sch?.daerah?.name || '-' };
    const dCode = sch?.daerah?.code || '-';
    const dName = sch?.daerah?.name || 'Tidak Diketahui';
    if (!daerahMap[dCode]) daerahMap[dCode] = { name: dName, schools: 0, people: 0 };
    daerahMap[dCode].schools++;
    daerahMap[dCode].people += all.filter((p: any) => p.submission_id === sid).length;
  }
  const daerahLines = Object.entries(daerahMap).map(([_, d]) => `• ${d.name}: ${d.schools} sekolah, ${d.people} orang`).join('\n');

  // Health conditions — ada yang punya masalah selain "Tiada"
  const sick = all.filter((p: any) => {
    const k = (p.masalah_kesihatan || '').trim();
    return k && k.toUpperCase() !== 'TIADA';
  });
  const sickByType: Record<string, number> = {};
  for (const p of sick) {
    const k = (p.masalah_kesihatan || 'Tidak Dinyatakan').trim();
    sickByType[k] = (sickByType[k] || 0) + 1;
  }
  const sickTypeLines = Object.entries(sickByType).sort((a, b) => b[1] - a[1]).map(([k, c]) => `• ${k}: ${c}`).join('\n');

  const msg = `${HEADER}\n\n📈 <b>${badge.name} ${year}</b>\n<i>${scopeLabel}</i>\n\n📊 <b>Ringkasan:</b>\n• Total: ${total}\n• Peserta: ${peserta}\n• Pemimpin: ${pemimpin}${penolong ? '\n• Penolong: ' + penolong : ''}${penguji ? '\n• Penguji: ' + penguji : ''}\n• Sekolah: ${schoolCount}\n\n⚧ <b>Jantina:</b>\n• Lelaki: ${lelaki}\n• Perempuan: ${perempuan}\n\n🍱 <b>Makanan:</b>\n• Biasa: ${biasa}\n• Vegetarian: ${veg}\n\n🏥 <b>Masalah Kesihatan:</b>\n• Total: ${sick.length} orang\n${sickTypeLines || '<i>Tiada</i>'}\n\n🏫 <b>Pecahan Daerah:</b>\n${daerahLines || '<i>Tiada</i>'}`;
  const buttons: any[][] = [];
  if (sick.length > 0) buttons.push([{ text: '🏥 Lihat Senarai Penyakit', callback_data: 'd_sick' }]);
  buttons.push([{ text: '🔙 Kembali', callback_data: backCallback }]);
  buttons.push([{ text: '📊 Menu Utama', callback_data: 'd_back' }]);
  await editMessage(chatId, msgId, truncateMsg(msg), { inline_keyboard: buttons });
}

async function broadcastNotification(supabase: any, message: string, scope: string, negeriId?: string, daerahId?: string, schoolId?: string, scopeName?: string) {
  let query = supabase.from('schools').select('claimed_by').eq('is_claimed', true).not('claimed_by', 'is', null);

  if (scope === 'school' && schoolId) {
    query = query.eq('id', schoolId);
  } else if (scope === 'negeri' && negeriId) {
    query = query.eq('negeri_id', negeriId);
  } else if (scope === 'daerah' && daerahId) {
    query = query.eq('daerah_id', daerahId);
  }

  const { data: schools, error } = await query;
  if (error || !schools || schools.length === 0) {
    console.error('No schools found:', error);
    return 0;
  }

  const userIds = [...new Set(schools.map((s: any) => s.claimed_by))];

  const notifications = userIds.map((userId: any) => ({
    user_id: userId,
    feedback_id: null,
    title: `📢 Makluman ${scopeName || 'Sistem'}`,
    message,
    is_read: false,
  }));

  const { error: insertError } = await supabase.from('notifications').insert(notifications);
  if (insertError) {
    console.error('Broadcast insert error:', insertError);
    return 0;
  }

  return userIds.length;
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('OK', { status: 200 });

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Handle callback query (button clicks)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const chatId = String(callbackQuery.message?.chat?.id);
      const msgId = callbackQuery.message?.message_id as number;
      const data = callbackQuery.data as string;

      await answerCallbackQuery(callbackQuery.id);

      // Check group scope
      const group = await getGroupByChat(supabase, chatId);
      if (!group) {
        return new Response('OK', { status: 200 });
      }

      if (data === 'scope_all') {
        await updateSession(supabase, chatId, { step: 'waiting_message', scope: 'all' });
        
        let scopeText = 'Semua Pengguna';
        if (group.role === 'negeri_admin') {
          const { data: negeriData } = await supabase.from('negeri').select('name').eq('id', group.negeri_id).single();
          scopeText = `Semua dalam ${negeriData?.name || 'Negeri'}`;
        } else if (group.role === 'daerah_admin') {
          const { data: daerahData } = await supabase.from('daerah').select('name').eq('id', group.daerah_id).single();
          scopeText = `Semua dalam ${daerahData?.name || 'Daerah'}`;
        }
        
        await editMessage(chatId, msgId, `${HEADER}

🌐 <b>${scopeText}</b>

✏️ Taip mesej siaran anda sekarang:`);

      } else if (data === 'scope_school') {
        await updateSession(supabase, chatId, { step: 'choose_negeri', scope: 'school', negeri_id: null, negeri_name: null, daerah_id: null, daerah_name: null, school_id: null, school_name: null });

        if (group.role === 'daerah_admin') {
          // Admin daerah - terus ke senarai sekolah dalam daerah dia
          const { data: daerahData } = await supabase.from('daerah').select('name').eq('id', group.daerah_id).single();
          const daerahName = daerahData?.name || 'Daerah';
          await updateSession(supabase, chatId, { step: 'choose_school', scope: 'school', daerah_id: group.daerah_id, daerah_name: daerahName });
          const { data: schoolList } = await supabase.from('schools').select('id,name').eq('daerah_id', group.daerah_id).order('name');
          const buttons = (schoolList || []).map((s: any) => ([{ text: `🏫 ${s.name}`, callback_data: `ss_${s.id}` }]));
          if (buttons.length === 0) {
            await editMessage(chatId, msgId, `${HEADER}

⚠️ <b>Tiada Sekolah</b>
Tiada sekolah dijumpai dalam daerah <b>${daerahName}</b>.`);
            await clearSession(supabase, chatId);
          } else {
            await editMessage(chatId, msgId, `${HEADER}

🏫 <b>Pilih Sekolah</b> — ${daerahName}
<i>Pilih sekolah untuk hantar mesej</i>`, { inline_keyboard: buttons });
          }
        } else {
          // Developer / negeri_admin - pilih negeri dulu
          let negeriQuery = supabase.from('negeri').select('id,name').order('name');
          if (group.role === 'negeri_admin') {
            negeriQuery = negeriQuery.eq('id', group.negeri_id);
          }
          const { data: negeriList } = await negeriQuery;
          const buttons = (negeriList || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `sn_${n.id}` }]));
          await editMessage(chatId, msgId, `${HEADER}

🗺️ <b>Pilih Negeri</b>
<i>Langkah 1/3 — Pilih negeri dahulu</i>`, { inline_keyboard: buttons });
        }
      } else if (data === 'scope_negeri') {
        if (group.role !== 'developer') {
          await editMessage(chatId, msgId, `${HEADER}

⚠️ <b>Akses Ditolak</b>
Anda tidak mempunyai akses untuk pilihan ini.`);
          return new Response('OK', { status: 200 });
        }
        
        await updateSession(supabase, chatId, { step: 'choose_negeri', scope: 'negeri' });
        const { data: negeriList } = await supabase.from('negeri').select('id,name').order('name');
        const buttons = negeriList?.map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `negeri_${n.id}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

🗺️ <b>Pilih Negeri</b>
<i>Mesej akan dihantar kepada semua pengguna dalam negeri yang dipilih</i>`, { inline_keyboard: buttons });

      } else if (data === 'scope_daerah') {
        if (group.role === 'daerah_admin') {
          await editMessage(chatId, msgId, `${HEADER}

⚠️ <b>Akses Ditolak</b>
Anda tidak mempunyai akses untuk pilihan ini.`);
          return new Response('OK', { status: 200 });
        }
        
        await updateSession(supabase, chatId, { step: 'choose_negeri', scope: 'daerah' });
        
        let negeriQuery = supabase.from('negeri').select('id,name').order('name');
        if (group.role === 'negeri_admin') {
          negeriQuery = negeriQuery.eq('id', group.negeri_id);
        }
        
        const { data: negeriList } = await negeriQuery;
        const buttons = negeriList?.map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `pick_negeri_${n.id}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Pilih Negeri</b>
<i>Langkah 1/2 — Pilih negeri dahulu</i>`, { inline_keyboard: buttons });

      } else if (data.startsWith('negeri_')) {
        const negeriId = data.replace('negeri_', '');
        const { data: negeriData } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
        const negeriName = negeriData?.name || negeriId;
        await updateSession(supabase, chatId, { step: 'waiting_message', negeri_id: negeriId, negeri_name: negeriName });
        await editMessage(chatId, msgId, `${HEADER}

🗺️ <b>Negeri:</b> ${negeriName}

✏️ Taip mesej siaran anda sekarang:`);

      } else if (data.startsWith('pick_negeri_')) {
        const negeriId = data.replace('pick_negeri_', '');
        const { data: negeriData } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
        const negeriName = negeriData?.name || negeriId;
        await updateSession(supabase, chatId, { step: 'choose_daerah', negeri_id: negeriId, negeri_name: negeriName });
        const { data: daerahList } = await supabase.from('daerah').select('id,name').eq('negeri_id', negeriId).order('name');
        const buttons = daerahList?.map((d: any) => ([{ text: `📍 ${d.name}`, callback_data: `daerah_${d.id}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Pilih Daerah</b> — ${negeriName}
<i>Langkah 2/2 — Pilih daerah</i>`, { inline_keyboard: buttons });

    } else if (data.startsWith('daerah_')) {
      const daerahId = data.replace('daerah_', '');
      const { data: daerahData } = await supabase.from('daerah').select('name').eq('id', daerahId).single();
      const daerahName = daerahData?.name || daerahId;
      await updateSession(supabase, chatId, { step: 'waiting_message', daerah_id: daerahId, daerah_name: daerahName });
      await editMessage(chatId, msgId, `${HEADER}

📍 <b>Daerah:</b> ${daerahName}

✏️ Taip mesej siaran anda sekarang:`);
      return new Response('OK', { status: 200 });
    } else if (data.startsWith('sn_')) {
      const negeriId = data.replace('sn_', '');

      // Ambil nama negeri dari database
      const { data: negeriData } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
      const negeriName = negeriData?.name || negeriId;

      await updateSession(supabase, chatId, { step: 'choose_daerah', scope: 'school', negeri_id: negeriId, negeri_name: negeriName });
      const { data: daerahList } = await supabase.from('daerah').select('id,name').eq('negeri_id', negeriId).order('name');
      const buttons = (daerahList || []).map((d: any) => ([{ text: `📍 ${d.name}`, callback_data: `sd_${d.id}` }]));
      if (buttons.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}

⚠️ <b>Tiada Daerah</b>
Tiada daerah dijumpai untuk negeri <b>${negeriName}</b>.`);
        await clearSession(supabase, chatId);
      } else {
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Pilih Daerah</b> — ${negeriName}
<i>Langkah 2/3 — Pilih daerah</i>`, { inline_keyboard: buttons });
      }

    } else if (data.startsWith('sd_')) {
      const daerahId = data.replace('sd_', '');

      // Ambil nama daerah dari database
      const { data: daerahData } = await supabase.from('daerah').select('name').eq('id', daerahId).single();
      const daerahName = daerahData?.name || daerahId;

      // Kekalkan scope: 'school'
      await updateSession(supabase, chatId, { step: 'choose_school', scope: 'school', daerah_id: daerahId, daerah_name: daerahName });

      // Ambil semua sekolah dalam daerah
      const { data: schoolList, error: schoolError } = await supabase
        .from('schools')
        .select('id,name')
        .eq('daerah_id', daerahId)
        .order('name');

      console.log('schoolList for daerahId', daerahId, ':', JSON.stringify(schoolList), 'error:', JSON.stringify(schoolError));

      const buttons = (schoolList || []).map((s: any) => ([{ text: `🏫 ${s.name}`, callback_data: `ss_${s.id}` }]));

      if (buttons.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}

⚠️ <b>Tiada Sekolah</b>
Tiada sekolah dijumpai di daerah <b>${daerahName}</b>.`);
        await clearSession(supabase, chatId);
      } else {
        await editMessage(chatId, msgId, `${HEADER}

🏫 <b>Pilih Sekolah</b> — ${daerahName}
<i>Langkah 3/3 — Pilih sekolah untuk hantar mesej</i>`, { inline_keyboard: buttons });
      }

    } else if (data.startsWith('ss_')) {
      const schoolId = data.replace('ss_', '');

      // Ambil nama sekolah dari database
      const { data: schoolData } = await supabase.from('schools').select('name').eq('id', schoolId).single();
      const schoolName = schoolData?.name || schoolId;

      await updateSession(supabase, chatId, { step: 'waiting_message', scope: 'school', school_id: schoolId, school_name: schoolName });
      await editMessage(chatId, msgId, `${HEADER}

🏫 <b>Sekolah:</b> ${schoolName}

✏️ Taip mesej siaran anda sekarang:`);
    }
    // ===== DATA CENTER CALLBACKS =====
    else if (data === 'sc_ok') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id || !session?.negeri_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sesi tamat. Sila taip /scan untuk mula semula.`);
        return new Response('OK', { status: 200 });
      }
      const schoolId = session.school_id;
      const badgeId = session.negeri_id; // reused field
      const participantCount = parseInt(session.daerah_name || '0', 10);
      const year = parseInt(session.scope || String(new Date().getFullYear()), 10);

      const { error } = await supabase.from('attendance_verifications').insert({
        school_id: schoolId,
        badge_id: badgeId,
        year,
        participant_count: participantCount,
        source: 'telegram_scan',
      });
      await clearSession(supabase, chatId);
      if (error) {
        await editMessage(chatId, msgId, `${HEADER}\n\n❌ <b>Gagal Simpan</b>\n${error.message}`);
        return new Response('OK', { status: 200 });
      }
      const { data: school } = await supabase.from('schools').select('school_code, name').eq('id', schoolId).single();
      const { data: badge } = await supabase.from('badges').select('name').eq('id', badgeId).single();
      await editMessage(chatId, msgId, `${HEADER}

✅ <b>Kehadiran Disahkan</b>

🏫 <b>Sekolah:</b> ${school?.name || ''}
📋 <b>Kod:</b> <code>${school?.school_code || ''}</code>
🎯 <b>Program:</b> ${badge?.name || ''}
👥 <b>Peserta:</b> ${participantCount} orang
🕐 <b>Masa:</b> ${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}

<i>Sistem akan auto-update di dashboard sekolah, daerah dan negeri.</i>`);
    }
    else if (data === 'sc_cancel') {
      await clearSession(supabase, chatId);
      await editMessage(chatId, msgId, `${HEADER}\n\n✅ Scan dibatalkan.`);
    }
    // Pilih program untuk scan
    else if (data.startsWith('sp_')) {
      const badgeId = data.replace('sp_', '');
      const { data: badge } = await supabase.from('badges').select('id, name').eq('id', badgeId).single();
      if (!badge) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Program tidak dijumpai.`);
        return new Response('OK', { status: 200 });
      }
      await updateSession(supabase, chatId, { step: 'scan_program', school_id: badgeId, school_name: badge.name });
      // Build WebApp URL with program info
      const webAppUrl = `https://ppmdaftar.web.app/scan-qr.html?badge=${encodeURIComponent(badge.name)}&badgeId=${badgeId}&chatId=${chatId}`;
      await editMessage(chatId, msgId, `${HEADER}

🎯 <b>${badge.name}</b>

Klik butang di bawah untuk buka kamera dan scan QR sekolah.

<i>Pastikan Telegram dah dibenarkan akses kamera dalam tetapan telefon.</i>`, {
        inline_keyboard: [
          [{ text: '📷 Buka Scanner', web_app: { url: webAppUrl } }],
          [{ text: '🔙 Pilih Program Lain', callback_data: 'sb_prog' }],
        ],
      });
    }
    // Kembali ke senarai program scan
    else if (data === 'sb_prog') {
      if (group.role === 'developer') {
        // Developer balik ke senarai negeri
        const { data: negeris } = await supabase.from('negeri').select('id, code, name').order('name');
        const buttons: any[] = (negeris || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `xn_${n.id}` }]));
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>Pilih negeri untuk lihat program:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      const badges = await getBadgesForRole(supabase, group);
      const buttons = badges.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `sp_${b.id}` }]));
      await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>Pilih program untuk scan:</i>`, { inline_keyboard: buttons });
    }
    // Pilih negeri untuk scan (developer only) — papar program negeri sahaja
    else if (data.startsWith('xn_')) {
      const negeriId = data.replace('xn_', '');
      const { data: n } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
      const negeriName = n?.name || '';
      const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
      const filtered = (badges || []).filter((b: any) => {
        const s = b.scope || 'daerah';
        return s === 'negeri' && b.negeri_id === negeriId;
      });
      const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `sp_${b.id}` }]));
      buttons.push([{ text: '📍 Lihat Program Daerah', callback_data: `xnd_${negeriId}` }]);
      buttons.push([{ text: '🔙 Pilih Negeri', callback_data: 'sb_prog' }]);
      const headerInfo = filtered.length === 0
        ? `\n\n⚠️ Tiada program peringkat negeri.`
        : `\n\nProgram peringkat negeri:`;
      await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>🗺️ ${negeriName}</i>${headerInfo}`, { inline_keyboard: buttons });
    }
    // Senarai daerah dalam negeri (scan flow)
    else if (data.startsWith('xnd_') && !data.startsWith('xnd2_')) {
      const negeriId = data.replace('xnd_', '');
      const { data: n } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
      const { data: daerahs } = await supabase.from('daerah').select('id, code, name').eq('negeri_id', negeriId).order('name');
      if (!daerahs || daerahs.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>🗺️ ${n?.name || ''}</i>\n\n⚠️ Tiada daerah.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `xn_${negeriId}` }]] });
        return new Response('OK', { status: 200 });
      }
      const buttons: any[] = daerahs.map((d: any) => ([{ text: `📍 ${d.name}`, callback_data: `xnd2_${d.id}` }]));
      buttons.push([{ text: '🔙 Kembali', callback_data: `xn_${negeriId}` }]);
      await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>🗺️ ${n?.name || ''}</i>\n\nPilih daerah:`, { inline_keyboard: buttons });
    }
    // Senarai program dalam daerah (scan flow)
    else if (data.startsWith('xnd2_')) {
      const daerahId = data.replace('xnd2_', '');
      const { data: daerah } = await supabase.from('daerah').select('id, name, negeri_id').eq('id', daerahId).single();
      const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
      const filtered = (badges || []).filter((b: any) => {
        const s = b.scope || 'daerah';
        return s === 'daerah' && b.daerah_id === daerahId;
      });
      if (filtered.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>📍 ${daerah?.name || ''}</i>\n\n⚠️ Tiada program peringkat daerah.`, { inline_keyboard: [[{ text: '🔙 Senarai Daerah', callback_data: `xnd_${daerah?.negeri_id}` }]] });
        return new Response('OK', { status: 200 });
      }
      const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `sp_${b.id}` }]));
      buttons.push([{ text: '🔙 Senarai Daerah', callback_data: `xnd_${daerah?.negeri_id}` }]);
      await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>📍 ${daerah?.name || ''}</i>\n\nPilih program:`, { inline_keyboard: buttons });
    }
    else if (data === 'd_back') {
      // Kembali ke pilih negeri (developer) atau senarai program (negeri/daerah admin)
      await clearSession(supabase, chatId);
      if (group.role === 'developer') {
        const { data: negeris } = await supabase.from('negeri').select('id, code, name').order('name');
        const buttons: any[] = (negeris || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `dn_${n.id}` }]));
        buttons.unshift([{ text: '🌐 Semua Negeri', callback_data: 'dn_all' }]);
        await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>Pilih negeri untuk lihat program:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      const badges = await getBadgesForRole(supabase, group);
      const buttons = badges.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `dp_${b.id}` }]));
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>Pilih program untuk lihat data:</i>`, { inline_keyboard: buttons });
    }
    // Pilih negeri (developer only) — papar program-program peringkat negeri sahaja
    else if (data.startsWith('dn_')) {
      const negeriIdOrAll = data.replace('dn_', '');
      // Save negeri ke session
      if (negeriIdOrAll === 'all') {
        await updateSession(supabase, chatId, { negeri_id: null, daerah_id: null });
      } else {
        await updateSession(supabase, chatId, { negeri_id: negeriIdOrAll, daerah_id: null });
      }
      let negeriName = 'Semua Negeri';
      if (negeriIdOrAll !== 'all') {
        const { data: n } = await supabase.from('negeri').select('name').eq('id', negeriIdOrAll).single();
        negeriName = n?.name || '';
      }
      const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
      let filtered: any[] = [];
      if (negeriIdOrAll === 'all') {
        filtered = badges || [];
      } else {
        // Hanya program scope=negeri yg khas untuk negeri ini
        filtered = (badges || []).filter((b: any) => {
          const s = b.scope || 'daerah';
          return s === 'negeri' && b.negeri_id === negeriIdOrAll;
        });
      }
      const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `dp_${b.id}` }]));
      // Butang lihat program daerah (developer + negeri specific)
      if (negeriIdOrAll !== 'all') {
        buttons.push([{ text: '📍 Lihat Program Daerah', callback_data: `dnd_${negeriIdOrAll}` }]);
      }
      buttons.push([{ text: '🔙 Pilih Negeri', callback_data: 'd_back' }]);
      const headerInfo = filtered.length === 0
        ? `\n\n⚠️ Tiada program peringkat negeri.`
        : `\n\nProgram peringkat negeri:`;
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>🗺️ ${negeriName}</i>${headerInfo}`, { inline_keyboard: buttons });
    }
    // Senarai daerah dalam negeri (developer)
    else if (data.startsWith('dnd_') && !data.startsWith('dnd2_')) {
      const negeriId = data.replace('dnd_', '');
      const { data: n } = await supabase.from('negeri').select('name').eq('id', negeriId).single();
      const { data: daerahs } = await supabase.from('daerah').select('id, code, name').eq('negeri_id', negeriId).order('name');
      if (!daerahs || daerahs.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>🗺️ ${n?.name || ''}</i>\n\n⚠️ Tiada daerah dalam negeri ini.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `dn_${negeriId}` }]] });
        return new Response('OK', { status: 200 });
      }
      const buttons: any[] = daerahs.map((d: any) => ([{ text: `📍 ${d.name}`, callback_data: `dnd2_${d.id}` }]));
      buttons.push([{ text: '🔙 Kembali', callback_data: `dn_${negeriId}` }]);
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>🗺️ ${n?.name || ''}</i>\n\nPilih daerah untuk lihat program:`, { inline_keyboard: buttons });
    }
    // Senarai program dalam daerah (developer)
    else if (data.startsWith('dnd2_')) {
      const daerahId = data.replace('dnd2_', '');
      const { data: daerah } = await supabase.from('daerah').select('id, name, negeri_id').eq('id', daerahId).single();
      // Save daerah ke session
      await updateSession(supabase, chatId, { daerah_id: daerahId, negeri_id: null });
      const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
      const filtered = (badges || []).filter((b: any) => {
        const s = b.scope || 'daerah';
        return s === 'daerah' && b.daerah_id === daerahId;
      });
      if (filtered.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>📍 ${daerah?.name || ''}</i>\n\n⚠️ Tiada program peringkat daerah dalam daerah ini.`, { inline_keyboard: [[{ text: '🔙 Senarai Daerah', callback_data: `dnd_${daerah?.negeri_id}` }]] });
        return new Response('OK', { status: 200 });
      }
      const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `dp_${b.id}` }]));
      buttons.push([{ text: '🔙 Senarai Daerah', callback_data: `dnd_${daerah?.negeri_id}` }]);
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>📍 ${daerah?.name || ''}</i>\n\nPilih program peringkat daerah:`, { inline_keyboard: buttons });
    }
    // Pilih program
    else if (data.startsWith('dp_n_')) {
      // Format: dp_n_<badgeId>_<negeriIdOrAll>
      const rest = data.replace('dp_n_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const badgeId = rest.slice(0, lastUnderscore);
      const negeriId = rest.slice(lastUnderscore + 1);
      const sessionUpdate: any = { school_id: badgeId, negeri_id: negeriId === 'all' ? null : negeriId, daerah_id: null };
      await updateSession(supabase, chatId, sessionUpdate);
      const fakeSession = sessionUpdate;
      const label = await getDataSessionLabel(supabase, group, fakeSession);
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>${label}</i>\n\nPilih jenis data:`, getDataMenuMarkup());
    }
    else if (data.startsWith('dp_d_')) {
      const rest = data.replace('dp_d_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const badgeId = rest.slice(0, lastUnderscore);
      const daerahId = rest.slice(lastUnderscore + 1);
      const sessionUpdate: any = { school_id: badgeId, daerah_id: daerahId === 'all' ? null : daerahId, negeri_id: null };
      await updateSession(supabase, chatId, sessionUpdate);
      const fakeSession = sessionUpdate;
      const label = await getDataSessionLabel(supabase, group, fakeSession);
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>${label}</i>\n\nPilih jenis data:`, getDataMenuMarkup());
    }
    else if (data.startsWith('dp_')) {
      const badgeId = data.replace('dp_', '');
      const { data: badge } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').eq('id', badgeId).single();
      if (!badge) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Program tidak dijumpai.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const badgeScope = badge.scope || 'daerah';
      // Developer perlu pilih negeri/daerah jika belum specific
      if (group.role === 'developer' && badgeScope === 'negeri' && !badge.negeri_id) {
        const { data: negeris } = await supabase.from('negeri').select('id, code, name').order('name');
        const buttons: any[] = (negeris || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `dp_n_${badgeId}_${n.id}` }]));
        buttons.unshift([{ text: '🌐 Semua Negeri', callback_data: `dp_n_${badgeId}_all` }]);
        buttons.push([{ text: '🔙 Kembali', callback_data: 'd_back' }]);
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>${badge.name}</b>\n<i>Pilih skop negeri:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      if (group.role === 'developer' && badgeScope === 'daerah' && !badge.daerah_id) {
        const { data: daerahs } = await supabase.from('daerah').select('id, code, name, negeri:negeri_id(name)').order('name');
        const buttons: any[] = (daerahs || []).map((d: any) => ([{ text: `📍 ${d.name} (${d.negeri?.name || ''})`.slice(0, 60), callback_data: `dp_d_${badgeId}_${d.id}` }]));
        buttons.unshift([{ text: '🌐 Semua Daerah', callback_data: `dp_d_${badgeId}_all` }]);
        buttons.push([{ text: '🔙 Kembali', callback_data: 'd_back' }]);
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>${badge.name}</b>\n<i>Pilih skop daerah:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      // Save program ke session, terus tunjuk menu data
      await updateSession(supabase, chatId, { school_id: badgeId, negeri_id: null, daerah_id: null });
      const label = await getDataSessionLabel(supabase, group, { school_id: badgeId });
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>${label}</i>\n\nPilih jenis data:`, getDataMenuMarkup());
    }
    // Old d_stat (tinggalkan untuk kompatibel session lama)
    else if (data === 'd_m_stat') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: badge } = await supabase.from('badges').select('id, name').eq('id', session.school_id).single();
      if (!badge) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Program tidak dijumpai.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      const label = await getDataSessionLabel(supabase, group, session);
      await renderProgramStats(supabase, chatId, msgId, badge, year, scopedSchoolIds, label, 'd_menu');
    }
    else if (data === 'd_sick') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: badge } = await supabase.from('badges').select('id, name').eq('id', session.school_id).single();
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let subQ = supabase.from('submissions').select('id, school:schools(name, school_code)').eq('badge_id', session.school_id).eq('submission_year', year);
      if (scopedSchoolIds) subQ = subQ.in('school_id', scopedSchoolIds);
      const { data: subs } = await subQ;
      const subIds = (subs || []).map((s: any) => s.id);
      const subToSchool: Record<string, string> = {};
      for (const s of subs || []) subToSchool[(s as any).id] = (s as any).school?.name || '-';
      const { data: peeps } = await supabase
        .from('submission_people')
        .select('name, masalah_kesihatan, masalah_kesihatan_lain, submission_id')
        .in('submission_id', subIds)
        .eq('is_withdrawn', false)
        .not('masalah_kesihatan', 'is', null);
      const sick = (peeps || []).filter((p: any) => {
        const k = (p.masalah_kesihatan || '').trim();
        return k && k.toUpperCase() !== 'TIADA';
      });
      const label = await getDataSessionLabel(supabase, group, session);
      if (sick.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n🏥 <b>Senarai Masalah Kesihatan</b>\n<i>${label}</i>\n\n<i>Tiada peserta dengan masalah kesihatan.</i>`, { inline_keyboard: [[{ text: '🔙 Statistik', callback_data: 'd_m_stat' }]] });
        return new Response('OK', { status: 200 });
      }
      // Group by penyakit
      const byCondition: Record<string, any[]> = {};
      for (const p of sick) {
        const k = (p.masalah_kesihatan || 'Tidak Dinyatakan').trim();
        (byCondition[k] = byCondition[k] || []).push(p);
      }
      let body = `${HEADER}\n\n🏥 <b>Senarai Masalah Kesihatan</b>\n<i>${badge?.name || ''} · ${label}</i>\n\n📊 <b>Total:</b> ${sick.length} orang\n`;
      for (const [cond, arr] of Object.entries(byCondition).sort((a, b) => b[1].length - a[1].length)) {
        body += `\n<b>${cond} (${arr.length}):</b>\n`;
        arr.slice(0, 25).forEach((p: any, i: number) => {
          const sch = subToSchool[p.submission_id];
          const detail = (cond === 'Lain-lain' && p.masalah_kesihatan_lain) ? ` (${p.masalah_kesihatan_lain})` : '';
          body += `${i + 1}. ${p.name} — ${sch}${detail}\n`;
        });
        if (arr.length > 25) body += `<i>...${arr.length - 25} lagi</i>\n`;
      }
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Statistik', callback_data: 'd_m_stat' }], [{ text: '📊 Menu', callback_data: 'd_menu' }]] });
    }
    else if (data === 'd_menu') {
      // Kembali ke menu data dengan session sedia ada
      const session = await getSession(supabase, chatId);
      const label = await getDataSessionLabel(supabase, group, session);
      await editMessage(chatId, msgId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>${label}</i>\n\nPilih jenis data:`, getDataMenuMarkup());
    }
    else if (data === 'd_m_sek') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let subQ = supabase.from('submissions').select('id, school_id').eq('badge_id', session.school_id).eq('submission_year', year);
      if (scopedSchoolIds) subQ = subQ.in('school_id', scopedSchoolIds);
      const { data: subs } = await subQ;
      const subSchoolIds = (subs || []).map((s: any) => s.school_id);
      if (subSchoolIds.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n🏫 <b>Senarai Sekolah</b>\n\n<i>Tiada sekolah berdaftar untuk program ini.</i>`, { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: schools } = await supabase.from('schools').select('id, school_code, name, daerah:daerah_id(name, code)').in('id', subSchoolIds).order('school_code');
      const list = schools || [];
      // Count people per school
      const { data: peeps } = await supabase.from('submission_people').select('submission_id, role').in('submission_id', (subs || []).map((s: any) => s.id)).eq('is_withdrawn', false);
      const subToSchool: Record<string, string> = {};
      for (const s of subs || []) subToSchool[s.id] = s.school_id;
      const schoolCount: Record<string, number> = {};
      for (const p of peeps || []) {
        const sid = subToSchool[p.submission_id];
        if (sid) schoolCount[sid] = (schoolCount[sid] || 0) + 1;
      }
      const byDaerah: Record<string, any[]> = {};
      for (const s of list) {
        const k = (s as any).daerah?.name || 'Tidak Berdaerah';
        (byDaerah[k] = byDaerah[k] || []).push(s);
      }
      const label = await getDataSessionLabel(supabase, group, session);
      let body = `${HEADER}\n\n🏫 <b>Senarai Sekolah</b> (${list.length})\n<i>${label}</i>\n`;
      for (const [d, arr] of Object.entries(byDaerah).sort()) {
        body += `\n<b>📍 ${d} (${arr.length})</b>\n`;
        for (const s of arr.slice(0, 30)) body += `• <code>${s.school_code}</code> ${s.name} — ${schoolCount[s.id] || 0} orang\n`;
        if (arr.length > 30) body += `<i>...dan ${arr.length - 30} lagi</i>\n`;
      }
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
    }
    else if (data === 'd_m_peserta') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let subQ = supabase.from('submissions').select('id, school_id').eq('badge_id', session.school_id).eq('submission_year', year);
      if (scopedSchoolIds) subQ = subQ.in('school_id', scopedSchoolIds);
      const { data: subs } = await subQ;
      const subSchoolIds = [...new Set((subs || []).map((s: any) => s.school_id))];
      if (subSchoolIds.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n👥 <b>Senarai Peserta</b>\n\n<i>Tiada peserta berdaftar.</i>`, { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: schools } = await supabase.from('schools').select('id, school_code, name').in('id', subSchoolIds).order('school_code');
      const list = (schools || []).slice(0, 50);
      const buttons = list.map((s: any) => ([{ text: `${s.school_code} ${s.name}`.slice(0, 60), callback_data: `d_mp_${s.id}` }]));
      buttons.push([{ text: '🔙 Menu', callback_data: 'd_menu' }]);
      const label = await getDataSessionLabel(supabase, group, session);
      await editMessage(chatId, msgId, `${HEADER}\n\n👥 <b>Pilih Sekolah</b>\n<i>${label}</i>\n\n${list.length} sekolah${(schools || []).length > 50 ? ' (50 teratas)' : ''}`, { inline_keyboard: buttons });
    }
    else if (data.startsWith('d_mp_')) {
      const schoolId = data.replace('d_mp_', '');
      const session = await getSession(supabase, chatId);
      const { data: school } = await supabase.from('schools').select('school_code, name').eq('id', schoolId).single();
      const year = new Date().getFullYear();
      let subQ = supabase.from('submissions').select('id').eq('school_id', schoolId).eq('submission_year', year);
      if (session?.school_id) subQ = subQ.eq('badge_id', session.school_id);
      const { data: subs } = await subQ;
      const subIds = (subs || []).map((s: any) => s.id);
      if (subIds.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n👥 <b>${school?.name}</b>\n\n<i>Tiada peserta.</i>`, { inline_keyboard: [[{ text: '🔙 Senarai Sekolah', callback_data: 'd_m_peserta' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: peeps } = await supabase.from('submission_people').select('name, ic_number, role').in('submission_id', subIds).eq('is_withdrawn', false).order('role').order('name');
      const psrt = (peeps || []).filter((p: any) => p.role === 'PESERTA' || p.role === 'PENERIMA RAMBU');
      const pmpn = (peeps || []).filter((p: any) => p.role === 'PEMIMPIN');
      const pnlg = (peeps || []).filter((p: any) => p.role === 'PENOLONG PEMIMPIN');
      const pngj = (peeps || []).filter((p: any) => p.role === 'PENGUJI');
      let body = `${HEADER}\n\n👥 <b>${school?.name} (${school?.school_code})</b>\n<i>${peeps?.length || 0} orang aktif</i>\n`;
      const fmt = (arr: any[], label: string) => {
        if (arr.length === 0) return '';
        let s = `\n<b>${label} (${arr.length}):</b>\n`;
        arr.slice(0, 30).forEach((p: any, i: number) => { s += `${i + 1}. ${p.name} ${p.ic_number ? '<code>' + p.ic_number + '</code>' : ''}\n`; });
        if (arr.length > 30) s += `<i>...${arr.length - 30} lagi</i>\n`;
        return s;
      };
      body += fmt(psrt, '🎓 Peserta');
      body += fmt(pmpn, '👨‍🏫 Pemimpin');
      body += fmt(pnlg, '🤝 Penolong Pemimpin');
      body += fmt(pngj, '🔍 Penguji');
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Senarai Sekolah', callback_data: 'd_m_peserta' }], [{ text: '📊 Menu', callback_data: 'd_menu' }]] });
    }
    else if (data === 'd_m_psh') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let q = supabase.from('school_badge_status').select('id, status, daerah_approved, school:school_id(school_code, name, daerah:daerah_id(code, name)), badge:badge_id(name)').eq('year', year).eq('badge_id', session.school_id).order('updated_at', { ascending: false });
      if (scopedSchoolIds) q = q.in('school_id', scopedSchoolIds);
      const { data: rows } = await q;
      const list = rows || [];
      const submitted = list.filter((r: any) => r.status === 'submitted');
      const approved = list.filter((r: any) => r.status === 'approved');
      const label = await getDataSessionLabel(supabase, group, session);
      let body = `${HEADER}\n\n✅ <b>Status Pengesahan ${year}</b>\n<i>${label}</i>\n\n📊 <b>Ringkasan:</b>\n• Menunggu sahkan: ${submitted.length}\n• Sudah disahkan: ${approved.length}\n`;
      if (submitted.length > 0) {
        body += `\n⏳ <b>Menunggu Sahkan:</b>\n`;
        submitted.slice(0, 25).forEach((r: any, i: number) => {
          body += `${i + 1}. ${r.school?.school_code || ''} ${r.school?.name || ''}\n`;
        });
        if (submitted.length > 25) body += `<i>...${submitted.length - 25} lagi</i>\n`;
      }
      if (approved.length > 0) {
        body += `\n✅ <b>Sudah Disahkan:</b>\n`;
        approved.slice(0, 15).forEach((r: any, i: number) => {
          body += `${i + 1}. ${r.school?.school_code || ''} ${r.school?.name || ''}\n`;
        });
        if (approved.length > 15) body += `<i>...${approved.length - 15} lagi</i>\n`;
      }
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
    }
    else if (data === 'd_sek') {
      // Senarai sekolah dalam scope
      let q = supabase.from('schools').select('id, school_code, name, daerah:daerah_id(name, code)').eq('is_active', true).order('school_code');
      if (group.role === 'negeri_admin' && group.negeri_id) q = q.eq('negeri_id', group.negeri_id);
      else if (group.role === 'daerah_admin' && group.daerah_id) q = q.eq('daerah_id', group.daerah_id);
      const { data: schools } = await q;
      const list = schools || [];
      if (list.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Tiada sekolah dalam skop anda.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      // Group by daerah
      const byDaerah: Record<string, any[]> = {};
      for (const s of list) {
        const k = (s as any).daerah?.name || 'Tidak Berdaerah';
        (byDaerah[k] = byDaerah[k] || []).push(s);
      }
      let body = '';
      for (const [d, arr] of Object.entries(byDaerah).sort()) {
        body += `\n<b>📍 ${d} (${arr.length})</b>\n`;
        for (const s of arr.slice(0, 30)) body += `• <code>${s.school_code}</code> ${s.name}\n`;
        if (arr.length > 30) body += `<i>...dan ${arr.length - 30} lagi</i>\n`;
      }
      await editMessage(chatId, msgId, truncateMsg(`${HEADER}\n\n🏫 <b>Senarai Sekolah</b> (${list.length})\n${body}`), { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
    }
    else if (data === 'd_peserta') {
      // Pilih sekolah dulu
      let q = supabase.from('schools').select('id, school_code, name').eq('is_active', true).order('school_code');
      if (group.role === 'negeri_admin' && group.negeri_id) q = q.eq('negeri_id', group.negeri_id);
      else if (group.role === 'daerah_admin' && group.daerah_id) q = q.eq('daerah_id', group.daerah_id);
      const { data: schools } = await q;
      const list = (schools || []).slice(0, 50);
      if (list.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Tiada sekolah.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const buttons = list.map((s: any) => ([{ text: `${s.school_code} ${s.name}`.slice(0, 60), callback_data: `d_p_${s.id}` }]));
      buttons.push([{ text: '🔙 Kembali', callback_data: 'd_back' }]);
      await editMessage(chatId, msgId, `${HEADER}\n\n👥 <b>Pilih Sekolah</b>\n<i>${list.length} sekolah${(schools || []).length > 50 ? ' (50 teratas)' : ''}</i>`, { inline_keyboard: buttons });
    }
    else if (data.startsWith('d_p_')) {
      const schoolId = data.replace('d_p_', '');
      const { data: school } = await supabase.from('schools').select('school_code, name').eq('id', schoolId).single();
      const year = new Date().getFullYear();
      const { data: subs } = await supabase.from('submissions').select('id, badge:badges(name)').eq('school_id', schoolId).eq('submission_year', year);
      const subIds = (subs || []).map((s: any) => s.id);
      if (subIds.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n👥 <b>${school?.name}</b>\n<i>Tiada peserta tahun ${year}.</i>`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_peserta' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: peeps } = await supabase.from('submission_people').select('name, ic_number, role, submission_id').in('submission_id', subIds).eq('is_withdrawn', false).order('role').order('name');
      const subBadgeMap: Record<string, string> = {};
      for (const s of subs || []) subBadgeMap[(s as any).id] = (s as any).badge?.name || '-';
      // Group by role
      const psrt = (peeps || []).filter((p: any) => p.role === 'PESERTA' || p.role === 'PENERIMA RAMBU');
      const pmpn = (peeps || []).filter((p: any) => p.role === 'PEMIMPIN');
      const pnlg = (peeps || []).filter((p: any) => p.role === 'PENOLONG PEMIMPIN');
      const pngj = (peeps || []).filter((p: any) => p.role === 'PENGUJI');
      let body = `${HEADER}\n\n👥 <b>${school?.name} (${school?.school_code})</b>\n<i>${peeps?.length || 0} orang aktif tahun ${year}</i>\n`;
      const fmt = (arr: any[], label: string) => {
        if (arr.length === 0) return '';
        let s = `\n<b>${label} (${arr.length}):</b>\n`;
        arr.slice(0, 30).forEach((p: any, i: number) => { s += `${i + 1}. ${p.name} ${p.ic_number ? '<code>' + p.ic_number + '</code>' : ''}\n`; });
        if (arr.length > 30) s += `<i>...${arr.length - 30} lagi</i>\n`;
        return s;
      };
      body += fmt(psrt, '🎓 Peserta');
      body += fmt(pmpn, '👨‍🏫 Pemimpin');
      body += fmt(pnlg, '🤝 Penolong Pemimpin');
      body += fmt(pngj, '🔍 Penguji');
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Pilih Sekolah Lain', callback_data: 'd_peserta' }], [{ text: '📊 Menu Utama', callback_data: 'd_back' }]] });
    }
    else if (data === 'd_psh') {
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getScopedSchoolIds(supabase, group);
      let q = supabase.from('school_badge_status').select('id, status, daerah_approved, school:school_id(school_code, name, daerah:daerah_id(code, name)), badge:badge_id(name)').eq('year', year).order('updated_at', { ascending: false });
      if (scopedSchoolIds) q = q.in('school_id', scopedSchoolIds);
      const { data: rows } = await q;
      const list = rows || [];
      const submitted = list.filter((r: any) => r.status === 'submitted');
      const approved = list.filter((r: any) => r.status === 'approved');
      const byBadge: Record<string, { sub: number; appr: number }> = {};
      for (const r of list) {
        const b = (r as any).badge?.name || '-';
        if (!byBadge[b]) byBadge[b] = { sub: 0, appr: 0 };
        if (r.status === 'submitted') byBadge[b].sub++;
        if (r.status === 'approved') byBadge[b].appr++;
      }
      let body = `${HEADER}\n\n✅ <b>Status Pengesahan ${year}</b>\n\n📊 <b>Ringkasan:</b>\n• Menunggu sahkan: ${submitted.length}\n• Sudah disahkan: ${approved.length}\n\n📈 <b>Per Program:</b>\n`;
      for (const [b, c] of Object.entries(byBadge)) body += `• ${b}: ⏳${c.sub} ✅${c.appr}\n`;
      if (submitted.length > 0) {
        body += `\n⏳ <b>Menunggu Sahkan:</b>\n`;
        submitted.slice(0, 20).forEach((r: any, i: number) => {
          body += `${i + 1}. ${r.school?.school_code || ''} ${r.school?.name || ''} — ${r.badge?.name || ''}\n`;
        });
        if (submitted.length > 20) body += `<i>...${submitted.length - 20} lagi</i>\n`;
      }
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
    }
    else if (data === 'd_m_hadir') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const today = new Date().toDateString();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let q = supabase.from('attendance_verifications').select('id, participant_count, verified_at, school:school_id(school_code, name, daerah:daerah_id(name, code)), badge:badge_id(name)').eq('year', year).eq('badge_id', session.school_id).order('verified_at', { ascending: false });
      if (scopedSchoolIds) q = q.in('school_id', scopedSchoolIds);
      const { data: rows } = await q;
      const todayRecords = (rows || []).filter((r: any) => new Date(r.verified_at).toDateString() === today);
      const label = await getDataSessionLabel(supabase, group, session);
      if (todayRecords.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n🎯 <b>Kehadiran Hari Ini</b>\n<i>${label}</i>\n\n<i>Belum ada scan kehadiran hari ini.</i>`, { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
        return new Response('OK', { status: 200 });
      }
      const totalSchools = new Set(todayRecords.map((r: any) => r.school?.school_code)).size;
      const totalPeeps = todayRecords.reduce((s: number, r: any) => s + (r.participant_count || 0), 0);
      const byDaerah: Record<string, { schools: Set<string>; people: number }> = {};
      for (const r of todayRecords) {
        const dCode = (r as any).school?.daerah?.code || '-';
        if (!byDaerah[dCode]) byDaerah[dCode] = { schools: new Set(), people: 0 };
        byDaerah[dCode].schools.add((r as any).school?.school_code || '');
        byDaerah[dCode].people += r.participant_count || 0;
      }
      let body = `${HEADER}\n\n🎯 <b>Kehadiran Hari Ini</b>\n<i>${label}</i>\n<i>${new Date().toLocaleDateString('ms-MY')}</i>\n\n📊 <b>Total:</b> ${totalSchools} sekolah, ${totalPeeps} peserta\n`;
      if (Object.keys(byDaerah).length > 1) {
        body += `\n📍 <b>Per Daerah:</b>\n`;
        for (const [d, info] of Object.entries(byDaerah)) body += `• ${d}: ${info.schools.size} sekolah, ${info.people} orang\n`;
      }
      body += `\n🏫 <b>Senarai Scan:</b>\n`;
      todayRecords.slice(0, 25).forEach((r: any, i: number) => {
        const t = new Date(r.verified_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
        body += `${i + 1}. ${r.school?.school_code || ''} ${r.school?.name || ''} — ${r.participant_count || 0} (${t})\n`;
      });
      if (todayRecords.length > 25) body += `<i>...${todayRecords.length - 25} lagi</i>\n`;
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
    }
    else if (data === 'd_m_tarik') {
      const session = await getSession(supabase, chatId);
      if (!session?.school_id) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ Sila pilih program dahulu.`, { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'd_back' }]] });
        return new Response('OK', { status: 200 });
      }
      const year = new Date().getFullYear();
      const scopedSchoolIds = await getSchoolIdsForDataSession(supabase, group, session);
      let subQ = supabase.from('submissions').select('id, school_id, school:schools(school_code, name)').eq('badge_id', session.school_id).eq('submission_year', year);
      if (scopedSchoolIds) subQ = subQ.in('school_id', scopedSchoolIds);
      const { data: subs } = await subQ;
      const subIds = (subs || []).map((s: any) => s.id);
      const label = await getDataSessionLabel(supabase, group, session);
      if (subIds.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ <b>Status Peserta</b>\n<i>${label}</i>\n\n<i>Tiada data dalam skop.</i>`, { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
        return new Response('OK', { status: 200 });
      }
      const { data: tarik } = await supabase.from('submission_people').select('name, ic_number, withdrawn_at, withdrawal_reason, withdrawal_notes, submission_id').in('submission_id', subIds).eq('is_withdrawn', true).order('withdrawn_at', { ascending: false });
      const list = tarik || [];
      if (list.length === 0) {
        await editMessage(chatId, msgId, `${HEADER}\n\n⚠️ <b>Status Peserta (Tarik Diri)</b>\n<i>${label}</i>\n\n<i>Tiada peserta tarik diri.</i>`, { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
        return new Response('OK', { status: 200 });
      }
      const subMap: Record<string, any> = {};
      for (const s of subs || []) subMap[(s as any).id] = s;
      const byReason: Record<string, number> = {};
      for (const t of list) {
        const r = (t as any).withdrawal_reason || 'Tidak Dinyatakan';
        byReason[r] = (byReason[r] || 0) + 1;
      }
      const reasonLines = Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([r, c]) => `• ${r}: ${c}`).join('\n');
      let body = `${HEADER}\n\n⚠️ <b>Status Peserta (Tarik Diri)</b>\n<i>${label}</i>\n\n📊 <b>Total:</b> ${list.length} orang\n\n📈 <b>Pecahan Sebab:</b>\n${reasonLines}\n\n👥 <b>Senarai:</b>\n`;
      list.slice(0, 20).forEach((p: any, i: number) => {
        const sub = subMap[p.submission_id];
        const sch = sub?.school?.name || '-';
        const t = p.withdrawn_at ? new Date(p.withdrawn_at).toLocaleString('ms-MY', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-';
        body += `${i + 1}. ${p.name}\n   ${sch}\n   ⏰ ${t} · ${p.withdrawal_reason || '-'}\n`;
      });
      if (list.length > 20) body += `\n<i>...${list.length - 20} lagi</i>`;
      await editMessage(chatId, msgId, truncateMsg(body), { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'd_menu' }]] });
    }

      return new Response('OK', { status: 200 });
    }

    const msg = body.message || {};
    const chatId = String(msg.chat?.id);
    const text = msg.text || '';
    // Extract command - handle multiple formats:
    // /data, /data@bot, @bot /data
    let cleanText = text.trim();
    // Remove @botusername mention from anywhere
    cleanText = cleanText.replace(/@\w+/g, '').trim();
    const replyToMessageId = msg.reply_to_message?.message_id;
    const from = msg.from || {};

    // Check group scope - reject jika bukan group yang berdaftar
    const group = await getGroupByChat(supabase, chatId);
    if (!group) {
      // Kalau belum register, reply chat ID untuk setup
      if (cleanText === '/getchatid' || cleanText === '/start') {
        await sendMessage(chatId, `${HEADER}

📋 <b>Chat ID:</b>
<code>${chatId}</code>

<i>Group ini belum didaftarkan dalam sistem.
Berikan chat ID di atas kepada developer untuk didaftarkan.</i>`);
      }
      return new Response('OK', { status: 200 });
    }

    // Set menu commands untuk group ini
    if (cleanText === '/start') {
      await setCommands(chatId, group.role);
      await sendMessage(chatId, `${HEADER}

✅ <b>Bot Aktif!</b>

📋 <b>Group:</b> ${group.label}
🔑 <b>Role:</b> ${group.role}

<b>Menu Tersedia:</b>
/broadcast — 📢 Hantar Siaran
/data — 📊 Pusat Data
/scan — 🎯 Scan Kehadiran`);
      return new Response('OK', { status: 200 });
    }

    // Ambil session dari Supabase
    const session = await getSession(supabase, chatId);

    // Command untuk tampilkan menu siaran
    if (cleanText === '/siaran' || cleanText === '/broadcast') {
      await clearSession(supabase, chatId);
      const { data: negeriData } = group.negeri_id
        ? await supabase.from('negeri').select('name').eq('id', group.negeri_id).single()
        : { data: null };
      await sendMessage(chatId, `${HEADER}\n\n📢 <b>Pilih Skop Siaran:</b>`, getBroadcastMenuMarkup(group.role, negeriData?.name));
      return new Response('OK', { status: 200 });
    }

    // Command Pusat Data
    if (cleanText === '/data') {
      await clearSession(supabase, chatId);
      // Developer perlu pilih negeri dahulu
      if (group.role === 'developer') {
        const { data: negeris } = await supabase.from('negeri').select('id, code, name').order('name');
        const buttons: any[] = (negeris || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `dn_${n.id}` }]));
        buttons.unshift([{ text: '🌐 Semua Negeri', callback_data: 'dn_all' }]);
        await sendMessage(chatId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>Pilih negeri untuk lihat program:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      // Negeri admin: tunjuk program negeri + butang lihat program daerah
      if (group.role === 'negeri_admin' && group.negeri_id) {
        await updateSession(supabase, chatId, { negeri_id: group.negeri_id, daerah_id: null });
        const { data: n } = await supabase.from('negeri').select('name').eq('id', group.negeri_id).single();
        const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
        const filtered = (badges || []).filter((b: any) => {
          const s = b.scope || 'daerah';
          return s === 'negeri' && b.negeri_id === group.negeri_id;
        });
        const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `dp_${b.id}` }]));
        buttons.push([{ text: '📍 Lihat Program Daerah', callback_data: `dnd_${group.negeri_id}` }]);
        const headerInfo = filtered.length === 0
          ? `\n\n⚠️ Tiada program peringkat negeri.`
          : `\n\nProgram peringkat negeri:`;
        await sendMessage(chatId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>🗺️ ${n?.name || ''}</i>${headerInfo}`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      // Daerah admin: terus ke senarai program
      const badges = await getBadgesForRole(supabase, group);
      if (badges.length === 0) {
        await sendMessage(chatId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n\n⚠️ Tiada program tersedia.`);
        return new Response('OK', { status: 200 });
      }
      const buttons = badges.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `dp_${b.id}` }]));
      await sendMessage(chatId, `${HEADER}\n\n📊 <b>Pusat Data</b>\n<i>Pilih program untuk lihat data:</i>`, { inline_keyboard: buttons });
      return new Response('OK', { status: 200 });
    }

    // Command Scan Kehadiran
    if (cleanText === '/scan') {
      if (group.role !== 'developer' && group.role !== 'negeri_admin' && group.role !== 'daerah_admin') {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Anda tidak mempunyai akses untuk scan kehadiran.`);
        return new Response('OK', { status: 200 });
      }
      await clearSession(supabase, chatId);
      // Developer pilih negeri dahulu
      if (group.role === 'developer') {
        const { data: negeris } = await supabase.from('negeri').select('id, code, name').order('name');
        const buttons: any[] = (negeris || []).map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `xn_${n.id}` }]));
        await sendMessage(chatId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>Pilih negeri untuk lihat program:</i>`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      // Negeri admin: tunjuk program negeri + butang lihat program daerah
      if (group.role === 'negeri_admin' && group.negeri_id) {
        const { data: n } = await supabase.from('negeri').select('name').eq('id', group.negeri_id).single();
        const { data: badges } = await supabase.from('badges').select('id, name, scope, negeri_id, daerah_id').order('name');
        const filtered = (badges || []).filter((b: any) => {
          const s = b.scope || 'daerah';
          return s === 'negeri' && b.negeri_id === group.negeri_id;
        });
        const buttons: any[] = filtered.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `sp_${b.id}` }]));
        buttons.push([{ text: '📍 Lihat Program Daerah', callback_data: `xnd_${group.negeri_id}` }]);
        const headerInfo = filtered.length === 0
          ? `\n\n⚠️ Tiada program peringkat negeri.`
          : `\n\nProgram peringkat negeri:`;
        await sendMessage(chatId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>🗺️ ${n?.name || ''}</i>${headerInfo}`, { inline_keyboard: buttons });
        return new Response('OK', { status: 200 });
      }
      // Daerah admin: terus ke senarai program
      const badges = await getBadgesForRole(supabase, group);
      if (badges.length === 0) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Tiada program tersedia.`);
        return new Response('OK', { status: 200 });
      }
      const buttons = badges.map((b: any) => ([{ text: `🎯 ${b.name}`, callback_data: `sp_${b.id}` }]));
      await sendMessage(chatId, `${HEADER}\n\n🎯 <b>Scan Kehadiran</b>\n<i>Pilih program untuk scan:</i>`, { inline_keyboard: buttons });
      return new Response('OK', { status: 200 });
    }

    // Batal session scan
    if (cleanText === '/batal') {
      await clearSession(supabase, chatId);
      await sendMessage(chatId, `${HEADER}\n\n✅ Sesi dibatalkan.`);
      return new Response('OK', { status: 200 });
    }

    // Command untuk dapatkan chat ID (untuk setup group baru)
    if (text === '/getchatid') {
      await sendMessage(chatId, `${HEADER}

📋 <b>Chat ID Group Ini:</b>
<code>${chatId}</code>

<i>Copy chat ID di atas untuk register group ini dalam sistem.</i>`);
      return new Response('OK', { status: 200 });
    }

    // Command start / menu
    if (text === '/start' || text === '/menu') {
      await clearSession(supabase);
      const menuKeyboard = { inline_keyboard: [[{ text: '📢 Buat Siaran', callback_data: 'broadcast' }]] };
      await sendMessage(chatId, `👋 <b>Selamat datang ke Panel Admin</b>\n\nPilih tindakan:`, { reply_markup: JSON.stringify(menuKeyboard) });
      return new Response('OK', { status: 200 });
    }

    // Terima QR scan dari user
    if (session?.step === 'scan_waiting' && !replyToMessageId) {
      // Parse QR data
      let parsed: any = null;
      try {
        parsed = JSON.parse(text.trim());
      } catch (_) {
        parsed = null;
      }

      if (!parsed || !parsed.schoolCode || !parsed.badge) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ <b>QR Tidak Sah</b>\n\nPaste data QR sekolah yang sah, atau taip /batal untuk batal.`);
        return new Response('OK', { status: 200 });
      }

      // Validate school exists & dalam scope admin
      const { data: school } = await supabase.from('schools').select('id, school_code, name, negeri_id, daerah_id').eq('school_code', parsed.schoolCode).maybeSingle();
      if (!school) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Sekolah <code>${parsed.schoolCode}</code> tidak dijumpai.`);
        return new Response('OK', { status: 200 });
      }

      // Scope check
      if (group.role === 'daerah_admin' && school.daerah_id !== group.daerah_id) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Sekolah ini bukan dalam daerah anda.`);
        return new Response('OK', { status: 200 });
      }
      if (group.role === 'negeri_admin' && school.negeri_id !== group.negeri_id) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Sekolah ini bukan dalam negeri anda.`);
        return new Response('OK', { status: 200 });
      }

      // Get badge
      const { data: badge } = await supabase.from('badges').select('id, name').eq('name', parsed.badge).maybeSingle();
      if (!badge) {
        await sendMessage(chatId, `${HEADER}\n\n⚠️ Program <b>${parsed.badge}</b> tidak dijumpai.`);
        return new Response('OK', { status: 200 });
      }

      // Get participant count
      const year = parsed.year || new Date().getFullYear();
      const { data: subs } = await supabase.from('submissions').select('id').eq('school_id', school.id).eq('badge_id', badge.id).eq('submission_year', year);
      const subIds = (subs || []).map((s: any) => s.id);
      let participantCount = 0;
      if (subIds.length > 0) {
        const { count } = await supabase.from('submission_people').select('*', { count: 'exact', head: true }).in('submission_id', subIds).eq('is_withdrawn', false);
        participantCount = count || 0;
      }

      // Save to session
      await updateSession(supabase, chatId, {
        step: 'scan_confirm',
        school_id: school.id,
        school_name: school.name,
        negeri_id: badge.id, // reuse field utk badge id
        daerah_name: String(participantCount), // reuse field utk count
        scope: String(year), // reuse field utk year
      });

      await sendMessage(chatId, `${HEADER}

✅ <b>QR Disahkan</b>

🏫 <b>Sekolah:</b> ${school.name}
📋 <b>Kod:</b> <code>${school.school_code}</code>
🎯 <b>Program:</b> ${badge.name}
📅 <b>Tahun:</b> ${year}
👥 <b>Peserta Aktif:</b> ${participantCount} orang

Klik butang untuk sahkan kehadiran:`, {
        inline_keyboard: [
          [{ text: '✅ Sahkan Kehadiran', callback_data: `sc_ok` }],
          [{ text: '❌ Batal', callback_data: `sc_cancel` }],
        ],
      });
      return new Response('OK', { status: 200 });
    }

    // Terima mesej broadcast
    if (session?.step === 'waiting_message' && !replyToMessageId) {
      const scope = session.scope;
      const scopeName = session.school_name || session.daerah_name || session.negeri_name || 'Semua';

      // Enforce scope mengikut role group
      let effectiveNegeriId = session.negeri_id;
      let effectiveDaerahId = session.daerah_id;
      let effectiveSchoolId = session.school_id;

      if (group.role === 'daerah_admin') {
        // Admin daerah hanya boleh broadcast dalam daerah dia
        effectiveDaerahId = group.daerah_id;
        effectiveNegeriId = null;
      } else if (group.role === 'negeri_admin' && scope === 'all') {
        // Admin negeri scope all = semua dalam negeri dia
        effectiveNegeriId = group.negeri_id;
      }

      const count = await broadcastNotification(supabase, text, scope, effectiveNegeriId, effectiveDaerahId, effectiveSchoolId, scopeName);

      await clearSession(supabase, chatId);

      if (count > 0) {
        await sendMessage(chatId, `${HEADER}

✅ <b>Siaran Berjaya!</b>

📊 <b>Statistik Penghantaran:</b>
├ 👥 Penerima: <b>${count} pengguna</b>
├ 📍 Skop: <b>${scopeName}</b>
└ 🕐 Masa: <b>${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</b>

💬 <b>Mesej yang dihantar:</b>
<blockquote>${text}</blockquote>`);
      } else {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Tiada Pengguna Ditemui</b>

Tiada pengguna berdaftar untuk skop <b>${scopeName}</b>.
Mesej tidak dihantar.`);
      }

      return new Response('OK', { status: 200 });
    }

    // Handle reply (balas aduan user)
    if (replyToMessageId) {
      // Cari feedback berdasarkan telegram_message_id DAN chat_id group ini
      const { data: ftm, error: ftmError } = await supabase
        .from('feedback_telegram_messages')
        .select('feedback_id')
        .eq('telegram_message_id', replyToMessageId)
        .eq('chat_id', chatId)
        .single();

      // Fallback - cari dalam feedbacks terus (untuk mesej lama)
      let feedbackId = ftm?.feedback_id;
      if (!feedbackId) {
        const { data: oldFeedback } = await supabase
          .from('feedbacks')
          .select('id')
          .eq('telegram_message_id', replyToMessageId)
          .single();
        feedbackId = oldFeedback?.id;
      }

      if (!feedbackId) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Pertanyaan Tidak Dijumpai</b>

Mesej ID: <code>${replyToMessageId}</code>
Pastikan anda <b>reply</b> kepada mesej pertanyaan asal dari pengguna.`);
        return new Response('OK', { status: 200 });
      }

      const { data: feedback, error: feedbackError } = await supabase
        .from('feedbacks')
        .select('id, user_id, sender_name, sender_email, negeri_id, daerah_id')
        .eq('id', feedbackId)
        .single();

      if (feedbackError || !feedback) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Pertanyaan Tidak Dijumpai</b>

Pastikan anda <b>reply</b> kepada mesej pertanyaan asal dari pengguna.`);
        return new Response('OK', { status: 200 });
      }

      // Semak scope - admin daerah hanya boleh reply feedback dalam daerah dia
      if (group.role === 'daerah_admin' && feedback.daerah_id !== group.daerah_id) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Akses Ditolak</b>
Pertanyaan ini bukan dari daerah anda.`);
        return new Response('OK', { status: 200 });
      }

      if (group.role === 'negeri_admin' && feedback.negeri_id !== group.negeri_id) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Akses Ditolak</b>
Pertanyaan ini bukan dari negeri anda.`);
        return new Response('OK', { status: 200 });
      }

      if (!feedback.user_id) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Pengguna Tidak Boleh Dikenal Pasti</b>

Pertanyaan dari <b>${feedback.sender_name}</b> (${feedback.sender_email}) tidak mempunyai akaun berdaftar.
Sila hubungi pengguna terus melalui email: <b>${feedback.sender_email}</b>`);
        return new Response('OK', { status: 200 });
      }

      const replyFromLabel = group.role === 'developer' ? 'Admin Utama' : group.role === 'negeri_admin' ? 'Admin Negeri' : 'Admin Daerah';

      const { error: notifError } = await supabase.from('notifications').insert({
        feedback_id: feedback.id,
        user_id: feedback.user_id,
        title: `Maklum Balas daripada ${replyFromLabel}`,
        message: text,
        is_read: false,
      });

      if (notifError) {
        console.error('Notification insert error:', notifError);
        await sendMessage(chatId, `${HEADER}

❌ <b>Ralat Penghantaran</b>

Gagal hantar notifikasi kepada <b>${feedback.sender_name}</b>.
Ralat: <code>${notifError.message}</code>`);
        return new Response('OK', { status: 200 });
      }

      await supabase.from('feedbacks').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', feedback.id);
      await sendMessage(chatId, `${HEADER}

✅ <b>Reply Berjaya Dihantar!</b>

👤 Penerima: <b>${feedback.sender_name}</b>
📧 Email: <b>${feedback.sender_email}</b>
📝 Status: <b>Pertanyaan Selesai</b>
🕐 Masa: <b>${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</b>

💬 Reply anda:
<blockquote>${text}</blockquote>`);
      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
