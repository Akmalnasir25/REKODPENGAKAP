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
  // Untuk leader (chatbot)
  leaderId?: string;
  leaderNegeriId?: string | null;
  leaderDaerahId?: string | null;
  message: string;
  category?: 'sistem' | 'umum'; // Default: umum
  programId?: string | null;
  programName?: string | null;
  programScope?: 'negeri' | 'daerah' | null;
  // Untuk leader: kursus yang dipilih
  courseId?: string | null;
  courseName?: string | null;
  courseScope?: 'negeri' | 'daerah' | null;
}

export interface ProgramOption {
  id: string;
  name: string;
  scope: 'negeri' | 'daerah';
  negeri_id: string | null;
  daerah_id: string | null;
}

/**
 * Ambil senarai program (badges) yang berkaitan dengan sekolah:
 * - Program scope='negeri' yang sepadan dengan negeri sekolah
 * - Program scope='daerah' yang sepadan dengan daerah sekolah
 */
export async function getProgramsForSchool(schoolId: string): Promise<ProgramOption[]> {
  try {
    const { supabase } = await import('./supabaseClient');

    const { data: schoolData } = await supabase
      .from('schools')
      .select('negeri_id, daerah_id')
      .eq('id', schoolId)
      .single();

    if (!schoolData) return [];

    const { negeri_id, daerah_id } = schoolData as { negeri_id: string | null; daerah_id: string | null };

    const { data: badges } = await supabase
      .from('badges')
      .select('id, name, scope, negeri_id, daerah_id')
      .order('name');

    if (!badges) return [];

    return (badges as any[])
      .filter((b) => {
        const scope = (b.scope as 'negeri' | 'daerah' | null) || 'daerah';
        if (scope === 'negeri') {
          // Program negeri terbuka untuk semua negeri ATAU sepadan dengan negeri sekolah
          return !b.negeri_id || b.negeri_id === negeri_id;
        }
        if (scope === 'daerah') {
          // Program daerah terbuka untuk semua daerah ATAU sepadan dengan daerah sekolah
          return !b.daerah_id || b.daerah_id === daerah_id;
        }
        return false;
      })
      .map((b) => ({
        id: b.id,
        name: b.name,
        scope: ((b.scope as 'negeri' | 'daerah') || 'daerah'),
        negeri_id: b.negeri_id,
        daerah_id: b.daerah_id,
      }));
  } catch (err) {
    console.error('getProgramsForSchool error:', err);
    return [];
  }
}

export async function sendTelegramFeedback(payload: FeedbackPayload): Promise<boolean> {
  try {
    const { supabase } = await import('./supabaseClient');

    // Ambil negeri_id dan daerah_id dari sekolah user ATAU dari leader
    let negeriId: string | null = payload.leaderNegeriId || null;
    let daerahId: string | null = payload.leaderDaerahId || null;

    if (payload.schoolId && !negeriId) {
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
    // Routing scope - utamakan course scope (untuk leader), kemudian program scope (untuk school user)
    const routingScope = payload.courseScope || payload.programScope || null;
    const programId = payload.programId || null;
    const programName = payload.programName || null;
    const courseId = payload.courseId || null;
    const courseName = payload.courseName || null;

    // Filter groups berdasarkan scope dan kategori
    const targetGroups = (allGroups || []).filter((group: any) => {
      // Developer dapat kategori 'sistem' sahaja
      if (group.role === 'developer') {
        return category === 'sistem';
      }

      // Kategori 'umum' - hantar ke admin negeri/daerah berdasarkan scope
      if (category === 'umum') {
        // Jika user pilih program/kursus negeri -> hantar ke admin negeri sahaja
        if (routingScope === 'negeri') {
          return group.role === 'negeri_admin' && group.negeri_id === negeriId;
        }
        // Jika user pilih program/kursus daerah -> hantar ke admin daerah sahaja
        if (routingScope === 'daerah') {
          return group.role === 'daerah_admin' && group.daerah_id === daerahId;
        }
        // Tiada scope dipilih -> hantar ke kedua-dua admin negeri & daerah
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
      `🛡️ <b>ScoutNadi</b>`,
      `<i>Pusat Kawalan Admin</i>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📩 <b>Pertanyaan / Maklum Balas Baru</b>`,
      ``,
      `📂 <b>Kategori:</b> ${category === 'sistem' ? '⚙️ Sistem' : '💬 Umum'}`,
      programName ? `🎯 <b>Program:</b> ${programName}${payload.programScope ? ` <i>(${payload.programScope === 'negeri' ? 'Peringkat Negeri' : 'Peringkat Daerah'})</i>` : ''}` : null,
      courseName ? `📚 <b>Kursus:</b> ${courseName}${payload.courseScope ? ` <i>(${payload.courseScope === 'negeri' ? 'Peringkat Negeri' : 'Peringkat Daerah'})</i>` : ''}` : null,
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
        program_id: programId,
        program_name: programName,
        program_scope: payload.programScope || null,
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

// ============================================================
// COURSES FOR LEADER (untuk chatbot pemimpin)
// ============================================================

export interface CourseOption {
  id: string;
  name: string;
  scope: 'negeri' | 'daerah';
  negeri_id: string | null;
  daerah_id: string | null;
}

/**
 * Ambil senarai kursus yang berkaitan dengan pemimpin:
 * - Kursus scope='negeri' yang sepadan dengan negeri pemimpin
 * - Kursus scope='daerah' yang sepadan dengan daerah pemimpin
 * Hanya kursus yang berstatus 'open' atau 'closed' (sedang berjalan/tamat baru-baru ini).
 */
export async function getCoursesForLeader(
  negeriId: string | null,
  daerahId: string | null,
): Promise<CourseOption[]> {
  try {
    const { supabase } = await import('./supabaseClient');

    const { data: courses } = await supabase
      .from('courses')
      .select('id, name, scope, negeri_id, daerah_id, status')
      .in('status', ['open', 'closed', 'completed'])
      .order('start_date', { ascending: false });

    if (!courses) return [];

    return (courses as any[])
      .filter((c) => {
        if (c.scope === 'negeri') {
          return !c.negeri_id || c.negeri_id === negeriId;
        }
        if (c.scope === 'daerah') {
          return !c.daerah_id || c.daerah_id === daerahId;
        }
        return false;
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        scope: c.scope,
        negeri_id: c.negeri_id,
        daerah_id: c.daerah_id,
      }));
  } catch (err) {
    console.error('getCoursesForLeader error:', err);
    return [];
  }
}