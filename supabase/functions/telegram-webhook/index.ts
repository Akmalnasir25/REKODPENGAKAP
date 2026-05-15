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

      return new Response('OK', { status: 200 });
    }

    const msg = body.message || {};
    const chatId = String(msg.chat?.id);
    const text = msg.text || '';
    const cleanText = text.split('@')[0]; // Buang @botusername dari command
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
/broadcast — 📢 Hantar Siaran`);
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

    // Command untuk dapatkan chat ID (untuk setup group baru)
    if (text === '/getchatid') {
      await sendMessage(chatId, `${HEADER}

📋 <b>Chat ID Group Ini:</b>
<code>${chatId}</code>

<i>Copy chat ID di atas untuk register group ini dalam sistem.</i>`);
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
