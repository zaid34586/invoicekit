import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// P0 fix from the architecture review: resolving a ticket (or replying to one)
// only ever updated the DB -- the customer had no way to know unless they
// happened to reopen the Support page. This closes that loop with an email,
// reusing the same Resend + email_provider_settings + email_delivery_logs
// pattern already used by admin-email, but callable by ANY active staff
// member (not owner-only) since Support/Finance staff are the ones actually
// resolving tickets day to day.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Unauthorized" }, 401);

    // Any active staff member (any role) or the owner can trigger this --
    // whoever is actually working the ticket.
    const ownerEmail = (Deno.env.get("ADMIN_EMAIL") || "mz7123272@gmail.com").toLowerCase();
    const callerEmail = (authData.user.email || "").toLowerCase();
    let isAuthorized = callerEmail === ownerEmail;
    if (!isAuthorized) {
      const { data: staff } = await admin.from("admin_team_members")
        .select("id")
        .eq("status", "active")
        .or(`auth_user_id.eq.${authData.user.id},email.eq.${callerEmail}`)
        .maybeSingle();
      isAuthorized = Boolean(staff);
    }
    if (!isAuthorized) return json({ error: "Staff access required" }, 403);

    if (!resendKey) return json({ error: "RESEND_API_KEY is not configured" }, 400);
    const { data: settings } = await admin.from("email_provider_settings").select("*").limit(1).maybeSingle();
    if (settings && !settings.email_enabled) return json({ ok: true, skipped: "Email delivery is disabled" });

    const body = await req.json().catch(() => ({}));
    const ticketId = String(body.ticket_id || "");
    const kind = body.kind === "reply" ? "reply" : "resolved";
    if (!ticketId) return json({ error: "ticket_id is required" }, 400);

    const { data: ticket, error: ticketError } = await admin
      .from("admin_support_tickets")
      .select("id, user_id, subject, resolution_summary, status")
      .eq("id", ticketId)
      .single();
    if (ticketError || !ticket) return json({ error: "Ticket not found" }, 404);
    if (!ticket.user_id) return json({ ok: true, skipped: "Ticket has no linked customer" });

    const { data: profile } = await admin.from("profiles").select("email,business_name").eq("user_id", ticket.user_id).maybeSingle();
    const recipient = profile?.email;
    if (!recipient) return json({ ok: true, skipped: "No customer email on file" });

    const greetName = profile?.business_name || "there";
    const fromName = settings?.from_name || "Rivox";
    const fromEmail = settings?.from_email || "onboarding@resend.dev";

    let subject: string;
    let html: string;
    if (kind === "resolved") {
      subject = `Resolved: ${ticket.subject}`;
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
        <h1 style="color:#0f172a">Your ticket has been resolved</h1>
        <p style="color:#475569">Hi ${greetName}, your support ticket "<b>${ticket.subject}</b>" has been marked resolved.</p>
        ${ticket.resolution_summary ? `<p style="color:#334155;background:#f8fafc;padding:16px;border-radius:8px">${ticket.resolution_summary}</p>` : ""}
        <p style="color:#94a3b8;font-size:13px">If this isn't fully sorted, just reply to this email or reopen the ticket in your dashboard.</p>
      </div>`;
    } else {
      subject = `New reply: ${ticket.subject}`;
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
        <h1 style="color:#0f172a">You have a new reply</h1>
        <p style="color:#475569">Hi ${greetName}, our team replied to your ticket "<b>${ticket.subject}</b>". Log in to your dashboard to view and respond.</p>
      </div>`;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [recipient], subject, html, reply_to: settings?.reply_to || undefined }),
    });
    const providerData = await response.json();

    await admin.from("email_delivery_logs").insert({
      template_key: `ticket_${kind}`,
      recipient_email: recipient,
      subject,
      status: response.ok ? "sent" : "failed",
      provider_message_id: providerData?.id || null,
      error_message: response.ok ? null : JSON.stringify(providerData),
      triggered_by: authData.user.id,
    });

    if (!response.ok) return json({ error: providerData?.message || "Provider rejected email" }, 400);

    await admin.from("admin_audit_logs").insert({
      action: "ticket.customer_notified",
      target_type: "ticket",
      target_id: ticketId,
      details: { kind, recipient },
    });

    return json({ message: "Customer notified", id: providerData.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
