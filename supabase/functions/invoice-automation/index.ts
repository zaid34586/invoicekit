import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-secret",
};

type Rule = {
  id: string;
  key: string;
  name: string;
  event_type: "due_reminder" | "overdue_reminder" | "payment_thank_you";
  enabled: boolean;
  offset_days: number;
  subject_template: string;
  body_template: string;
  send_email: boolean;
  create_admin_notification: boolean;
};

type InvoiceRow = {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  total: number;
  invoice_currency: string | null;
  status: string;
  due_date: string;
};

function day(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function render(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

function money(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount || 0);
  } catch {
    return `${currency || "USD"} ${(amount || 0).toFixed(2)}`;
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const from = Deno.env.get("RIVOX_FROM_EMAIL") || "Rivox <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Resend returned ${response.status}`);
  return String(payload?.id || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authorization = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-automation-secret") || "";
    const expectedCronSecret = Deno.env.get("AUTOMATION_CRON_SECRET") || "";
    let ownerUserId: string | null = null;

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      // Authorized scheduler request.
    } else {
      const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) throw new Error("Unauthorized");
      const ownerEmail = (Deno.env.get("RIVOX_OWNER_EMAIL") || "mz7123272@gmail.com").toLowerCase();
      if ((user.email || "").toLowerCase() !== ownerEmail) throw new Error("Owner access required");
      ownerUserId = user.id;
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "run");
    const simulate = Boolean(payload.simulate);

    if (action === "status") {
      const [{ data: rules, error: rulesError }, { data: runs, error: runsError }] = await Promise.all([
        admin.from("automation_rules").select("*").order("created_at"),
        admin.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(25),
      ]);
      if (rulesError) throw rulesError;
      if (runsError) throw runsError;
      return Response.json({ ok: true, rules, runs }, { headers: corsHeaders });
    }

    if (action !== "run") throw new Error("Unsupported action");

    const { data: rules, error: rulesError } = await admin.from("automation_rules").select("*").eq("enabled", true);
    if (rulesError) throw rulesError;

    const today = new Date(`${day()}T00:00:00.000Z`);
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const rule of (rules || []) as Rule[]) {
      if (rule.event_type === "payment_thank_you") continue;
      const targetDate = rule.event_type === "due_reminder" ? day(addDays(today, rule.offset_days)) : day(today);
      let query = admin.from("invoices")
        .select("id,user_id,invoice_number,client_name,client_email,total,invoice_currency,status,due_date")
        .neq("status", "paid")
        .not("client_email", "is", null);

      query = rule.event_type === "due_reminder"
        ? query.eq("due_date", targetDate).in("status", ["sent", "overdue"])
        : query.lt("due_date", targetDate).in("status", ["sent", "overdue"]);

      const { data: invoices, error: invoiceError } = await query.limit(500);
      if (invoiceError) throw invoiceError;

      for (const invoice of (invoices || []) as InvoiceRow[]) {
        const scheduledFor = rule.event_type === "overdue_reminder" ? day(today) : targetDate;
        const { data: existing } = await admin.from("automation_runs")
          .select("id")
          .eq("rule_key", rule.key)
          .eq("invoice_id", invoice.id)
          .eq("scheduled_for", scheduledFor)
          .in("status", ["sent", "simulated"])
          .maybeSingle();
        if (existing) { skipped += 1; continue; }

        const { data: profile } = await admin.from("profiles")
          .select("business_name,email")
          .eq("user_id", invoice.user_id)
          .maybeSingle();

        const values = {
          invoice_number: invoice.invoice_number,
          client_name: invoice.client_name || "Customer",
          amount: money(invoice.total, invoice.invoice_currency),
          due_date: new Date(`${invoice.due_date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
          business_name: profile?.business_name || "Rivox customer",
        };
        const subject = render(rule.subject_template, values);
        const body = render(rule.body_template, values);

        try {
          let providerMessageId = "";
          if (!simulate && rule.send_email && invoice.client_email) providerMessageId = await sendEmail(invoice.client_email, subject, body);
          await admin.from("automation_runs").insert({
            rule_id: rule.id,
            rule_key: rule.key,
            invoice_id: invoice.id,
            user_id: invoice.user_id,
            recipient_email: invoice.client_email,
            status: simulate ? "simulated" : "sent",
            scheduled_for: scheduledFor,
            provider_message_id: providerMessageId || null,
            metadata: { subject, amount: values.amount, owner_user_id: ownerUserId },
          });
          if (rule.event_type === "overdue_reminder" && invoice.status === "sent") {
            await admin.from("invoices").update({ status: "overdue" }).eq("id", invoice.id).eq("status", "sent");
          }
          sent += 1;
        } catch (error) {
          failed += 1;
          await admin.from("automation_runs").insert({
            rule_id: rule.id,
            rule_key: rule.key,
            invoice_id: invoice.id,
            user_id: invoice.user_id,
            recipient_email: invoice.client_email,
            status: "failed",
            scheduled_for: scheduledFor,
            error_message: error instanceof Error ? error.message : "Automation failed",
            metadata: { subject },
          });
        }
      }
    }

    await admin.from("notifications").insert({
      audience: "admin",
      type: failed ? "automation_warning" : "automation_run",
      title: failed ? "Invoice automation completed with errors" : "Invoice automation completed",
      body: `${simulate ? "Simulation" : "Run"}: ${sent} processed, ${skipped} skipped, ${failed} failed.`,
      metadata: { sent, skipped, failed, simulate },
      created_by: ownerUserId,
    }).then(() => undefined).catch(() => undefined);

    return Response.json({ ok: true, sent, skipped, failed, simulate }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
