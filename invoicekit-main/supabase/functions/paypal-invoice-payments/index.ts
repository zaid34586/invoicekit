import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paypal-auth-algo, paypal-cert-url, paypal-transmission-id, paypal-transmission-sig, paypal-transmission-time",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function encryptionKey() {
  const secret = Deno.env.get("PAYMENT_CREDENTIALS_ENCRYPTION_KEY") || "";
  if (secret.length < 32) throw new Error("Payment credentials encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function decrypt(value: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(value),
  );
  return new TextDecoder().decode(decrypted);
}

function paypalBase(environment: string) {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function accessToken(connection: any) {
  const secret = await decrypt(connection.encrypted_secret, connection.secret_iv);
  const response = await fetch(`${paypalBase(connection.environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${connection.public_key}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("The business PayPal connection is unavailable");
  return data.access_token as string;
}

function moneyValue(amount: number, currency: string) {
  return ["HUF", "JPY", "TWD"].includes(currency) ? Math.round(amount).toString() : amount.toFixed(2);
}

function invoiceAmount(invoice: any) {
  return Number(invoice.invoice_total ?? invoice.total ?? 0);
}

function invoiceCurrency(invoice: any) {
  return String(invoice.invoice_currency || invoice.business_currency || "USD").toUpperCase();
}

function safeEqualAmount(expected: number, actual: string) {
  return Math.abs(expected - Number(actual)) < 0.01;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function brandShell(labelText: string, headingText: string, bodyHtml: string) {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f3f5fb;font-family:Arial,sans-serif;color:#0f172a;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f5fb;padding:32px 12px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:650px;background:#ffffff;border-radius:24px;overflow:hidden;"><tr><td style="padding:40px 48px;background:#24134f;color:#ffffff;"><div style="font-size:32px;font-weight:800;"><span style="color:#ff7849;">⚡</span> Rivox</div><div style="margin-top:8px;font-size:17px;color:#ddd6fe;">Business OS</div></td></tr><tr><td style="padding:46px 48px;"><div style="font-size:14px;font-weight:800;letter-spacing:3px;color:#7c3aed;">${labelText}</div><h1 style="margin:22px 0 16px;font-size:34px;line-height:1.2;color:#0f172a;">${headingText}</h1>${bodyHtml}</td></tr><tr><td style="padding:25px 48px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#94a3b8;">Rivox · Secure invoicing, payments and business operations</td></tr></table></td></tr></table></body></html>`;
}

function buildCustomerReceipt(params: { business: string; invoiceNumber: string; currency: string; amount: string; reference: string }) {
  const body = `
    <p style="margin:0 0 28px;font-size:17px;line-height:1.7;color:#64748b;">Your payment to <strong>${escapeHtml(params.business)}</strong> was successful. Here is your receipt for your records.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;margin:0 0 8px;">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;"><span style="display:block;font-weight:800;color:#0f172a;">Invoice</span><span style="color:#475569;">${escapeHtml(params.invoiceNumber)}</span></p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;"><span style="display:block;font-weight:800;color:#0f172a;">Amount</span><span style="color:#475569;">${escapeHtml(params.currency)} ${escapeHtml(params.amount)}</span></p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;"><span style="display:block;font-weight:800;color:#0f172a;">Payment reference</span><span style="color:#475569;">${escapeHtml(params.reference)}</span></p>
      <p style="margin:0;font-size:14px;line-height:1.6;"><span style="display:block;font-weight:800;color:#0f172a;">Status</span><span style="color:#16a34a;font-weight:700;">Paid</span></p>
    </div>`;
  return brandShell("PAYMENT RECEIPT", "Thank you for your payment", body);
}

function buildOwnerNotice(params: { clientName: string; invoiceNumber: string; currency: string; amount: string; reference: string; providerLabel: string }) {
  const body = `
    <p style="margin:0 0 28px;font-size:17px;line-height:1.7;color:#64748b;"><strong>${escapeHtml(params.clientName)}</strong> paid <strong>${escapeHtml(params.currency)} ${escapeHtml(params.amount)}</strong> via ${escapeHtml(params.providerLabel)} for invoice <strong>${escapeHtml(params.invoiceNumber)}</strong>.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;margin:0 0 8px;">
      <p style="margin:0;font-size:14px;line-height:1.6;"><span style="display:block;font-weight:800;color:#0f172a;">Payment reference</span><span style="color:#475569;">${escapeHtml(params.reference)}</span></p>
    </div>`;
  return brandShell("PAYMENT RECEIVED", "You just got paid", body);
}

type EmailResult = { sent: boolean; id?: string; error?: string };

function isDeliverableEmail(value: string | null | undefined) {
  if (!value) return false;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".example.com") && !email.endsWith("@example.com");
}

async function sendEmail(to: string | null, subject: string, html: string): Promise<EmailResult> {
  const key = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!key) return { sent: false, error: "RESEND_API_KEY is not configured" };
  if (!isDeliverableEmail(to)) return { sent: false, error: "A deliverable recipient email is required" };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Rivox <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = result?.message || `Resend returned ${response.status}`;
    console.error("Payment email failed", error);
    return { sent: false, error };
  }
  return { sent: true, id: result?.id };
}

async function logEmail(admin: any, params: { to: string; subject: string; result: EmailResult; metadata: Record<string, unknown> }) {
  await admin.from("email_delivery_logs").insert({
    template_key: "invoice_payment_receipt",
    recipient_email: params.to,
    subject: params.subject,
    status: params.result.sent ? "sent" : "failed",
    provider_message_id: params.result.id || null,
    error_message: params.result.error || null,
    metadata: params.metadata,
  });
}

async function findInvoice(admin: any, shareToken: string) {
  const { data } = await admin.from("invoices").select("*").eq("share_token", shareToken).maybeSingle();
  return data;
}

async function workspaceForInvoice(admin: any, invoice: any) {
  const { data: workspace } = await admin.from("workspaces").select("id,name,owner_user_id")
    .eq("owner_user_id", invoice.user_id).maybeSingle();
  return workspace;
}

async function activeConnection(admin: any, workspaceId: string) {
  const { data } = await admin.from("payment_gateway_connections").select("*")
    .eq("workspace_id", workspaceId).eq("provider", "paypal").eq("status", "connected").maybeSingle();
  return data;
}

async function finalizePayment(admin: any, params: {
  invoice: any; workspace: any; connection: any; order: any; capture: any;
}) {
  const { invoice, workspace, connection, order, capture } = params;
  const amount = invoiceAmount(invoice);
  const currency = invoiceCurrency(invoice);
  const capturedAmount = capture?.amount;
  if (capture?.status !== "COMPLETED") throw new Error("PayPal has not completed this payment");
  if (!capturedAmount || capturedAmount.currency_code !== currency || !safeEqualAmount(amount, capturedAmount.value)) {
    throw new Error("PayPal payment amount or currency does not match the invoice");
  }
  const customId = order?.purchase_units?.[0]?.custom_id || capture?.custom_id;
  if (customId !== invoice.id) throw new Error("Payment does not belong to this invoice");

  const payerName = [order?.payer?.name?.given_name, order?.payer?.name?.surname].filter(Boolean).join(" ") || null;
  const payerEmail = order?.payer?.email_address || null;
  const paidAt = capture.create_time || new Date().toISOString();
  const { error: paymentError } = await admin.from("invoice_payments").upsert({
    workspace_id: workspace.id,
    owner_user_id: workspace.owner_user_id,
    invoice_id: invoice.id,
    provider: "paypal",
    gateway_connection_id: connection.id,
    environment: connection.environment,
    provider_order_id: order.id,
    provider_capture_id: capture.id,
    amount,
    currency,
    status: "paid",
    payer_email: payerEmail,
    payer_name: payerName,
    paid_at: paidAt,
    updated_at: new Date().toISOString(),
    raw_summary: { paypal_status: capture.status, seller_protection: capture.seller_protection?.status || null },
  }, { onConflict: "provider,environment,provider_order_id" });
  if (paymentError) throw paymentError;

  const wasAlreadyPaid = invoice.status === "paid";
  if (!wasAlreadyPaid) {
    const { error: invoiceError } = await admin.from("invoices").update({ status: "paid", refunded_amount: 0 }).eq("id", invoice.id);
    if (invoiceError) throw invoiceError;
    await admin.from("notifications").insert({
      audience: "user",
      recipient_user_id: workspace.owner_user_id,
      type: "invoice_paid",
      title: `Invoice ${invoice.invoice_number} paid`,
      body: `${invoice.client_name} paid ${currency} ${moneyValue(amount, currency)} via PayPal.`,
      metadata: { invoice_id: invoice.id, payment_id: capture.id, provider: "paypal" },
    });

    const { data: profile } = await admin.from("profiles").select("email,business_name")
      .eq("user_id", workspace.owner_user_id).maybeSingle();
    const businessName = profile?.business_name || workspace.name || "Business";
    const receipt = buildCustomerReceipt({ business: businessName, invoiceNumber: invoice.invoice_number, currency, amount: moneyValue(amount, currency), reference: capture.id });
    // The invoice customer email is authoritative. PayPal Sandbox payer
    // addresses end in example.com and can never receive a real receipt.
    const receiptEmail = isDeliverableEmail(invoice.client_email) ? String(invoice.client_email).trim().toLowerCase() : (isDeliverableEmail(payerEmail) ? String(payerEmail).trim().toLowerCase() : null);
    const subject = `Receipt for invoice ${invoice.invoice_number}`;
    const receiptResult = await sendEmail(receiptEmail, subject, receipt);
    if (receiptEmail) await logEmail(admin, { to: receiptEmail, subject, result: receiptResult, metadata: { invoice_id: invoice.id, payment_id: capture.id, provider: "paypal", audience: "customer" } });
    await admin.from("invoice_payments").update({
      receipt_email: receiptEmail,
      receipt_email_status: receiptResult.sent ? "sent" : receiptEmail ? "failed" : "skipped",
      receipt_email_sent_at: receiptResult.sent ? new Date().toISOString() : null,
      receipt_email_error: receiptResult.error || null,
    }).eq("provider", "paypal").eq("environment", connection.environment).eq("provider_order_id", order.id);

    const ownerSubject = `Payment received for ${invoice.invoice_number}`;
    const ownerHtml = buildOwnerNotice({ clientName: invoice.client_name, invoiceNumber: invoice.invoice_number, currency, amount: moneyValue(amount, currency), reference: capture.id, providerLabel: "PayPal" });
    const ownerResult = await sendEmail(profile?.email || null, ownerSubject, ownerHtml);
    if (profile?.email) await logEmail(admin, { to: profile.email, subject: ownerSubject, result: ownerResult, metadata: { invoice_id: invoice.id, payment_id: capture.id, provider: "paypal", audience: "owner" } });
  }
  return { paid: true, captureId: capture.id, invoiceNumber: invoice.invoice_number };
}

async function fetchOrder(connection: any, token: string, orderId: string) {
  const response = await fetch(`${paypalBase(connection.environment)}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const order = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(order.message || "PayPal order could not be verified");
  return order;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const isWebhook = Boolean(req.headers.get("paypal-transmission-id"));

    if (isWebhook) {
      const event = body;
      if (!event?.id || !event?.event_type) return json({ error: "Invalid PayPal event" }, 400);
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      const captureId = event.resource?.id;
      let payment = null;
      if (orderId) {
        const result = await admin.from("invoice_payments").select("*").eq("provider_order_id", orderId).maybeSingle();
        payment = result.data;
      }
      if (!payment && captureId) {
        const result = await admin.from("invoice_payments").select("*").eq("provider_capture_id", captureId).maybeSingle();
        payment = result.data;
      }
      if (!payment) return json({ received: true });

      const { data: connection } = payment.gateway_connection_id
        ? await admin.from("payment_gateway_connections").select("*").eq("id", payment.gateway_connection_id).maybeSingle()
        : await admin.from("payment_gateway_connections").select("*").eq("workspace_id", payment.workspace_id).eq("environment", payment.environment).eq("provider", "paypal").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!connection?.webhook_id) return json({ error: "Webhook connection not found" }, 400);
      const token = await accessToken(connection);
      const verifyResponse = await fetch(`${paypalBase(connection.environment)}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: req.headers.get("paypal-auth-algo"),
          cert_url: req.headers.get("paypal-cert-url"),
          transmission_id: req.headers.get("paypal-transmission-id"),
          transmission_sig: req.headers.get("paypal-transmission-sig"),
          transmission_time: req.headers.get("paypal-transmission-time"),
          webhook_id: connection.webhook_id,
          webhook_event: event,
        }),
      });
      const verified = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || verified.verification_status !== "SUCCESS") return json({ error: "Invalid PayPal signature" }, 401);

      const { data: seen } = await admin.from("payment_webhook_events").select("id").eq("provider", "paypal").eq("event_id", event.id).maybeSingle();
      if (seen) return json({ received: true, duplicate: true });

      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const { data: invoice } = await admin.from("invoices").select("*").eq("id", payment.invoice_id).single();
        const { data: workspace } = await admin.from("workspaces").select("id,name,owner_user_id").eq("id", payment.workspace_id).single();
        const order = await fetchOrder(connection, token, orderId || payment.provider_order_id);
        const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
        await finalizePayment(admin, { invoice, workspace, connection, order, capture });
      } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
        const refundValue = Number(event.resource?.amount?.value || 0);
        const cumulativeRefund = Math.min(Number(payment.amount), Number(payment.refunded_amount || 0) + refundValue);
        const fullyRefunded = cumulativeRefund >= Number(payment.amount) - 0.01;
        await admin.from("invoice_payments").update({ refunded_amount: cumulativeRefund, refunded_at: new Date().toISOString(), status: fullyRefunded ? "refunded" : "paid", updated_at: new Date().toISOString() }).eq("id", payment.id);
        await admin.from("invoices").update({ refunded_amount: cumulativeRefund, ...(fullyRefunded ? { status: "sent" } : {}) }).eq("id", payment.invoice_id);
        await admin.from("notifications").insert({ audience: "user", recipient_user_id: payment.owner_user_id, type: "payment_refunded", title: "Refund recorded", body: `${payment.currency} ${cumulativeRefund.toFixed(2)} has been refunded for an invoice payment.`, metadata: { invoice_id: payment.invoice_id, provider: "paypal" } });
      } else if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
        await admin.from("invoice_payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", payment.id);
      }
      await admin.from("payment_webhook_events").insert({ provider: "paypal", event_id: event.id, event_type: event.event_type });
      return json({ received: true });
    }

    const action = String(body.action || "availability");
    if (action === "resend_receipt") {
      const bearer = req.headers.get("Authorization") || "";
      const tokenValue = bearer.replace(/^Bearer\s+/i, "");
      const { data: { user }, error: authError } = await admin.auth.getUser(tokenValue);
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      const paymentId = String(body.paymentId || "");
      const { data: payment } = await admin.from("invoice_payments").select("*")
        .eq("id", paymentId).eq("provider", "paypal").eq("owner_user_id", user.id).eq("status", "paid").maybeSingle();
      if (!payment) return json({ error: "Paid invoice transaction not found" }, 404);
      const { data: invoice } = await admin.from("invoices").select("*").eq("id", payment.invoice_id).single();
      const { data: workspace } = await admin.from("workspaces").select("id,name,owner_user_id").eq("id", payment.workspace_id).single();
      const { data: profile } = await admin.from("profiles").select("business_name").eq("user_id", user.id).maybeSingle();
      const receiptEmail = isDeliverableEmail(invoice.client_email) ? String(invoice.client_email).trim().toLowerCase() : (isDeliverableEmail(payment.payer_email) ? String(payment.payer_email).trim().toLowerCase() : null);
      if (!receiptEmail) return json({ error: "Add a valid client email to this invoice before resending the receipt." }, 400);
      const businessName = profile?.business_name || workspace.name || "Business";
      const subject = `Receipt for invoice ${invoice.invoice_number}`;
      const receipt = `<div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px"><div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;padding:28px"><h1 style="color:#4f46e5">Payment receipt</h1><p>Your payment to <b>${escapeHtml(businessName)}</b> was successful.</p><div style="background:#f1f5f9;border-radius:12px;padding:18px"><p><b>Invoice:</b> ${escapeHtml(invoice.invoice_number)}</p><p><b>Amount:</b> ${escapeHtml(payment.currency)} ${escapeHtml(moneyValue(Number(payment.amount), payment.currency))}</p><p><b>PayPal reference:</b> ${escapeHtml(payment.provider_capture_id || payment.provider_order_id)}</p><p><b>Status:</b> Paid</p></div><p>Thank you for your business.</p></div></div>`;
      const result = await sendEmail(receiptEmail, subject, receipt);
      await logEmail(admin, { to: receiptEmail, subject, result, metadata: { invoice_id: invoice.id, payment_id: payment.provider_capture_id, provider: "paypal", audience: "customer", resent: true } });
      await admin.from("invoice_payments").update({ receipt_email: receiptEmail, receipt_email_status: result.sent ? "sent" : "failed", receipt_email_sent_at: result.sent ? new Date().toISOString() : null, receipt_email_error: result.error || null }).eq("id", payment.id);
      if (!result.sent) return json({ error: result.error || "Receipt email could not be sent" }, 502);
      return json({ success: true, email: receiptEmail });
    }
    const shareToken = String(body.shareToken || "");
    if (!shareToken) return json({ error: "Invoice link is required" }, 400);
    const invoice = await findInvoice(admin, shareToken);
    if (!invoice) return json({ error: "Invoice not found" }, 404);
    const workspace = await workspaceForInvoice(admin, invoice);
    if (!workspace) return json({ error: "Invoice workspace not found" }, 404);
    const { data: ownerProfile } = await admin.from("profiles").select("plan,is_pro")
      .eq("user_id", workspace.owner_user_id).maybeSingle();
    const ownerPlan = ownerProfile?.plan || (ownerProfile?.is_pro ? "pro" : "free");
    const connection = ['pro', 'business'].includes(ownerPlan) ? await activeConnection(admin, workspace.id) : null;

    if (action === "availability") {
      return json({ available: Boolean(connection), provider: connection ? "paypal" : null, environment: connection?.environment || null });
    }
    if (!connection) return json({ error: "This business has not enabled online payments." }, 409);
    if (invoice.status === "paid") return json({ error: "This invoice is already paid." }, 409);
    if (invoice.status === "draft") return json({ error: "Draft invoices cannot be paid." }, 409);

    const token = await accessToken(connection);
    if (action === "create_order") {
      const amount = invoiceAmount(invoice);
      const currency = invoiceCurrency(invoice);
      if (!(amount > 0) || !/^[A-Z]{3}$/.test(currency)) return json({ error: "Invoice amount or currency is invalid" }, 400);
      const origin = (Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://getrivox.vercel.app").replace(/\/$/, "");
      const returnUrl = `${origin}/share/${encodeURIComponent(shareToken)}?payment=paypal-return`;
      const response = await fetch(`${paypalBase(connection.environment)}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `rivox-${crypto.randomUUID()}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: invoice.invoice_number,
            custom_id: invoice.id,
            description: `Invoice ${invoice.invoice_number}`.slice(0, 127),
            amount: { currency_code: currency, value: moneyValue(amount, currency) },
          }],
          payment_source: { paypal: { experience_context: { user_action: "PAY_NOW", return_url: returnUrl, cancel_url: `${returnUrl}&cancelled=1` } } },
        }),
      });
      const order = await response.json().catch(() => ({}));
      if (!response.ok || !order.id) throw new Error(order.message || "PayPal checkout could not be created");
      const approvalUrl = order.links?.find((link: any) => link.rel === "payer-action" || link.rel === "approve")?.href;
      if (!approvalUrl) throw new Error("PayPal approval link was not returned");
      await admin.from("invoice_payments").upsert({
        workspace_id: workspace.id,
        owner_user_id: workspace.owner_user_id,
        invoice_id: invoice.id,
        provider: "paypal",
        gateway_connection_id: connection.id,
        environment: connection.environment,
        provider_order_id: order.id,
        amount,
        currency,
        status: "created",
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,environment,provider_order_id" });
      return json({ orderId: order.id, approvalUrl });
    }

    if (action === "capture_order") {
      const orderId = String(body.orderId || "");
      const { data: payment } = await admin.from("invoice_payments").select("*")
        .eq("provider_order_id", orderId).eq("invoice_id", invoice.id).maybeSingle();
      if (!payment) return json({ error: "Payment order does not match this invoice" }, 404);
      const captureResponse = await fetch(`${paypalBase(connection.environment)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `rivox-capture-${orderId}` },
        body: "{}",
      });
      let order = await captureResponse.json().catch(() => ({}));
      if (!captureResponse.ok && captureResponse.status !== 422) throw new Error(order.message || "PayPal payment could not be captured");
      if (!order.purchase_units) order = await fetchOrder(connection, token, orderId);
      const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
      const result = await finalizePayment(admin, { invoice, workspace, connection, order, capture });
      return json(result);
    }
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("paypal-invoice-payments", error);
    return json({ error: error instanceof Error ? error.message : "Payment request failed" }, 400);
  }
});
