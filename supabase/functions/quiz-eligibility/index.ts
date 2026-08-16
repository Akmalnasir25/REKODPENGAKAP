// Supabase Edge Function: quiz-eligibility
// ------------------------------------------------------------------
// Endpoint READ-ONLY untuk sistem kuiz (Google Apps Script) dapatkan
// senarai peserta berdaftar scoutnadi & sahkan identiti ringkas.
//
// Dilindungi kunci API (env QUIZ_API_KEY) — dibandingkan dengan header
// `x-quiz-api-key` (atau body.apiKey). Guna service_role (bypass RLS),
// TETAPI hanya dedah data minimum: id + nama. IC/No. Keahlian TIDAK
// dipulangkan kepada pemanggil.
//
// Tindakan:
//  - action 'schools' { badgeName, year }
//        -> { schools: [{ schoolCode, name }] }  (hanya sekolah yang ada peserta layak)
//  - action 'list'   { schoolCode, badgeName, year }
//        -> { participants: [{ id, name }] }  (role PESERTA, belum padam/tarik diri)
//  - action 'verify' { participantId, value, method }
//        -> { ok: boolean, name?: string }
//        method: 'ic_last4' | 'membership' | 'ic_full'
//  - action 'admin_login'  { email, password }  (kredensil admin scoutnadi)
//        -> { ok, token, name, role, negeriCode, daerahCode }
//  - action 'admin_verify' { token }
//        -> { ok, role }
//  - action 'teacher_login'  { email, password }  (akaun sekolah school_user)
//        -> { ok, token, name, schoolCode, schoolName }
//  - action 'teacher_verify' { token }
//        -> { ok, schoolCode, schoolName }
//  - action 'cert_fields'   { participantId }   (server-side, untuk jana sijil)
//        -> { ok, name, ic, membership, schoolName }
// ------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-quiz-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const digitsOnly = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const norm = (v: unknown) => String(v ?? '').trim();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const QUIZ_API_KEY = Deno.env.get('QUIZ_API_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !QUIZ_API_KEY) {
      return jsonResponse({ error: 'Server not configured' }, 500);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Body JSON tidak sah' }, 400);
    }

    // --- Semak kunci API ---
    const providedKey = req.headers.get('x-quiz-api-key') || body.apiKey || '';
    if (providedKey !== QUIZ_API_KEY) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const action = norm(body.action);

    // Helper: cari badge id ikut nama (case-insensitive)
    const findBadgeId = async (badgeName: string): Promise<string | null> => {
      const { data } = await supabase
        .from('badges')
        .select('id')
        .ilike('name', badgeName)
        .maybeSingle();
      return data?.id ?? null;
    };

    // Helper: set school_id yang TELAH DISAHKAN untuk badge+tahun
    // (school_badge_status.status = 'approved' atau 'locked')
    const approvedSchoolIds = async (badgeId: string, year: number): Promise<Set<string>> => {
      const { data } = await supabase
        .from('school_badge_status')
        .select('school_id, status')
        .eq('badge_id', badgeId)
        .eq('year', year)
        .in('status', ['approved', 'locked']);
      return new Set((data || []).map((r: any) => r.school_id));
    };

    // ============================================================
    // ACTION: schools — sekolah yang ada peserta layak utk program+tahun
    // ============================================================
    if (action === 'schools') {
      const badgeName = norm(body.badgeName);
      const year = parseInt(String(body.year), 10);
      if (!badgeName || !Number.isFinite(year)) {
        return jsonResponse({ error: 'badgeName & year diperlukan' }, 400);
      }

      const badgeId = await findBadgeId(badgeName);
      if (!badgeId) return jsonResponse({ schools: [] });

      // Hanya sekolah yang TELAH DISAHKAN (school_badge_status = approved/locked)
      const approvedIds = await approvedSchoolIds(badgeId, year);
      if (approvedIds.size === 0) return jsonResponse({ schools: [] });

      const { data, error } = await supabase
        .from('submission_people')
        .select('is_withdrawn, submission:submissions!inner(school_id, badge_id, submission_year, status, school:schools(school_code, name))')
        .eq('role', 'PESERTA')
        .eq('is_deleted', false)
        .eq('submission.badge_id', badgeId)
        .eq('submission.submission_year', year);

      if (error) {
        return jsonResponse({ error: 'Gagal dapatkan sekolah', details: error.message }, 500);
      }

      const map = new Map<string, { name: string; registered: number }>();
      for (const p of (data || []) as any[]) {
        if (p.is_withdrawn === true) continue;
        if (p.submission?.status === 'rejected') continue;
        if (!approvedIds.has(p.submission?.school_id)) continue; // belum disahkan
        const sc = p.submission?.school?.school_code;
        const nm = p.submission?.school?.name;
        if (!sc) continue;
        const cur = map.get(sc);
        if (cur) cur.registered += 1;
        else map.set(sc, { name: nm || sc, registered: 1 });
      }
      const schools = Array.from(map, ([schoolCode, v]) => ({ schoolCode, name: v.name, registered: v.registered }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return jsonResponse({ schools });
    }

    // ============================================================
    // ACTION: list — senarai peserta layak ikut sekolah + program + tahun
    // ============================================================
    if (action === 'list') {
      const schoolCode = norm(body.schoolCode);
      const badgeName = norm(body.badgeName);
      const year = parseInt(String(body.year), 10);

      if (!schoolCode || !badgeName || !Number.isFinite(year)) {
        return jsonResponse({ error: 'schoolCode, badgeName & year diperlukan' }, 400);
      }

      const { data: school } = await supabase
        .from('schools')
        .select('id')
        .eq('school_code', schoolCode)
        .maybeSingle();
      if (!school) return jsonResponse({ participants: [] });

      const { data: badge } = await supabase
        .from('badges')
        .select('id')
        .ilike('name', badgeName)
        .maybeSingle();
      if (!badge) return jsonResponse({ participants: [] });

      // Sekolah ini mesti TELAH DISAHKAN untuk program+tahun
      const { data: sbs } = await supabase
        .from('school_badge_status')
        .select('status')
        .eq('school_id', school.id)
        .eq('badge_id', badge.id)
        .eq('year', year)
        .maybeSingle();
      if (!sbs || !['approved', 'locked'].includes((sbs as any).status)) {
        return jsonResponse({ participants: [] }); // belum disahkan
      }

      const { data, error } = await supabase
        .from('submission_people')
        .select('id, name, is_withdrawn, submission:submissions!inner(school_id, badge_id, submission_year, status)')
        .eq('role', 'PESERTA')
        .eq('is_deleted', false)
        .eq('submission.school_id', school.id)
        .eq('submission.badge_id', badge.id)
        .eq('submission.submission_year', year)
        .order('name', { ascending: true });

      if (error) {
        return jsonResponse({ error: 'Gagal dapatkan peserta', details: error.message }, 500);
      }

      const participants = (data || [])
        .filter((p: any) => p.is_withdrawn !== true && p.submission?.status !== 'rejected')
        .map((p: any) => ({ id: p.id, name: p.name }));

      return jsonResponse({ participants });
    }

    // ============================================================
    // ACTION: verify — sahkan identiti ringkas tanpa dedah IC penuh
    // ============================================================
    if (action === 'verify') {
      const participantId = norm(body.participantId);
      const value = norm(body.value);
      const method = norm(body.method) || 'ic_last4';

      if (!participantId || !value) {
        return jsonResponse({ error: 'participantId & value diperlukan' }, 400);
      }

      const { data: person } = await supabase
        .from('submission_people')
        .select('id, name, ic_number, membership_id, is_deleted, is_withdrawn')
        .eq('id', participantId)
        .maybeSingle();

      if (!person || person.is_deleted === true || person.is_withdrawn === true) {
        return jsonResponse({ ok: false });
      }

      let ok = false;
      if (method === 'membership') {
        ok = !!person.membership_id &&
          norm(person.membership_id).toUpperCase() === value.toUpperCase();
      } else if (method === 'ic_full') {
        const ic = digitsOnly(person.ic_number);
        ok = ic.length > 0 && ic === digitsOnly(value);
      } else {
        // ic_last4 (default) — sokong IC (digit), No. Pasport (alfanumerik),
        // dan sandaran No. Keahlian (jika IC kosong/salah dalam data).
        const alnum = (s: string) => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
        const inDigits = digitsOnly(value);
        const inAlnum = alnum(value);

        // (a) 4 digit/aksara akhir IC atau No. Pasport (ic_number)
        const idDigits = digitsOnly(person.ic_number);
        const idAlnum = alnum(person.ic_number);
        const okDigits = idDigits.length >= 4 && idDigits.slice(-4) === inDigits.slice(-4);
        const okAlnum = idAlnum.length >= 4 && idAlnum.slice(-4) === inAlnum.slice(-4);

        // (b) sandaran: No. Keahlian penuh atau 4 aksara akhir (cth AT3149-26)
        const memAlnum = alnum(person.membership_id);
        const okMem = memAlnum.length >= 4 &&
          (memAlnum === inAlnum || memAlnum.slice(-4) === inAlnum.slice(-4));

        ok = okDigits || okAlnum || okMem;
      }

      return jsonResponse(ok ? { ok: true, name: person.name } : { ok: false });
    }

    // ============================================================
    // ACTION: admin_login — sahkan kredensil admin scoutnadi (Supabase Auth)
    //   { email, password } -> { ok, token, name, role, negeriCode, daerahCode }
    // ============================================================
    if (action === 'admin_login') {
      const email = norm(body.email).toLowerCase();
      const password = String(body.password ?? '');
      if (!email || !password) {
        return jsonResponse({ ok: false, error: 'Email & kata laluan diperlukan' }, 400);
      }

      // 1) GoTrue password grant
      const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const tokenData: any = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !tokenData.access_token || !tokenData.user) {
        return jsonResponse({ ok: false, error: 'Email atau kata laluan salah.' });
      }

      // 2) Semak peranan dalam profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, is_active, negeri:negeri_id(code, name), daerah:daerah_id(code, name)')
        .eq('id', tokenData.user.id)
        .maybeSingle();

      const allowed = ['daerah_admin', 'negeri_admin', 'admin', 'developer'];
      if (!profile || profile.is_active === false || !allowed.includes((profile as any).role)) {
        return jsonResponse({ ok: false, error: 'Akaun ini bukan admin yang dibenarkan.' });
      }
      const negeri: any = Array.isArray((profile as any).negeri) ? (profile as any).negeri[0] : (profile as any).negeri;
      const daerah: any = Array.isArray((profile as any).daerah) ? (profile as any).daerah[0] : (profile as any).daerah;

      return jsonResponse({
        ok: true,
        token: tokenData.access_token,
        expiresIn: tokenData.expires_in,
        name: (profile as any).full_name || email,
        role: (profile as any).role,
        negeriCode: negeri?.code || '',
        daerahCode: daerah?.code || '',
      });
    }

    // ============================================================
    // ACTION: admin_verify — sahkan token admin masih sah + peranan
    //   { token } -> { ok, role }
    // ============================================================
    if (action === 'admin_verify') {
      const token = norm(body.token);
      if (!token) return jsonResponse({ ok: false });

      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token },
      });
      const u: any = await userResp.json().catch(() => ({}));
      if (!userResp.ok || !u.id) return jsonResponse({ ok: false });

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', u.id)
        .maybeSingle();

      const allowed = ['daerah_admin', 'negeri_admin', 'admin', 'developer'];
      if (!profile || (profile as any).is_active === false || !allowed.includes((profile as any).role)) {
        return jsonResponse({ ok: false });
      }
      return jsonResponse({ ok: true, role: (profile as any).role });
    }

    // ============================================================
    // ACTION: teacher_login — akaun SEKOLAH scoutnadi (school_user)
    //   { email, password } -> { ok, token, name, schoolCode, schoolName }
    // ============================================================
    if (action === 'teacher_login') {
      const email = norm(body.email).toLowerCase();
      const password = String(body.password ?? '');
      if (!email || !password) {
        return jsonResponse({ ok: false, error: 'Email & kata laluan diperlukan' }, 400);
      }

      const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const tokenData: any = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !tokenData.access_token || !tokenData.user) {
        return jsonResponse({ ok: false, error: 'Email atau kata laluan salah.' });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, is_active, school:school_id(school_code, name)')
        .eq('id', tokenData.user.id)
        .maybeSingle();

      if (!profile || (profile as any).is_active === false || (profile as any).role !== 'school_user') {
        return jsonResponse({ ok: false, error: 'Akaun ini bukan akaun sekolah.' });
      }
      const school: any = Array.isArray((profile as any).school) ? (profile as any).school[0] : (profile as any).school;
      if (!school || !school.school_code) {
        return jsonResponse({ ok: false, error: 'Akaun ini tiada sekolah berkait.' });
      }
      return jsonResponse({
        ok: true,
        token: tokenData.access_token,
        name: (profile as any).full_name || email,
        schoolCode: school.school_code,
        schoolName: school.name || school.school_code,
      });
    }

    // ============================================================
    // ACTION: teacher_verify — sahkan token guru + pulang sekolah
    //   { token } -> { ok, schoolCode, schoolName }
    // ============================================================
    if (action === 'teacher_verify') {
      const token = norm(body.token);
      if (!token) return jsonResponse({ ok: false });

      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token },
      });
      const u: any = await userResp.json().catch(() => ({}));
      if (!userResp.ok || !u.id) return jsonResponse({ ok: false });

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active, school:school_id(school_code, name)')
        .eq('id', u.id)
        .maybeSingle();

      if (!profile || (profile as any).is_active === false || (profile as any).role !== 'school_user') {
        return jsonResponse({ ok: false });
      }
      const school: any = Array.isArray((profile as any).school) ? (profile as any).school[0] : (profile as any).school;
      if (!school || !school.school_code) return jsonResponse({ ok: false });
      return jsonResponse({ ok: true, schoolCode: school.school_code, schoolName: school.name || school.school_code });
    }

    // ============================================================
    // ACTION: cert_fields — maklumat calon untuk sijil (server-side sahaja)
    //   { participantId } -> { ok, name, ic, membership, schoolName }
    //   Hanya dipanggil oleh GAS (kunci API) semasa menjana sijil.
    // ============================================================
    if (action === 'cert_fields') {
      const participantId = norm(body.participantId);
      if (!participantId) return jsonResponse({ ok: false, error: 'participantId diperlukan' }, 400);

      const { data: person } = await supabase
        .from('submission_people')
        .select('name, ic_number, membership_id, submission:submissions!inner(school:schools(name, school_code))')
        .eq('id', participantId)
        .maybeSingle();

      if (!person) return jsonResponse({ ok: false });
      const sub: any = Array.isArray((person as any).submission) ? (person as any).submission[0] : (person as any).submission;
      const school: any = sub && (Array.isArray(sub.school) ? sub.school[0] : sub.school);
      return jsonResponse({
        ok: true,
        name: (person as any).name || '',
        ic: (person as any).ic_number || '',
        membership: (person as any).membership_id || '',
        schoolName: (school && school.name) || '',
      });
    }

    return jsonResponse({ error: 'action tidak dikenali (schools|list|verify|admin_login|admin_verify|teacher_login|teacher_verify|cert_fields)' }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Ralat sistem' }, 500);
  }
});
