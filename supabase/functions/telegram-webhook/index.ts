import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '39114512';

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await req.json();
    const message = body?.message;

    if (!message) {
      return new Response('OK', { status: 200 });
    }

    const chatId = String(message.chat?.id);
    const text: string = message.text || '';
    const replyToMessageId: number | undefined = message.reply_to_message?.message_id;

    // Pastikan mesej dari admin (chat ID kau)
    if (chatId !== ADMIN_CHAT_ID) {
      return new Response('OK', { status: 200 });
    }

    // Mesti reply kepada mesej (bukan mesej baru)
    if (!replyToMessageId) {
      return new Response('OK', { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cari feedback berdasarkan telegram_message_id
    const { data: feedback, error: feedbackError } = await supabase
      .from('feedbacks')
      .select('id, user_id, sender_name')
      .eq('telegram_message_id', replyToMessageId)
      .single();

    if (feedbackError || !feedback) {
      console.error('Feedback not found for message_id:', replyToMessageId);
      // Hantar mesej balik ke Telegram untuk maklumkan admin
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: '⚠️ Aduan tidak dijumpai dalam sistem. Pastikan anda reply kepada mesej aduan asal.',
        }),
      });
      return new Response('OK', { status: 200 });
    }

    // Simpan notification untuk user
    const { error: notifError } = await supabase.from('notifications').insert({
      feedback_id: feedback.id,
      user_id: feedback.user_id,
      title: 'Maklum Balas Aduan',
      message: text,
      is_read: false,
    });

    if (notifError) {
      console.error('Error inserting notification:', notifError);
      return new Response('Error', { status: 500 });
    }

    // Update status feedback kepada resolved
    await supabase
      .from('feedbacks')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', feedback.id);

    // Confirm kepada admin dalam Telegram
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: `✅ Reply berjaya dihantar kepada ${feedback.sender_name}. Aduan ditandakan sebagai selesai.`,
      }),
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
