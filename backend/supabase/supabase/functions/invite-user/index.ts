import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      console.error("Auth validation failed:", userErr?.message);
      return new Response(JSON.stringify({ 
        error: "Invalid token", 
        detail: "Token akses tidak valid atau kedaluwarsa. Silakan login ulang." 
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: owner } = await supabaseAdmin
      .from("app_owners")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!owner) {
      return new Response(JSON.stringify({ error: "Hanya owner yang bisa mengundang" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role } = await req.json();
    if (!email || !role) {
      return new Response(JSON.stringify({ error: "Email dan role wajib diisi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["admin", "nakes", "warga"].includes(role)) {
      return new Response(JSON.stringify({ error: "Role tidak valid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use SITE_URL from env, fallback to request origin for local dev
    const siteUrl = Deno.env.get("SITE_URL") || new URL(req.url).origin;
    const redirectTo = `${siteUrl}/login?welcome=invitation`;

    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { role, invited_by: user.id },
      redirectTo,
    });

    if (inviteErr) {
      console.error("Invite error:", inviteErr);
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: user.id,
      action: "invite_user",
      entity: "auth.users",
      entity_id: inviteData.user?.id || "pending",
      metadata: { email, role },
    });

    return new Response(JSON.stringify({ status: "invited", user: inviteData.user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "Internal server error", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});