import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const zeroDecimal = new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
async function encryptionKey() {
  const secret = Deno.env.get("PAYMENT_CREDENTIALS_ENCRYPTION_KEY") || "";
  if (secret.length < 32) throw new Error("Payment credentials encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(), fromBase64(value));
  return new TextDecoder().decode(decrypted);
}
function invoiceAmount(invoice: any) { return Number(invoice.invoice_total ?? invoice.total ?? 0); }
function invoiceCurrency(invoice: any) { return String(invoice.invoice_currency || invoice.business_currency || "USD").toUpperCase(); }
function minorAmount(amount: number, currency: string) { return Math.round(amount * (zeroDecimal.has(currency) ? 1 : 100)); }
function majorAmount(amount: number, currency: string) { return amount / (zeroDecimal.has(currency) ? 1 : 100); }
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function sendEmail(to: string | null, subject: string, html: string) {
  const key = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!key || !to) return;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM_EMAIL") || "Rivox <onboarding@resend.dev>", to, subject, html }) });
  if (!response.ok) console.error("Stripe payment email failed", await response.text());
}

async function stripeRequest(secret: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Stripe request failed");
  return data;
}

async function publicContext(admin: any, shareToken: string) {
  const { data: invoice } = await admin.from("invoices").select("*").eq("share_token", shareToken).maybeSingle();
  if (!invoice) throw new Error("Invoice not found");
  const { data: workspace } = await admin.from("workspaces").select("id,name,owner_user_id").eq("owner_user_id", invoice.user_id).maybeSingle();
  if (!workspace) throw new Error("Invoice workspace not found");
  const { data: profile } = await admin.from("profiles").select("plan,is_pro,email,business_name").eq("user_id", workspace.owner_user_id).maybeSingle();
  const plan = profile?.plan || (profile?.is_pro ? "pro" : "free");
  const { data: connection } = ['pro','business'].includes(plan) ? await admin.from("payment_gateway_connections").select("*").eq("workspace_id", workspace.id).eq("provider", "stripe").eq("status", "connected").maybeSingle() : { data: null };
  return { invoice, workspace, profile, connection };
}

async function finalizePaid(admin: any, context: any, session: any) {
  const { invoice, workspace, profile, connection } = context;
  const currency = invoiceCurrency(invoice);
  const amount = invoiceAmount(invoice);
  if (session.payment_status !== "paid" || session.currency?.toUpperCase() !== currency || Math.abs(majorAmount(session.amount_total, currency) - amount) >= 0.01) throw new Error("Stripe payment does not match this invoice");
  if (session.metadata?.invoice_id !== invoice.id) throw new Error("Stripe payment does not belong to this invoice");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntent) throw new Error("Stripe payment reference is missing");
  const payerEmail = session.customer_details?.email || session.customer_email || invoice.client_email || null;
  const payerName = session.customer_details?.name || invoice.client_name || null;
  const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const { error: paymentError } = await admin.from("invoice_payments").upsert({ workspace_id: workspace.id, owner_user_id: workspace.owner_user_id, invoice_id: invoice.id, provider: "stripe", gateway_connection_id: connection.id, environment: connection.environment, provider_order_id: session.id, provider_capture_id: paymentIntent, amount, currency, status: "paid", payer_email: payerEmail, payer_name: payerName, paid_at: paidAt, updated_at: new Date().toISOString(), raw_summary: { stripe_payment_status: session.payment_status } }, { onConflict: "provider,environment,provider_order_id" });
  if (paymentError) throw paymentError;
  if (invoice.status !== "paid") {
    await admin.from("invoices").update({ status: "paid", refunded_amount: 0 }).eq("id", invoice.id);
    await admin.from("notifications").insert({ audience: "user", recipient_user_id: workspace.owner_user_id, type: "invoice_paid", title: `Invoice ${invoice.invoice_number} paid`, body: `${invoice.client_name} paid ${currency} ${amount.toFixed(2)} via Stripe.`, metadata: { invoice_id: invoice.id, payment_id: paymentIntent, provider: "stripe" } });
    const business = profile?.business_name || workspace.name || "Business";
    await Promise.all([
      sendEmail(payerEmail, `Receipt for invoice ${invoice.invoice_number}`, `<div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px"><div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;padding:28px"><h1 style="color:#635bff">Payment receipt</h1><p>Your payment to <b>${escapeHtml(business)}</b> was successful.</p><p><b>Invoice:</b> ${escapeHtml(invoice.invoice_number)}<br><b>Amount:</b> ${currency} ${amount.toFixed(2)}<br><b>Stripe reference:</b> ${escapeHtml(paymentIntent)}<br><b>Status:</b> Paid</p></div></div>`),
      sendEmail(profile?.email || null, `Payment received for ${invoice.invoice_number}`, `<div style="font-family:Arial,sans-serif"><h2>Payment received</h2><p>${escapeHtml(invoice.client_name)} paid <b>${currency} ${amount.toFixed(2)}</b> via Stripe for invoice <b>${escapeHtml(invoice.invoice_number)}</b>.</p></div>`),
    ]);
  }
  return { paid: true, paymentId: paymentIntent, invoiceNumber: invoice.invoice_number };
}

async function verifyStripeSignature(raw: string, header: string, secret: string) {
  const values = Object.fromEntries(header.split(",").map((item) => item.split("=", 2)));
  const timestamp = Number(values.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${values.t}.${raw}`)));
  const expected = Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const signatures = header.split(",").filter((item) => item.startsWith("v1=")).map((item) => item.slice(3));
  return signatures.some((signature) => signature.length === expected.length && signature.split("").every((character, index) => character === expected[index]));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const signature = req.headers.get("stripe-signature");
    if (signature) {
      const raw = await req.text();
      const event = JSON.parse(raw);
      const object = event.data?.object || {};
      const invoiceId = object.metadata?.invoice_id;
      let payment = null;
      if (invoiceId) payment = (await admin.from("invoice_payments").select("*").eq("invoice_id", invoiceId).eq("provider", "stripe").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
      if (!payment && object.payment_intent) payment = (await admin.from("invoice_payments").select("*").eq("provider_capture_id", object.payment_intent).eq("provider", "stripe").maybeSingle()).data;
      if (!payment) return json({ received: true });
      const { data: connection } = payment.gateway_connection_id
        ? await admin.from("payment_gateway_connections").select("*").eq("id", payment.gateway_connection_id).maybeSingle()
        : await admin.from("payment_gateway_connections").select("*").eq("workspace_id", payment.workspace_id).eq("provider", "stripe").eq("environment", payment.environment).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!connection?.encrypted_webhook_secret || !connection?.webhook_secret_iv) return json({ error: "Stripe webhook connection not found" }, 400);
      const webhookSecret = await decrypt(connection.encrypted_webhook_secret, connection.webhook_secret_iv);
      if (!(await verifyStripeSignature(raw, signature, webhookSecret))) return json({ error: "Invalid Stripe signature" }, 401);
      const seen = (await admin.from("payment_webhook_events").select("id").eq("provider", "stripe").eq("event_id", event.id).maybeSingle()).data;
      if (seen) return json({ received: true, duplicate: true });

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const { data: invoice } = await admin.from("invoices").select("*").eq("id", payment.invoice_id).single();
        const { data: workspace } = await admin.from("workspaces").select("id,name,owner_user_id").eq("id", payment.workspace_id).single();
        const { data: profile } = await admin.from("profiles").select("email,business_name").eq("user_id", workspace.owner_user_id).maybeSingle();
        await finalizePaid(admin, { invoice, workspace, profile, connection }, object);
      } else if (event.type === "charge.refunded" || event.type === "refund.updated") {
        const amount = majorAmount(Number(object.amount_refunded || object.amount || 0), payment.currency);
        const fullyRefunded = amount >= Number(payment.amount) - 0.01;
        await admin.from("invoice_payments").update({ refunded_amount: amount, refunded_at: new Date().toISOString(), status: fullyRefunded ? "refunded" : "paid", updated_at: new Date().toISOString() }).eq("id", payment.id);
        await admin.from("invoices").update({ refunded_amount: amount, ...(fullyRefunded ? { status: "sent" } : {}) }).eq("id", payment.invoice_id);
        await admin.from("notifications").insert({ audience: "user", recipient_user_id: payment.owner_user_id, type: "payment_refunded", title: `Refund recorded`, body: `${payment.currency} ${amount.toFixed(2)} was refunded for an invoice payment.`, metadata: { invoice_id: payment.invoice_id, provider: "stripe" } });
      }
      await admin.from("payment_webhook_events").insert({ provider: "stripe", event_id: event.id, event_type: event.type });
      return json({ received: true });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "availability");
    const shareToken = String(body.shareToken || "");
    if (!shareToken) return json({ error: "Invoice link is required" }, 400);
    const context = await publicContext(admin, shareToken);
    if (action === "availability") return json({ available: Boolean(context.connection), provider: context.connection ? "stripe" : null, environment: context.connection?.environment || null });
    if (!context.connection) return json({ error: "This business has not enabled Stripe payments." }, 409);
    if (context.invoice.status === "paid") return json({ error: "This invoice is already paid." }, 409);
    if (context.invoice.status === "draft") return json({ error: "Draft invoices cannot be paid." }, 409);
    const secret = await decrypt(context.connection.encrypted_secret, context.connection.secret_iv);

    if (action === "create_session") {
      const amount = invoiceAmount(context.invoice);
      const currency = invoiceCurrency(context.invoice);
      const origin = (Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://getrivox.vercel.app").replace(/\/$/, "");
      const form = new URLSearchParams();
      form.set("mode", "payment"); form.set("success_url", `${origin}/share/${encodeURIComponent(shareToken)}?payment=stripe-return&session_id={CHECKOUT_SESSION_ID}`); form.set("cancel_url", `${origin}/share/${encodeURIComponent(shareToken)}?payment=stripe-cancelled`);
      form.set("line_items[0][quantity]", "1"); form.set("line_items[0][price_data][currency]", currency.toLowerCase()); form.set("line_items[0][price_data][unit_amount]", minorAmount(amount, currency).toString()); form.set("line_items[0][price_data][product_data][name]", `Invoice ${context.invoice.invoice_number}`);
      form.set("metadata[invoice_id]", context.invoice.id); form.set("payment_intent_data[metadata][invoice_id]", context.invoice.id);
      if (context.invoice.client_email) form.set("customer_email", context.invoice.client_email);
      const session = await stripeRequest(secret, "/v1/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `rivox-${crypto.randomUUID()}` }, body: form });
      await admin.from("invoice_payments").upsert({ workspace_id: context.workspace.id, owner_user_id: context.workspace.owner_user_id, invoice_id: context.invoice.id, provider: "stripe", gateway_connection_id: context.connection.id, environment: context.connection.environment, provider_order_id: session.id, amount, currency, status: "created", updated_at: new Date().toISOString() }, { onConflict: "provider,environment,provider_order_id" });
      return json({ sessionId: session.id, checkoutUrl: session.url });
    }
    if (action === "verify_session") {
      const sessionId = String(body.sessionId || "");
      const payment = (await admin.from("invoice_payments").select("*").eq("provider_order_id", sessionId).eq("invoice_id", context.invoice.id).eq("provider", "stripe").maybeSingle()).data;
      if (!payment) return json({ error: "Stripe session does not match this invoice" }, 404);
      const session = await stripeRequest(secret, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      return json(await finalizePaid(admin, context, session));
    }
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("stripe-invoice-payments", error);
    return json({ error: error instanceof Error ? error.message : "Stripe payment request failed" }, 400);
  }
});
