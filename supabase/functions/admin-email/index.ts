import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function interpolate(value: string, variables: Record<string, unknown>) {
  return value.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => String(variables[key] ?? ""));
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
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Unauthorized" }, 401);

    const adminEmail = (Deno.env.get("ADMIN_EMAIL") || "mz7123272@gmail.com").toLowerCase();
    const isAdmin = authData.user.email?.toLowerCase() === adminEmail;
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    if (action === "status") return json({ configured: Boolean(resendKey), provider: "resend", message: resendKey ? "Resend secret configured" : "Add RESEND_API_KEY to Supabase secrets" });

    if (!resendKey) return json({ error: "RESEND_API_KEY is not configured" }, 400);
    const { data: settings } = await adminClient.from("email_provider_settings").select("*").limit(1).maybeSingle();
    if (settings && !settings.email_enabled) return json({ error: "Email delivery is disabled" }, 400);

    let recipient = String(body.recipient || "").trim();
    let subject = "Rivox email delivery test";
    let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px"><h1 style="color:#0f172a">Rivox email is connected</h1><p style="color:#475569">Your transactional email provider is configured and ready.</p><p style="font-size:12px;color:#94a3b8">Sent from the Rivox Admin Email Center.</p></div>`;
    let templateKey = "test_email";

    if (action === "send_template") {
      templateKey = String(body.template_key || "");
      const { data: template, error } = await adminClient.from("email_templates").select("*").eq("template_key", templateKey).eq("enabled", true).single();
      if (error || !template) return json({ error: "Template not found or disabled" }, 404);
      subject = interpolate(template.subject, body.variables || {});
      html = interpolate(template.html_body, body.variables || {});
      recipient = String(body.recipient || "").trim();
    }
    if (!recipient || !recipient.includes("@")) return json({ error: "Valid recipient required" }, 400);

    const fromName = settings?.from_name || "Rivox";
    const fromEmail = settings?.from_email || "onboarding@resend.dev";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [recipient], subject, html, reply_to: settings?.reply_to || undefined }),
    });
    const providerData = await response.json();
    await adminClient.from("email_delivery_logs").insert({
      template_key: templateKey,
      recipient_email: recipient,
      subject,
      status: response.ok ? "sent" : "failed",
      provider_message_id: providerData?.id || null,
      error_message: response.ok ? null : JSON.stringify(providerData),
      triggered_by: authData.user.id,
    });
    if (!response.ok) return json({ error: providerData?.message || "Provider rejected email" }, 400);
    return json({ message: "Email sent successfully", id: providerData.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
