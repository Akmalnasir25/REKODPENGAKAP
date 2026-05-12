import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalize = (value: unknown) => String(value || "").trim().toUpperCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ status: "error", message: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ status: "error", message: "Sesi tidak sah. Sila log masuk semula." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ status: "error", message: "Sesi tamat. Sila log masuk semula." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { leaderInfo, people, customDate, source = "manual" } = body;
    if (!leaderInfo?.schoolCode || !leaderInfo?.badgeType || !Array.isArray(people)) {
      return new Response(JSON.stringify({ status: "error", message: "Data pendaftaran tidak lengkap." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, school_id, is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_active) {
      return new Response(JSON.stringify({ status: "error", message: "Profil pengguna tidak aktif atau tidak dijumpai." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: school, error: schoolError } = await adminClient
      .from("schools")
      .select("id, name, school_code")
      .eq("school_code", normalize(leaderInfo.schoolCode))
      .maybeSingle();

    if (schoolError || !school) {
      return new Response(JSON.stringify({ status: "error", message: "Sekolah tidak dijumpai dalam Supabase." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (profile.role === "school_user" && profile.school_id !== school.id) {
      await adminClient.from("profiles").update({ school_id: school.id }).eq("id", user.id);
    }

    const { data: badge, error: badgeError } = await adminClient
      .from("badges")
      .select("id, name")
      .eq("name", String(leaderInfo.badgeType).trim())
      .maybeSingle();

    if (badgeError || !badge) {
      return new Response(JSON.stringify({ status: "error", message: `Badge '${leaderInfo.badgeType}' tidak dijumpai.` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const submittedAt = customDate ? new Date(customDate).toISOString() : new Date().toISOString();
    const year = new Date(submittedAt).getFullYear();

    const { data: submission, error: subError } = await adminClient
      .from("submissions")
      .insert({
        school_id: school.id,
        badge_id: badge.id,
        submission_year: year,
        submitted_at: submittedAt,
        submitted_by: user.id,
        status: "submitted",
        source,
        remarks: leaderInfo.groupNumber ? `No Kumpulan: ${leaderInfo.groupNumber}` : null,
      })
      .select("id")
      .single();

    if (subError) throw subError;

    const rows = people
      .filter((p: any) => String(p.name || "").trim())
      .map((p: any) => ({
        submission_id: submission.id,
        name: normalize(p.name),
        gender: p.gender || null,
        race: p.race || null,
        membership_id: normalize(p.membershipId),
        ic_number: p.icNumber || null,
        phone_number: p.phoneNumber || null,
        role: p.role || "PESERTA",
        category: p.category || null,
        remarks: p.remarks || null,
      }));

    if (rows.length > 0) {
      const { error: peopleError } = await adminClient.from("submission_people").insert(rows);
      if (peopleError) throw peopleError;
    }

    await adminClient.from("school_profiles").upsert({
      school_id: school.id,
      principal_name: normalize(leaderInfo.principalName),
      principal_phone: leaderInfo.principalPhone || null,
      leader_name: normalize(leaderInfo.leaderName),
      leader_phone: leaderInfo.phone || null,
      leader_race: leaderInfo.race || null,
      updated_by: user.id,
    }, { onConflict: "school_id" });

    await adminClient.from("school_badge_status").upsert({
      school_id: school.id,
      badge_id: badge.id,
      year,
      status: "submitted",
      submitted_at: submittedAt,
    }, { onConflict: "school_id,badge_id,year", ignoreDuplicates: true });

    return new Response(JSON.stringify({ status: "success", message: "Pendaftaran berjaya disimpan.", submissionId: submission.id, count: rows.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("submit-registration error", error);
    return new Response(JSON.stringify({ status: "error", message: error?.message || "Gagal menyimpan pendaftaran." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
