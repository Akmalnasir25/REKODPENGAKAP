import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sila log masuk sebagai admin terlebih dahulu." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { schoolId, schoolCode } = await req.json();
    if (!schoolId && !schoolCode) {
      return new Response(
        JSON.stringify({ status: "error", message: "School ID atau kod sekolah diperlukan." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sesi admin tidak sah." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, negeri_id, daerah_id, is_active")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !adminProfile || !adminProfile.is_active) {
      return new Response(
        JSON.stringify({ status: "error", message: "Profil admin tidak dijumpai atau tidak aktif." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedRoles = ["developer", "admin", "negeri_admin", "daerah_admin"];
    if (!allowedRoles.includes(adminProfile.role)) {
      return new Response(
        JSON.stringify({ status: "error", message: "Anda tiada kebenaran untuk reset akaun sekolah." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let schoolQuery = supabaseAdmin
      .from("schools")
      .select("id, name, school_code, negeri_id, daerah_id, is_claimed, claimed_by, claimed_email");

    if (schoolId) {
      schoolQuery = schoolQuery.eq("id", schoolId);
    } else {
      schoolQuery = schoolQuery.eq("school_code", String(schoolCode).trim().toUpperCase());
    }

    const { data: school, error: schoolError } = await schoolQuery.single();
    if (schoolError || !school) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah tidak dijumpai." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (adminProfile.role === "negeri_admin" && school.negeri_id !== adminProfile.negeri_id) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah ini bukan di bawah negeri anda." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (adminProfile.role === "daerah_admin" && school.daerah_id !== adminProfile.daerah_id) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah ini bukan di bawah daerah anda." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claimedUserId = school.claimed_by;

    if (claimedUserId) {
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(claimedUserId);
      if (deleteUserError) {
        return new Response(
          JSON.stringify({ status: "error", message: "Gagal memadam user lama: " + deleteUserError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    await supabaseAdmin
      .from("profiles")
      .update({ is_active: false, school_id: null })
      .eq("school_id", school.id)
      .eq("role", "school_user");

    const { error: resetError } = await supabaseAdmin
      .from("schools")
      .update({
        is_claimed: false,
        claimed_by: null,
        claimed_email: null,
        claimed_at: null,
      })
      .eq("id", school.id);

    if (resetError) {
      return new Response(
        JSON.stringify({ status: "error", message: "Gagal reset sekolah: " + resetError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userData.user.id,
      actor_role: adminProfile.role,
      action: "RESET_SCHOOL_CLAIM",
      entity_type: "school",
      entity_id: school.id,
      details: {
        school_name: school.name,
        school_code: school.school_code,
        previous_email: school.claimed_email,
        deleted_user_id: claimedUserId,
      },
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Akaun sekolah berjaya direset. Sekolah boleh daftar semula menggunakan kod sekolah yang sama.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Reset school claim error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: "Ralat dalaman. Sila cuba lagi." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
