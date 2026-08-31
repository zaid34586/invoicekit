import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "mz7123272@gmail.com";
const DEFAULT_STAFF_PORTAL_URL = "https://staff.rivoxcloud.com";
const DEFAULT_ADMIN_PORTAL_URL = "https://admin.rivoxcloud.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildWelcomeEmail(params: {
  name: string | null;
  email: string;
  password: string;
  role: string;
  staffPortalUrl: string;
  adminPortalUrl: string;
}) {
  const displayName = params.name?.trim() || params.email;
  const safeName = escapeHtml(displayName);
  const safeEmail = escapeHtml(params.email);
  const safePassword = escapeHtml(params.password);
  const safeRole = escapeHtml(params.role.replaceAll("_", " "));
  const safeStaffUrl = escapeHtml(params.staffPortalUrl);
  const safeAdminUrl = escapeHtml(params.adminPortalUrl);

  const subject = "Welcome to Rivox Staff Portal";
  const text = `Hello ${displayName},\n\nYour Rivox staff account has been created.\n\nStaff portal: ${params.staffPortalUrl}\nEmail: ${params.email}\nTemporary password: ${params.password}\nRole: ${params.role}\n\nLogin using the staff portal only. The owner admin portal is separate: ${params.adminPortalUrl}\n\nPlease change your password after first login.\n\nRivox Team`;

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f5fb;font-family:Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f5fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:650px;background:#ffffff;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:40px 48px;background:#24134f;color:#ffffff;">
                <div style="font-size:32px;font-weight:800;">
                  <span style="color:#ff7849;">⚡</span> Rivox
                </div>
                <div style="margin-top:8px;font-size:17px;color:#ddd6fe;">Business OS</div>
              </td>
            </tr>

            <tr>
              <td style="padding:46px 48px;">
                <div style="font-size:14px;font-weight:800;letter-spacing:3px;color:#7c3aed;">
                  STAFF ACCOUNT CREATED
                </div>

                <h1 style="margin:22px 0 16px;font-size:34px;line-height:1.2;color:#0f172a;">
                  Welcome to Rivox, ${safeName}
                </h1>

                <p style="margin:0 0 28px;font-size:17px;line-height:1.7;color:#64748b;">
                  Your staff account has been created. Use the credentials below to sign in to the staff portal.
                </p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;margin:0 0 28px;">
                  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
                    <span style="display:block;font-weight:800;color:#0f172a;">Email</span>
                    <span style="color:#475569;">${safeEmail}</span>
                  </p>
                  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
                    <span style="display:block;font-weight:800;color:#0f172a;">Temporary Password</span>
                    <span style="font-family:'Courier New',monospace;background:#ede9fe;color:#5b21b6;border-radius:8px;padding:6px 12px;display:inline-block;margin-top:4px;">${safePassword}</span>
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.6;text-transform:capitalize;">
                    <span style="display:block;font-weight:800;color:#0f172a;text-transform:none;">Role</span>
                    <span style="color:#475569;">${safeRole}</span>
                  </p>
                </div>

                <a href="${safeStaffUrl}"
                   style="display:inline-block;padding:17px 28px;background:#5b42ed;color:#ffffff;text-decoration:none;border-radius:12px;font-size:17px;font-weight:700;">
                  Open Staff Portal
                </a>

                <p style="margin:32px 0 0;font-size:14px;line-height:1.7;color:#94a3b8;">
                  You will be asked to set a new password on first login. Staff must sign in only through the staff portal — the owner admin portal is a separate, restricted address. Never share this email, your password, or the login link with anyone.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:25px 48px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#94a3b8;">
                Rivox · Secure invoicing, payments and business operations
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

async function sendWelcomeEmail(params: {
  to: string;
  name: string | null;
  password: string;
  role: string;
  staffPortalUrl: string;
  adminPortalUrl: string;
}) {
  const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!apiKey) {
    return {
      sent: false,
      status: "not_configured",
      error: "Email is not configured. Set RESEND_API_KEY in Supabase Edge Function secrets. Staff login was still created; use the temporary password shown in Admin.",
    };
  }

  if (!apiKey.startsWith("re_")) {
    return {
      sent: false,
      status: "failed",
      error: "RESEND_API_KEY looks invalid. It should start with re_. Staff login was still created; use the temporary password shown in Admin.",
    };
  }

  const from = Deno.env.get("STAFF_INVITE_FROM") || "Rivox <onboarding@resend.dev>";
  const email = buildWelcomeEmail({
    name: params.name,
    email: params.to,
    password: params.password,
    role: params.role,
    staffPortalUrl: params.staffPortalUrl,
    adminPortalUrl: params.adminPortalUrl,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = result?.message || result?.error || `Email API failed with ${response.status}`;
    return {
      sent: false,
      status: "failed",
      error: `${providerMessage}. Staff login was still created; use the temporary password shown in Admin until email is configured.`,
    };
  }

  return { sent: true, status: "sent", error: null, id: result?.id ?? null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);

  if (callerError || caller.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: "Admin access only" }, 403);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || null;
  const role = String(body.role ?? "limited");
  const department = body.department ? String(body.department).trim() : null;
  const notes = String(body.notes ?? "").trim() || null;
  const staffPortalUrl = String(body.staffPortalUrl ?? Deno.env.get("STAFF_PORTAL_URL") ?? DEFAULT_STAFF_PORTAL_URL).trim();
  const adminPortalUrl = String(body.adminPortalUrl ?? Deno.env.get("ADMIN_PORTAL_URL") ?? DEFAULT_ADMIN_PORTAL_URL).trim();

  if (!email || !password) return json({ error: "Email and password are required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role,
      team_member: true,
      force_password_change: true,
      staff_portal_url: staffPortalUrl,
    },
  });

  if (createError) return json({ error: createError.message }, 400);

  const emailResult = await sendWelcomeEmail({
    to: email,
    name,
    password,
    role,
    staffPortalUrl,
    adminPortalUrl,
  });

  const { error: insertError } = await admin.from("admin_team_members").upsert({
    auth_user_id: created.user.id,
    email,
    name,
    role,
    department,
    status: "active",
    temporary_password: password,
    notes,
    created_by: caller.user.id,
    invite_status: emailResult.status,
    invite_email_sent_at: emailResult.sent ? new Date().toISOString() : null,
    invite_error: emailResult.error,
    staff_portal_url: staffPortalUrl,
  }, { onConflict: "email" });

  if (insertError) return json({ error: insertError.message }, 400);

  await admin.from("admin_audit_logs").insert({
    actor_user_id: caller.user.id,
    action: "create_team_member_login",
    target_type: "admin_team_members",
    target_id: email,
    details: { role, name, staff_portal_url: staffPortalUrl, invite_status: emailResult.status, invite_email_sent: emailResult.sent, invite_error: emailResult.error },
  });

  return json({
    success: true,
    message: emailResult.sent
      ? "Team member login created and welcome email sent"
      : "Team member login created, but welcome email was not sent",
    user_id: created.user.id,
    email_sent: emailResult.sent,
    email_error: emailResult.error,
    invite_status: emailResult.status,
  });
});
