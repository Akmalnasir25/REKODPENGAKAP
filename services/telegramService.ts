const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '571382718';

export interface FeedbackPayload {
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
    return result.ok === true;
  } catch (error) {
    console.error('Telegram send error:', error);
    return false;
  }
}
