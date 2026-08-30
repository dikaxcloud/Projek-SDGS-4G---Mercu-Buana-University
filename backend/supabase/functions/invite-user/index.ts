import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendInviteEmailViaSmtp } from "./smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_NAME = "Desa Sehat Kenanga";
const EMAIL_SUBJECT = `Undangan Akun - ${APP_NAME}`;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  nakes: "🩺 Tenaga Kesehatan",
  warga: "🏠 Warga",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function buildInviteEmailHtml(opts: {
  fullName: string;
  email: string;
  role: string;
  actionLink: string;
}): string {
  const { fullName, email, role, actionLink } = opts;
  const displayName = fullName || email.split("@")[0];
  const roleLabel = ROLE_LABELS[role] ?? role;
  const link = escapeHtml(actionLink);

  const row = (label: string, value: string) => `
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#4b6b5a;border-bottom:1px solid #e3f2e8;white-space:nowrap;">${label}</td>
                  <td style="padding:10px 16px;font-size:14px;color:#1f3d2e;font-weight:600;border-bottom:1px solid #e3f2e8;">${value}</td>
                </tr>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef7f0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef7f0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(31,61,46,0.08);">
          <tr>
            <td style="background-color:#1e7a4f;padding:28px 32px;text-align:center;">
              <div style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:1px;">🩺 ${APP_NAME}</div>
              <div style="font-size:13px;color:#cdeadd;margin-top:6px;">Undangan ${roleLabel.replace(/^[^A-Za-z]+/, "")}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 12px;font-size:15px;color:#1f3d2e;">Halo <strong>${escapeHtml(displayName)}</strong>,</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b6b5a;">
                Anda telah diundang oleh Admin ${APP_NAME} untuk bergabung sebagai <strong>${roleLabel}</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4faf6;border:1px solid #dcefe3;border-radius:10px;margin:0 0 24px;">
                ${row("Nama", escapeHtml(fullName || "-"))}
                ${row("Email", escapeHtml(email))}
                ${row("Peran", roleLabel)}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center">
                    <a href="${link}" style="display:inline-block;background-color:#1e7a4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 36px;border-radius:8px;">
                      TERIMA UNDANGAN
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#7d9a8a;">
                Tombol di atas digunakan untuk menerima undangan dan menyelesaikan akun.
                Jika tombol tidak berfungsi, salin dan buka tautan berikut di browser:
              </p>
              <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#1e7a4f;">
                <a href="${link}" style="color:#1e7a4f;">${link}</a>
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#7d9a8a;">
                Jika Anda tidak mengenal undangan ini, abaikan email ini.
              </p>
              <p style="margin:0;font-size:13px;color:#4b6b5a;">
                Salam,<br>
                <strong>Admin ${APP_NAME}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4faf6;padding:16px 32px;text-align:center;">
              <div style="font-size:11px;color:#9ab5a7;">Email ini dikirim otomatis oleh sistem ${APP_NAME}.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendInviteEmailViaResend(opts: {
  apiKey: string;
  to: string;
  html: string;
}): Promise<void> {
  const from = Deno.env.get("EMAIL_FROM") || `${APP_NAME} <onboarding@resend.dev>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: EMAIL_SUBJECT,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!,
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

    const isOwner = Boolean(owner);

    // Admin biasa (mis. pengurus RT/RW) juga boleh mengundang,
    // tapi tidak boleh membuat admin baru.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .single();

    const isAdmin = callerProfile?.role === "admin" && callerProfile?.is_active !== false;

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "Hanya admin atau owner yang bisa mengundang" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, full_name: fullName, tier } = await req.json();
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

    // Tier-aware invite: Owner tier1 can invite tier2/3/4/5, Senior tier2 can invite tier3/4/5, Junior tier3 can invite 4/5
    // Fetch caller tier via profiles
    const { data: callerTierRow } = await supabaseAdmin
      .from("profiles")
      .select("admin_tier, role")
      .eq("user_id", user.id)
      .single();
    const callerTier = callerTierRow?.role === 'admin' ? (callerTierRow.admin_tier ?? 3) : callerTierRow?.role === 'nakes' ? 4 : 5;

    if (role === "admin") {
      const requestedTier = tier === 2 || tier === "2" ? 2 : 3; // default junior
      if (requestedTier === 2 && callerTier !== 1) {
        return new Response(JSON.stringify({ error: "Hanya Owner (Tier 1) yang dapat mengundang Senior Admin (Tier 2)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (requestedTier === 3 && callerTier > 2) {
        return new Response(JSON.stringify({ error: "Hanya Owner dan Senior Admin yang dapat mengundang Junior Admin (Tier 3)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Nakes cannot invite admin at all (callerTier 4/5)
      if (callerTier >= 4) {
        return new Response(JSON.stringify({ error: "Hanya Owner dan Senior Admin yang dapat mengundang admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (role === "nakes" || role === "warga") {
      // NEW UX POLICY: invite via email hanya untuk Tier 1–3. Tier 4/5 TIDAK boleh diundang via email.
      // Nakes/Warga tetap divalidasi tapi ditolak dengan pesan khusus agar frontend tampil warning.
      return new Response(JSON.stringify({ error: "Undangan via email hanya tersedia untuk Tier 1–3." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use SITE_URL from env, fallback to request origin for local dev
    const siteUrl = Deno.env.get("SITE_URL") || new URL(req.url).origin;
    const redirectTo = `${siteUrl}/login?welcome=invitation`;

    const userMetadata: Record<string, unknown> = { role, invited_by: user.id };
    if (fullName && String(fullName).trim()) userMetadata.full_name = String(fullName).trim();
    if (role === "admin" && tier) {
      const t = tier === 2 || tier === "2" || tier === "tier2" ? 2 : 3;
      userMetadata.admin_tier = t;
    }

    const friendlyAuthError = (msg: string) =>
      /already|exists|registered/i.test(msg)
        ? "Email ini sudah terdaftar. Gunakan menu ubah role di daftar pengguna, atau hapus akunnya dulu bila ingin mengundang ulang."
        : /rate|limit|smtp/i.test(msg)
        ? "Server email sedang mencapai batas pengiriman. Tunggu beberapa menit lalu coba lagi."
        : msg;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    // Priority:
    // 1. Resend dengan domain terverifikasi (EMAIL_FROM diset)
    // 2. Gmail SMTP (SMTP_USER + SMTP_PASS diset)
    // 3. Resend dev mode (hanya kirim ke email sendiri)
    // 4. Fallback bawaan Supabase
    const useResendVerified = Boolean(resendApiKey && emailFrom);
    const useSmtp = Boolean(smtpUser && smtpPass);
    const useResendDev = Boolean(resendApiKey) && !useResendVerified && !useSmtp;

    let invitedUserId = "pending";

    if (useResendVerified || useSmtp || useResendDev) {
      // Buat user + ambil tautan undangan TANPA mengirim email bawaan Supabase
      // (email bawaan Supabase via SMTP Gmail kerap terkirim sebagai base64 → tampil teks acak di Gmail).
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: userMetadata, redirectTo },
      });

      if (linkErr) {
        console.error("Invite link error:", linkErr);
        return new Response(JSON.stringify({ error: friendlyAuthError(linkErr.message || "") }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      invitedUserId = linkData.user?.id || "pending";

      const actionLink = linkData.properties?.action_link;
      if (!actionLink) {
        return new Response(JSON.stringify({ error: "Gagal membuat tautan undangan" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const html = buildInviteEmailHtml({
        fullName: String(fullName || "").trim(),
        email,
        role,
        actionLink,
      });

      try {
        if (useResendVerified) {
          await sendInviteEmailViaResend({ apiKey: resendApiKey!, to: email, html });
        } else if (useSmtp) {
          await sendInviteEmailViaSmtp({
            host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
            port: Number(Deno.env.get("SMTP_PORT") || 465),
            user: smtpUser!,
            pass: smtpPass!,
            fromEmail: smtpUser!,
            fromName: APP_NAME,
            to: email,
            subject: EMAIL_SUBJECT,
            html,
          });
        } else {
          // Resend dev mode
          await sendInviteEmailViaResend({ apiKey: resendApiKey!, to: email, html });
        }
      } catch (mailErr) {
        console.error("Email send error:", mailErr);
        // Hapus user yang baru dibuat agar admin bisa mencoba mengundang ulang.
        if (linkData.user?.id) {
          await supabaseAdmin.auth.admin.deleteUser(linkData.user.id);
        }
        const detail = mailErr instanceof Error ? mailErr.message : String(mailErr);
        return new Response(JSON.stringify({
          error: "Gagal mengirim email undangan. Periksa konfigurasi email lalu coba lagi.",
          detail,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Fallback: kirim via email bawaan Supabase (template dari Dashboard).
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: userMetadata,
        redirectTo,
      });

      if (inviteErr) {
        console.error("Invite error:", inviteErr);
        return new Response(JSON.stringify({ error: friendlyAuthError(inviteErr.message || "") }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      invitedUserId = inviteData.user?.id || "pending";
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: user.id,
      action: "invite_user",
      entity: "auth.users",
      entity_id: invitedUserId,
      metadata: { email, role },
    });

    return new Response(JSON.stringify({ status: "invited" }), {
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