import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-secret",
};

function render(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

function formatDate(value: string | null) {
  if (!value) return "your current billing period end";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

async function authorize(req: Request, admin: ReturnType<typeof createClient>) {
  const cronSecret = Deno.env.get("AUTOMATION_CRON_SECRET") || "";
  if (cronSecret && req.headers.get("x-automation-secret") === cronSecret) return { ok: true, userId: null };

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, userId: null };
  const token = authHeader.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user || String(data.user.email || "").toLowerCase() !== "mz7123272@gmail.com") return { ok: false, userId: null };
  return { ok: true, userId: data.user.id };
}

async function sendEmail(to: string, subject: string, body: string) {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Rivox <onboarding@resend.dev>";
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: [to], from, subject, html: `<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#0f172a\"><p>${body.replaceAll("\n", "</p><p>")}</p><p style=\"color:#64748b;font-size:12px\">Rivox Billing</p></div>` }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || "Email delivery failed");
  return payload?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const auth = await authorize(req, admin);
    if (!auth.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const simulate = body.action === "simulate";

    const { data: rules, error: rulesError } = await admin.from("subscription_automation_rules").select("*").eq("enabled", true);
    if (rulesError) throw rulesError;

    const { data: run, error: runError } = await admin.from("subscription_automation_runs").insert({
      run_type: simulate ? "manual_simulation" : "manual_or_scheduled",
      status: "running",
      created_by: auth.userId,
    }).select("id").single();
    if (runError) throw runError;

    let processed = 0, sent = 0, failed = 0;
    const now = new Date();

    for (const rule of rules || []) {
      const candidates: Array<any> = [];
      if (rule.rule_type === "renewal_reminder" || rule.rule_type === "trial_ending") {
        const column = rule.rule_type === "renewal_reminder" ? "renews_at" : "trial_ends_at";
        const target = new Date(now.getTime() + Number(rule.days_before || 0) * 86400000);
        const start = new Date(target); start.setUTCHours(0, 0, 0, 0);
        const end = new Date(target); end.setUTCHours(23, 59, 59, 999);
        const { data } = await admin.from("subscriptions").select("id,user_id,plan,status,customer_email,amount,currency,renews_at,trial_ends_at,ends_at").gte(column, start.toISOString()).lte(column, end.toISOString()).in("status", ["active", "trialing"]);
        candidates.push(...(data || []));
      }

      for (const subscription of candidates) {
        processed += 1;
        const { data: profile } = await admin.from("profiles").select("email,business_name").eq("user_id", subscription.user_id).maybeSingle();
        const email = subscription.customer_email || profile?.email;
        if (!email) { failed += 1; continue; }
        const eventDate = rule.rule_type === "trial_ending" ? subscription.trial_ends_at : subscription.renews_at;
        const dedupeKey = `${rule.rule_type}:${subscription.id}:${String(eventDate).slice(0, 10)}`;
        const values = {
          name: profile?.business_name || "there",
          plan: subscription.plan || "paid",
          date: formatDate(eventDate),
          amount: subscription.amount ? `${subscription.currency || ""} ${subscription.amount}`.trim() : "",
        };
        const subject = render(rule.subject_template, values);
        const message = render(rule.body_template, values);

        const { data: delivery, error: deliveryError } = await admin.from("subscription_automation_deliveries").insert({
          rule_type: rule.rule_type, user_id: subscription.user_id, subscription_id: subscription.id,
          dedupe_key: dedupeKey, recipient_email: email, status: simulate ? "simulated" : "pending",
          metadata: { subject, message },
        }).select("id").single();
        if (deliveryError?.code === "23505") continue;
        if (deliveryError) { failed += 1; continue; }

        if (simulate) { sent += 1; continue; }
        try {
          const messageId = await sendEmail(email, subject, message);
          await admin.from("subscription_automation_deliveries").update({ status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString() }).eq("id", delivery.id);
          sent += 1;
        } catch (error) {
          await admin.from("subscription_automation_deliveries").update({ status: "failed", error_message: error instanceof Error ? error.message : "Delivery failed" }).eq("id", delivery.id);
          failed += 1;
        }
      }
    }

    await admin.from("subscription_automation_runs").update({
      status: simulate ? "simulated" : "completed", processed_count: processed, sent_count: sent, failed_count: failed, completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return new Response(JSON.stringify({ ok: true, simulated: simulate, processed, sent, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Automation failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
