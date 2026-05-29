// Supabase Edge Function: fetch-leader-school-data
// Server-side proxy untuk pemimpin akses data sekolah secara selamat.
// Verify:
// 1. Email + password leader (auth manual)
// 2. school_link_status = 'approved'
// 3. school_id wujud
// Kemudian return data sekolah guna service_role (bypass RLS).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PASSWORD_SALT = 'scoutnadi_leader_2026';

interface RequestBody {
  email: string;
  passwordHash: string; // SHA-256 + salt (sama dengan client side)
}

async function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Server not configured' }, 500);
    }

    const body: RequestBody = await req.json();
    if (!body.email || !body.passwordHash) {
      return jsonResponse({ error: 'Email & passwordHash diperlukan' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Verify leader credentials
    const { data: leader, error: leaderErr } = await supabase
      .from('leader_accounts')
      .select('id, email, password_hash, school_id, school_link_status, is_active')
      .eq('email', body.email.trim().toLowerCase())
      .maybeSingle();

    if (leaderErr || !leader) {
      return jsonResponse({ error: 'Akaun tidak dijumpai' }, 401);
    }

    if (!leader.is_active) {
      return jsonResponse({ error: 'Akaun anda telah dinyahaktifkan' }, 403);
    }

    if (leader.password_hash !== body.passwordHash) {
      return jsonResponse({ error: 'Pengesahan gagal' }, 401);
    }

    if (!leader.school_id) {
      return jsonResponse({ error: 'Akaun anda tiada link sekolah' }, 403);
    }

    if (leader.school_link_status !== 'approved') {
      const status = leader.school_link_status || 'not_requested';
      return jsonResponse({
        error: `Permintaan akses anda berstatus: ${status}. Hubungi admin sekolah untuk approve.`,
        linkStatus: status,
      }, 403);
    }

    // 2. Fetch data sekolah (guna service_role, bypass RLS)
    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('*, negeri:negeri_id(code, name), daerah:daerah_id(code, name)')
      .eq('id', leader.school_id)
      .maybeSingle();

    if (schoolErr || !school) {
      return jsonResponse({ error: 'Data sekolah tidak dijumpai' }, 404);
    }

    // 3. Fetch submission_people untuk sekolah ini sahaja (PDPA - hanya data sekolah dipapar)
    const fetchAllSubmissionPeople = async () => {
      const pageSize = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('submission_people')
          .select(`
            *,
            submission:submissions!inner(
              id, submission_year, submitted_at, status, remarks,
              school_id,
              school:schools(id, name, school_code, negeri:negeri_id(code,name), daerah:daerah_id(code,name)),
              badge:badges(id, name)
            )
          `)
          .eq('is_deleted', false)
          .eq('submission.school_id', leader.school_id)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        allData = allData.concat(data || []);
        hasMore = (data || []).length === pageSize;
        from += pageSize;
      }
      return { data: allData, error: null };
    };

    const peopleRes = await fetchAllSubmissionPeople();
    if (peopleRes.error) {
      return jsonResponse({ error: 'Gagal fetch data peserta', details: peopleRes.error }, 500);
    }

    // 4. Fetch badges, school_profiles, school_badge_status (data global yang diperlukan)
    const [badgesRes, profilesRes, statusRes] = await Promise.all([
      supabase.from('badges').select('*, negeri:negeri_id(code,name), daerah:daerah_id(code,name)').order('name'),
      supabase.from('school_profiles').select('*, school:school_id(school_code,name,group_number)').eq('school_id', leader.school_id),
      supabase.from('school_badge_status').select('*, school:school_id(school_code,name), badge:badge_id(name)').eq('school_id', leader.school_id),
    ]);

    return jsonResponse({
      success: true,
      school,
      submissionPeople: peopleRes.data || [],
      badges: badgesRes.data || [],
      schoolProfiles: profilesRes.data || [],
      schoolBadgeStatus: statusRes.data || [],
      leader: {
        id: leader.id,
        email: leader.email,
      },
    });
  } catch (err: any) {
    console.error('fetch-leader-school-data error:', err);
    return jsonResponse({ error: err.message || 'Internal error' }, 500);
  }
});
