import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '39114512';

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

async function getSession(supabase: any) {
  const { data } = await supabase.from('broadcast_sessions').select('*').eq('id', 'admin_session').single();
  return data;
}

async function updateSession(supabase: any, updates: object) {
  await supabase.from('broadcast_sessions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', 'admin_session');
}

async function clearSession(supabase: any) {
  await supabase.from('broadcast_sessions').update({
    step: null, scope: null, negeri_id: null, negeri_name: null, daerah_id: null, daerah_name: null,
    updated_at: new Date().toISOString()
  }).eq('id', 'admin_session');
}

async function broadcastNotification(supabase: any, message: string, scope: string, negeriId?: string, daerahId?: string, scopeName?: string) {
  let query = supabase.from('schools').select('claimed_by').eq('is_claimed', true).not('claimed_by', 'is', null);

  if (scope === 'negeri' && negeriId) {
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

      if (chatId !== ADMIN_CHAT_ID) {
        await answerCallbackQuery(callbackQuery.id);
        return new Response('OK', { status: 200 });
      }

      await answerCallbackQuery(callbackQuery.id);

      if (data === 'scope_all') {
        await updateSession(supabase, { step: 'waiting_message', scope: 'all', negeri_name: 'Semua Pengguna', negeri_id: null, daerah_id: null, daerah_name: null });
        await editMessage(chatId, msgId, `${HEADER}

🌐 <b>Skop:</b> Semua Pengguna

✏️ Taip mesej siaran anda sekarang:`);

      } else if (data === 'scope_negeri') {
        await updateSession(supabase, { step: 'choose_negeri', scope: 'negeri' });
        const { data: negeriList } = await supabase.from('negeri').select('id,name').order('name');
        const buttons = negeriList?.map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `negeri_${n.id}|${n.name}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

🗺️ <b>Pilih Negeri</b>
<i>Mesej akan dihantar kepada semua pengguna dalam negeri yang dipilih</i>`, { inline_keyboard: buttons });

      } else if (data === 'scope_daerah') {
        await updateSession(supabase, { step: 'choose_negeri', scope: 'daerah' });
        const { data: negeriList } = await supabase.from('negeri').select('id,name').order('name');
        const buttons = negeriList?.map((n: any) => ([{ text: `🗺️ ${n.name}`, callback_data: `pick_negeri_${n.id}|${n.name}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Pilih Negeri</b>
<i>Langkah 1/2 — Pilih negeri dahulu</i>`, { inline_keyboard: buttons });

      } else if (data.startsWith('negeri_')) {
        const withoutPrefix = data.replace('negeri_', '');
        const pipeIdx = withoutPrefix.indexOf('|');
        const negeriId = withoutPrefix.substring(0, pipeIdx);
        const negeriName = withoutPrefix.substring(pipeIdx + 1);
        await updateSession(supabase, { step: 'waiting_message', negeri_id: negeriId, negeri_name: negeriName });
        await editMessage(chatId, msgId, `${HEADER}

🗺️ <b>Negeri:</b> ${negeriName}

✏️ Taip mesej siaran anda sekarang:`);

      } else if (data.startsWith('pick_negeri_')) {
        const withoutPrefix = data.replace('pick_negeri_', '');
        const pipeIdx = withoutPrefix.indexOf('|');
        const negeriId = withoutPrefix.substring(0, pipeIdx);
        const negeriName = withoutPrefix.substring(pipeIdx + 1);
        await updateSession(supabase, { step: 'choose_daerah', negeri_id: negeriId, negeri_name: negeriName });
        const { data: daerahList } = await supabase.from('daerah').select('id,name').eq('negeri_id', negeriId).order('name');
        const buttons = daerahList?.map((d: any) => ([{ text: `📍 ${d.name}`, callback_data: `daerah_${d.id}|${d.name}` }])) || [];
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Pilih Daerah</b> — ${negeriName}
<i>Langkah 2/2 — Pilih daerah</i>`, { inline_keyboard: buttons });

      } else if (data.startsWith('daerah_')) {
        const withoutPrefix = data.replace('daerah_', '');
        const pipeIdx = withoutPrefix.indexOf('|');
        const daerahId = withoutPrefix.substring(0, pipeIdx);
        const daerahName = withoutPrefix.substring(pipeIdx + 1);
        await updateSession(supabase, { step: 'waiting_message', daerah_id: daerahId, daerah_name: daerahName });
        await editMessage(chatId, msgId, `${HEADER}

📍 <b>Daerah:</b> ${daerahName}

✏️ Taip mesej siaran anda sekarang:`);
      }

      return new Response('OK', { status: 200 });
    }

    // Handle regular message
    const message = body?.message;
    if (!message) return new Response('OK', { status: 200 });

    const chatId = String(message.chat?.id);
    const text: string = message.text || '';
    const replyToMessageId: number | undefined = message.reply_to_message?.message_id;

    if (chatId !== ADMIN_CHAT_ID) return new Response('OK', { status: 200 });

    // Command /broadcast
    if (text === '/broadcast') {
      await clearSession(supabase);
      await sendMessage(chatId, `${HEADER}

📢 <b>Sistem Siaran Mesej</b>
<i>Pilih skop penghantaran mesej kepada pengguna</i>

`, {
        inline_keyboard: [
          [{ text: '📍  Mengikut Daerah', callback_data: 'scope_daerah' }],
          [{ text: '🗺️  Mengikut Negeri', callback_data: 'scope_negeri' }],
          [{ text: '🌐  Semua Pengguna', callback_data: 'scope_all' }],
        ],
      });
      return new Response('OK', { status: 200 });
    }

    // Ambil session dari Supabase
    const session = await getSession(supabase);

    // Terima mesej broadcast
    if (session?.step === 'waiting_message' && !replyToMessageId) {
      const scope = session.scope;
      const scopeName = session.daerah_name || session.negeri_name || 'Semua';

      const count = await broadcastNotification(supabase, text, scope, session.negeri_id, session.daerah_id, scopeName);

      await clearSession(supabase);

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
      const { data: feedback, error: feedbackError } = await supabase
        .from('feedbacks')
        .select('id, user_id, sender_name')
        .eq('telegram_message_id', replyToMessageId)
        .single();

      if (feedbackError || !feedback) {
        await sendMessage(chatId, `${HEADER}

⚠️ <b>Pertanyaan Tidak Dijumpai</b>

Pastikan anda <b>reply</b> kepada mesej pertanyaan asal dari pengguna.`);
        return new Response('OK', { status: 200 });
      }

      await supabase.from('notifications').insert({
        feedback_id: feedback.id,
        user_id: feedback.user_id,
        title: 'Maklum Balas Pertanyaan',
        message: text,
        is_read: false,
      });

      await supabase.from('feedbacks').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', feedback.id);
      await sendMessage(chatId, `${HEADER}

✅ <b>Reply Berjaya Dihantar!</b>

👤 Penerima: <b>${feedback.sender_name}</b>
📝 Status: <b>Pertanyaan Selesai</b>
🕐 Masa: <b>${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</b>

💬 <b>Reply anda:</b>
<blockquote>${text}</blockquote>`);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
