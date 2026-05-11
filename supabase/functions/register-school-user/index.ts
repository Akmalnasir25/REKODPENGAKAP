import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { schoolId, schoolCode, email, password, fullName } = await req.json();

    // Validate input
    if (!schoolId || !schoolCode || !email || !password) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sila lengkapkan semua maklumat." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ status: "error", message: "Kata laluan mesti sekurang-kurangnya 6 aksara." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase admin client (service role)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Find school and verify code
    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .select("id, name, school_code, is_claimed, is_active")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah tidak dijumpai." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify school code matches
    if (school.school_code.toUpperCase() !== schoolCode.trim().toUpperCase()) {
      return new Response(
        JSON.stringify({ status: "error", message: "Kod sekolah tidak sepadan." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check if school is active
    if (!school.is_active) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah ini tidak aktif. Sila hubungi admin." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check if school already claimed
    if (school.is_claimed) {
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah ini telah didaftarkan. Sila log masuk atau hubungi admin untuk reset akaun." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        school_id: school.id,
        school_name: school.name,
        school_code: school.school_code,
        role: "school_user",
      },
    });

    if (authError) {
      // Check if email already exists
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

    // 6. Update profile (created by trigger, now update with school info)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        email: email.trim().toLowerCase(),
        full_name: fullName || null,
        role: "school_user",
        school_id: school.id,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Profile update error:", profileError);
      // Non-fatal — profile was created by trigger, just missing school link
    }

    // 7. Claim school (atomic conditional update)
    const { data: claimResult, error: claimError } = await supabaseAdmin
      .from("schools")
      .update({
        is_claimed: true,
        claimed_by: userId,
        claimed_email: email.trim().toLowerCase(),
        claimed_at: new Date().toISOString(),
      })
      .eq("id", school.id)
      .eq("is_claimed", false) // Only update if still unclaimed (race condition protection)
      .select();

    if (claimError || !claimResult || claimResult.length === 0) {
      // Race condition: someone else claimed it between our check and update
      // Clean up: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ status: "error", message: "Sekolah ini baru sahaja didaftarkan oleh pengguna lain. Sila cuba lagi atau hubungi admin." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Log audit
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      actor_role: "school_user",
      action: "REGISTER",
      entity_type: "school",
      entity_id: school.id,
      details: { school_name: school.name, school_code: school.school_code, email: email },
    });

    // 9. Success
    return new Response(
      JSON.stringify({
        status: "success",
        message: "Akaun sekolah berjaya didaftarkan. Sila log masuk.",
        user: {
          id: userId,
          email: email.trim().toLowerCase(),
          schoolName: school.name,
          schoolCode: school.school_code,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Register error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: "Ralat dalaman. Sila cuba lagi." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
