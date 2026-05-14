import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '39114512';

const SUPABASE_URL = 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export interface FeedbackPayload {
  userId?: string;
  senderName: string;
  senderEmail: string;
  role: string;
  schoolName?: string;
  message: string;
}

export async function sendTelegramFeedback(payload: FeedbackPayload): Promise<boolean> {
  try {
    const roleLabel: Record<string, string> = {
      school_user: 'Guru / Sekolah',
      daerah_admin: 'Admin Daerah',
      negeri_admin: 'Admin Negeri',
      admin: 'Admin',
      developer: 'Developer',
    };

    const now = new Date().toLocaleString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const text = [
      `📩 Maklum Balas / Masalah Baru`,
      ``,
      `👤 Nama: ${payload.senderName}`,
      `📧 Email: ${payload.senderEmail}`,
      `🏷 Peranan: ${roleLabel[payload.role] ?? payload.role}`,
      payload.schoolName ? `🏫 Sekolah: ${payload.schoolName}` : null,
      `🕐 Masa: ${now}`,
      ``,
      `💬 Mesej:`,
      `${payload.message}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    // Hantar ke Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
        }),
      }
    );

    const result = await response.json();
    if (!result.ok) {
      console.error('Telegram API error:', JSON.stringify(result));
      return false;
    }

    // Simpan feedback dalam Supabase
    const telegramMessageId = result.result?.message_id ?? null;

    const { supabase } = await import('./supabaseClient');
    await supabase.from('feedbacks').insert({
      user_id: payload.userId || null,
      sender_name: payload.senderName,
      sender_email: payload.senderEmail,
      role: payload.role,
      school_name: payload.schoolName || null,
      message: payload.message,
      telegram_message_id: telegramMessageId,
      status: 'open',
    });

    return true;
  } catch (error) {
    console.error('Telegram send error:', error);
    return false;
  }
}

// Ambil notifications untuk user
export async function getUserNotifications(userId: string) {
  const { supabase } = await import('./supabaseClient');
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
  return data || [];
}

// Mark notification as read
export async function markNotificationRead(notificationId: string) {
  const { supabase } = await import('./supabaseClient');
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
}

// Mark semua notifications as read
export async function markAllNotificationsRead(userId: string) {
  const { supabase } = await import('./supabaseClient');
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}
