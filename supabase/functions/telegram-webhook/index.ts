import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '39114512';

// State untuk simpan broadcast session (in-memory, cukup untuk satu admin)
const broadcastSession: {
  step?: 'choose_scope' | 'choose_negeri' | 'choose_daerah' | 'waiting_message';
  scope?: 'daerah' | 'negeri' | 'all';
  negeriId?: string;
  negeriName?: string;
  daerahId?: string;
  daerahName?: string;
} = {};

async function sendMessage(chatId: string, text: string, replyMarkup?: object) {
  const body: any = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function broadcastNotification(
  supabase: any,
  message: string,
  scope: 'all' | 'negeri' | 'daerah',
  negeriId?: string,
  daerahId?: string,
  scopeName?: string
) {
  // Ambil semua user berdasarkan scope
  let query = supabase.from('profiles').select('id').eq('role', 'school_user').eq('is_active', true);

  if (scope === 'negeri' && negeriId) {
    query = query.eq('negeri_id', negeriId);
  } else if (scope === 'daerah' && daerahId) {
    query = query.eq('daerah_id', daerahId);
  }

  const { data: users, error } = await query;
  if (error || !users || users.length === 0) return 0;

  // Insert notification untuk semua user
  const notifications = users.map((u: any) => ({
    user_id: u.id,
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

  return users.length;
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
      const data = callbackQuery.data as string;

      if (chatId !== ADMIN_CHAT_ID) {
        await answerCallbackQuery(callbackQuery.id);
        return new Response('OK', { status: 200 });
      }

      await answerCallbackQuery(callbackQuery.id);

      // Pilih scope
      if (data === 'scope_all') {
        broadcastSession.step = 'waiting_message';
        broadcastSession.scope = 'all';
        broadcastSession.negeriId = undefined;
        broadcastSession.daerahId = undefined;
        broadcastSession.negeriName = 'Semua Pengguna';
        broadcastSession.daerahName = undefined;
        await sendMessage(chatId, '✏️ Taip mesej untuk dihantar kepada SEMUA pengguna:');

      } else if (data === 'scope_negeri') {
        broadcastSession.step = 'choose_negeri';
        broadcastSession.scope = 'negeri';

        const { data: negeriList } = await supabase.from('negeri').select('id,name').order('name');
        const buttons = negeriList?.map((n: any) => ([{ text: n.name, callback_data: `negeri_${n.id}_${n.name}` }])) || [];
        await sendMessage(chatId, '🗺️ Pilih negeri:', { inline_keyboard: buttons });

      } else if (data === 'scope_daerah') {
        broadcastSession.step = 'choose_negeri';
        broadcastSession.scope = 'daerah';

        const { data: negeriList } = await supabase.from('negeri').select('id,name').order('name');
        const buttons = negeriList?.map((n: any) => ([{ text: n.name, callback_data: `pick_negeri_${n.id}_${n.name}` }])) || [];
        await sendMessage(chatId, '🗺️ Pilih negeri dulu:', { inline_keyboard: buttons });

      } else if (data.startsWith('negeri_')) {
        // Broadcast ke negeri terus
        const parts = data.split('_');
        const negeriId = parts[1];
        const negeriName = parts.slice(2).join('_');
        broadcastSession.step = 'waiting_message';
        broadcastSession.negeriId = negeriId;
        broadcastSession.negeriName = negeriName;
        await sendMessage(chatId, `✏️ Taip mesej untuk dihantar kepada semua pengguna di negeri *${negeriName}*:`);

      } else if (data.startsWith('pick_negeri_')) {
        // Pilih negeri untuk kemudian pilih daerah
        const parts = data.split('_');
        const negeriId = parts[2];
        const negeriName = parts.slice(3).join('_');
        broadcastSession.negeriId = negeriId;
        broadcastSession.negeriName = negeriName;
        broadcastSession.step = 'choose_daerah';

        const { data: daerahList } = await supabase.from('daerah').select('id,name').eq('negeri_id', negeriId).order('name');
        const buttons = daerahList?.map((d: any) => ([{ text: d.name, callback_data: `daerah_${d.id}_${d.name}` }])) || [];
        await sendMessage(chatId, `📍 Pilih daerah dalam ${negeriName}:`, { inline_keyboard: buttons });

      } else if (data.startsWith('daerah_')) {
        const parts = data.split('_');
        const daerahId = parts[1];
        const daerahName = parts.slice(2).join('_');
        broadcastSession.step = 'waiting_message';
        broadcastSession.daerahId = daerahId;
        broadcastSession.daerahName = daerahName;
        await sendMessage(chatId, `✏️ Taip mesej untuk dihantar kepada semua pengguna di daerah *${daerahName}*:`);
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
      broadcastSession.step = 'choose_scope';
      await sendMessage(chatId, '📢 Pilih skop penghantaran mesej:', {
        inline_keyboard: [
          [{ text: '📍 Daerah', callback_data: 'scope_daerah' }],
          [{ text: '🗺️ Negeri', callback_data: 'scope_negeri' }],
          [{ text: '🌐 Semua Pengguna', callback_data: 'scope_all' }],
        ],
      });
      return new Response('OK', { status: 200 });
    }

    // Terima mesej broadcast
    if (broadcastSession.step === 'waiting_message' && !replyToMessageId) {
      const scope = broadcastSession.scope!;
      const scopeName = broadcastSession.daerahName || broadcastSession.negeriName || 'Semua';

      const count = await broadcastNotification(
        supabase,
        text,
        scope,
        broadcastSession.negeriId,
        broadcastSession.daerahId,
        scopeName
      );

      // Reset session
      broadcastSession.step = undefined;
      broadcastSession.scope = undefined;
      broadcastSession.negeriId = undefined;
      broadcastSession.daerahId = undefined;
      broadcastSession.negeriName = undefined;
      broadcastSession.daerahName = undefined;

      if (count > 0) {
        await sendMessage(chatId, `✅ Mesej berjaya dihantar kepada ${count} pengguna di ${scopeName}.`);
      } else {
        await sendMessage(chatId, `⚠️ Tiada pengguna ditemui untuk ${scopeName}. Mesej tidak dihantar.`);
      }

      return new Response('OK', { status: 200 });
    }

    // Handle reply (untuk balas aduan user)
    if (replyToMessageId) {
      const { data: feedback, error: feedbackError } = await supabase
        .from('feedbacks')
        .select('id, user_id, sender_name')
        .eq('telegram_message_id', replyToMessageId)
        .single();

      if (feedbackError || !feedback) {
        await sendMessage(chatId, '⚠️ Aduan tidak dijumpai dalam sistem. Pastikan anda reply kepada mesej aduan asal.');
        return new Response('OK', { status: 200 });
      }

      await supabase.from('notifications').insert({
        feedback_id: feedback.id,
        user_id: feedback.user_id,
        title: 'Maklum Balas Aduan',
        message: text,
        is_read: false,
      });

      await supabase.from('feedbacks').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', feedback.id);
      await sendMessage(chatId, `✅ Reply berjaya dihantar kepada ${feedback.sender_name}. Aduan ditandakan sebagai selesai.`);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
