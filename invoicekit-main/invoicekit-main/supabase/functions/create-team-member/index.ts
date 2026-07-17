import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "mz7123272@gmail.com";
const DEFAULT_STAFF_PORTAL_URL = "https://staff.rivox.com";
const DEFAULT_ADMIN_PORTAL_URL = "https://admin.rivox.com";

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
  <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
      <div style="background:#4f46e5;color:#fff;padding:26px 30px;">
        <h1 style="margin:0;font-size:24px;">Welcome to Rivox</h1>
        <p style="margin:8px 0 0;color:#e0e7ff;">Your staff account is ready.</p>
      </div>
      <div style="padding:30px;">
        <p style="font-size:16px;line-height:1.6;">Hello <b>${safeName}</b>,</p>
        <p style="font-size:15px;line-height:1.6;">Your Rivox staff account has been created. Use the details below to sign in.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin:22px 0;">
          <p style="margin:0 0 10px;font-size:14px;"><b>Staff Portal</b><br><a href="${safeStaffUrl}" style="color:#4f46e5;">${safeStaffUrl}</a></p>
          <p style="margin:0 0 10px;font-size:14px;"><b>Email</b><br>${safeEmail}</p>
          <p style="margin:0 0 10px;font-size:14px;"><b>Temporary Password</b><br><span style="font-family:monospace;background:#eef2ff;border-radius:8px;padding:6px 10px;display:inline-block;">${safePassword}</span></p>
          <p style="margin:0;font-size:14px;text-transform:capitalize;"><b>Role</b><br>${safeRole}</p>
        </div>
        <a href="${safeStaffUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;border-radius:12px;padding:12px 20px;font-weight:700;">Open Staff Portal</a>
        <p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:22px;">Security note: Staff must use the staff portal only. Owner admin portal is separate: ${safeAdminUrl}</p>
      </div>
    </div>
  </div>`;

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
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");

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
