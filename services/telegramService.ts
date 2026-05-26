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
  schoolId?: string;
  message: string;
  category?: 'sistem' | 'umum'; // Default: umum
}

export async function sendTelegramFeedback(payload: FeedbackPayload): Promise<boolean> {
  try {
    const { supabase } = await import('./supabaseClient');

    // Ambil negeri_id dan daerah_id dari sekolah user
    let negeriId: string | null = null;
    let daerahId: string | null = null;

    if (payload.schoolId) {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('negeri_id, daerah_id')
        .eq('id', payload.schoolId)
        .single();

      if (schoolData) {
        negeriId = schoolData.negeri_id;
        daerahId = schoolData.daerah_id;
      }
    }

    // Ambil semua groups yang perlu terima mesej ini
    let groupsQuery = supabase
      .from('telegram_groups')
      .select('chat_id, role, label, negeri_id, daerah_id')
      .eq('is_active', true);

    const { data: allGroups } = await groupsQuery;

    const category = payload.category || 'umum'; // Default: umum

    // Filter groups berdasarkan scope dan kategori
    const targetGroups = (allGroups || []).filter((group: any) => {
      // Developer dapat semua kategori
      if (group.role === 'developer') {
        return category === 'sistem'; // Developer hanya dapat kategori 'sistem'
      }
      
      // Kategori 'umum' - hantar ke admin negeri dan daerah
      if (category === 'umum') {
        if (group.role === 'negeri_admin' && group.negeri_id === negeriId) return true;
        if (group.role === 'daerah_admin' && group.daerah_id === daerahId) return true;
      }
      
      return false;
    });

    if (targetGroups.length === 0) {
      console.warn('No telegram groups found for this feedback');
      return false;
    }

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
      `🛡️ <b>SISTEM DAFTAR PENGAKAP</b>`,
      `<i>Pusat Kawalan Admin</i>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📩 <b>Pertanyaan / Maklum Balas Baru</b>`,
      ``,
      `📂 <b>Kategori:</b> ${category === 'sistem' ? '⚙️ Sistem' : '💬 Umum'}`,
      `👤 <b>Nama:</b> ${payload.senderName}`,
      `📧 <b>Email:</b> ${payload.senderEmail}`,
      `🏷 <b>Peranan:</b> ${roleLabel[payload.role] ?? payload.role}`,
      payload.schoolName ? `🏫 <b>Sekolah:</b> ${payload.schoolName}` : null,
      `🕐 <b>Masa:</b> ${now}`,
      ``,
      `💬 <b>Mesej:</b>`,
      `<blockquote>${payload.message}</blockquote>`,
      ``,
      `<i>💡 Reply mesej ini untuk balas terus kepada pengguna</i>`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    // Simpan feedback dalam Supabase dulu
    const { data: feedbackData, error: feedbackError} = await supabase
      .from('feedbacks')
      .insert({
        user_id: payload.userId || null,
        sender_name: payload.senderName,
        sender_email: payload.senderEmail,
        role: payload.role,
        school_name: payload.schoolName || null,
        message: payload.message,
        category: category,
        negeri_id: negeriId,
        daerah_id: daerahId,
        status: 'open',
      })
      .select()
      .single();

    if (feedbackError || !feedbackData) {
      console.error('Failed to save feedback:', feedbackError);
      return false;
    }

    const feedbackId = feedbackData.id;

    // Hantar ke semua target groups
    const sendPromises = targetGroups.map(async (group: any) => {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: group.chat_id,
              text,
              parse_mode: 'HTML',
            }),
          }
        );

        const result = await response.json();
        if (result.ok && result.result?.message_id) {
          // Simpan mapping feedback -> telegram message
          await supabase.from('feedback_telegram_messages').insert({
            feedback_id: feedbackId,
            chat_id: group.chat_id,
            telegram_message_id: result.result.message_id,
          });
          return { success: true, group: group.label };
        } else {
          console.error(`Failed to send to ${group.label}:`, result);
          return { success: false, group: group.label };
        }
      } catch (err) {
        console.error(`Error sending to ${group.label}:`, err);
        return { success: false, group: group.label };
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    console.log(`Feedback sent to ${successCount}/${targetGroups.length} groups`);
    return successCount > 0;
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
