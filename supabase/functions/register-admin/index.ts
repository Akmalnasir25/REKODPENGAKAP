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

    const { email, password, fullName, role, negeriCode, daerahCode } = await req.json();

    if (!email || !password || !role) {
      return new Response(
        JSON.stringify({ status: "error", message: "Email, kata laluan, dan role diperlukan." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validRoles = ["admin", "negeri_admin", "daerah_admin", "developer"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ status: "error", message: "Role tidak sah." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (role === "negeri_admin" && !negeriCode) {
      return new Response(
        JSON.stringify({ status: "error", message: "Negeri code diperlukan untuk admin negeri." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (role === "daerah_admin" && (!negeriCode || !daerahCode)) {
      return new Response(
        JSON.stringify({ status: "error", message: "Negeri code dan Daerah code diperlukan untuk admin daerah." }),
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

    // Permission check
    if (adminProfile.role === "daerah_admin") {
      return new Response(
        JSON.stringify({ status: "error", message: "Admin daerah tidak boleh mendaftar admin lain." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (adminProfile.role === "negeri_admin") {
      if (role !== "daerah_admin") {
        return new Response(
          JSON.stringify({ status: "error", message: "Admin negeri hanya boleh mendaftar admin daerah." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Lookup negeri by code
      const { data: negeriData, error: negeriError } = await supabaseAdmin
        .from("negeri")
        .select("id")
        .eq("code", negeriCode)
        .single();

      if (negeriError || !negeriData || negeriData.id !== adminProfile.negeri_id) {
        return new Response(
          JSON.stringify({ status: "error", message: "Admin negeri hanya boleh mendaftar admin daerah dalam negeri sendiri." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Lookup daerah by code
      const { data: daerahCheck, error: daerahError } = await supabaseAdmin
        .from("daerah")
        .select("id, negeri_id")
        .eq("code", daerahCode)
        .single();

      if (daerahError || !daerahCheck || daerahCheck.negeri_id !== adminProfile.negeri_id) {
        return new Response(
          JSON.stringify({ status: "error", message: "Daerah tidak dijumpai atau bukan dalam negeri anda." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!["admin", "developer"].includes(adminProfile.role) && !["negeri_admin"].includes(adminProfile.role)) {
      return new Response(
        JSON.stringify({ status: "error", message: "Anda tiada kebenaran untuk mendaftar admin." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        role: role,
        full_name: fullName || email,
      },
    });

    if (authError) {
      if (authError.message?.includes("already been registered") || authError.message?.includes("already exists")) {
        return new Response(
          JSON.stringify({ status: "error", message: "Email ini telah digunakan. Sila guna email lain." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ status: "error", message: "Gagal mencipta akaun: " + authError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Lookup negeri and daerah IDs from codes
    let negeriId: string | null = null;
    let daerahId: string | null = null;

    if (negeriCode) {
      const { data: negeriData } = await supabaseAdmin
        .from("negeri")
        .select("id")
        .eq("code", negeriCode)
        .single();
      negeriId = negeriData?.id || null;
    }

    if (daerahCode) {
      const { data: daerahData } = await supabaseAdmin
        .from("daerah")
        .select("id")
        .eq("code", daerahCode)
        .single();
      daerahId = daerahData?.id || null;
    }

    // Update profile
    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        email: email.trim().toLowerCase(),
        full_name: fullName || email,
        role: role,
        negeri_id: negeriId || null,
        daerah_id: daerahId || null,
        is_active: true,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      console.error("Profile update error:", profileUpdateError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ status: "error", message: "Gagal update profil admin." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userData.user.id,
      actor_role: adminProfile.role,
      action: "REGISTER_ADMIN",
      entity_type: "admin",
      entity_id: userId,
      details: { email: email, role: role, negeri_code: negeriCode, daerah_code: daerahCode },
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Akaun admin berjaya didaftarkan.",
        admin: {
          id: userId,
          email: email.trim().toLowerCase(),
          role: role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Register admin error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: "Ralat dalaman. Sila cuba lagi." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
