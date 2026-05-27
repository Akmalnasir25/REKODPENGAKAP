import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8836450420:AAFjG2lH6Q2tlQi3KjCvINq2jzPFJrYqy_4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('OK', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const { chatId, schoolCode, badge, badgeId, year, totalParticipants } = body;

    if (!chatId || !schoolCode || !badgeId) {
      return new Response(JSON.stringify({ status: 'error', message: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify group exists
    const { data: group } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('chat_id', chatId)
      .eq('is_active', true)
      .single();

    if (!group) {
      return new Response(JSON.stringify({ status: 'error', message: 'Group tidak berdaftar' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get school
    const { data: school } = await supabase
      .from('schools')
      .select('id, school_code, name, negeri_id, daerah_id')
      .eq('school_code', schoolCode)
      .single();

    if (!school) {
      await sendMessage(chatId, `❌ <b>Scan Gagal</b>\n\nSekolah <code>${schoolCode}</code> tidak dijumpai.`);
      return new Response(JSON.stringify({ status: 'error', message: 'School not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Scope check
    if (group.role === 'daerah_admin' && school.daerah_id !== group.daerah_id) {
      await sendMessage(chatId, `❌ <b>Akses Ditolak</b>\n\nSekolah ini bukan dalam daerah anda.`);
      return new Response(JSON.stringify({ status: 'error', message: 'Outside scope' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (group.role === 'negeri_admin' && school.negeri_id !== group.negeri_id) {
      await sendMessage(chatId, `❌ <b>Akses Ditolak</b>\n\nSekolah ini bukan dalam negeri anda.`);
      return new Response(JSON.stringify({ status: 'error', message: 'Outside scope' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Insert attendance
    const targetYear = year || new Date().getFullYear();
    const { error } = await supabase.from('attendance_verifications').insert({
      school_id: school.id,
      badge_id: badgeId,
      year: targetYear,
      participant_count: totalParticipants || 0,
      source: 'telegram_scan',
    });

    if (error) {
      await sendMessage(chatId, `❌ <b>Scan Gagal</b>\n\n${error.message}`);
      return new Response(JSON.stringify({ status: 'error', message: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get badge name
    const { data: badgeData } = await supabase.from('badges').select('name').eq('id', badgeId).single();

    // Notify success
    const tStr = new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    await sendMessage(chatId, `✅ <b>Kehadiran Disahkan</b>

🏫 <b>Sekolah:</b> ${school.name}
📋 <b>Kod:</b> <code>${school.school_code}</code>
🎯 <b>Program:</b> ${badgeData?.name || badge}
👥 <b>Peserta:</b> ${totalParticipants || 0} orang
🕐 <b>Masa:</b> ${tStr}

<i>Sistem akan auto-update di dashboard.</i>`);

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ status: 'error', message: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
