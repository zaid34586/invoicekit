import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

async function encryptionKey() {
  const secret = Deno.env.get("PAYMENT_CREDENTIALS_ENCRYPTION_KEY") || "";
  if (secret.length < 32) throw new Error("PAYMENT_CREDENTIALS_ENCRYPTION_KEY must contain at least 32 characters");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { encryptedSecret: toBase64(new Uint8Array(encrypted)), secretIv: toBase64(iv) };
}

function paypalBase(environment: string) {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(clientId: string, clientSecret: string, environment: string) {
  const response = await fetch(`${paypalBase(environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "PayPal credentials could not be verified");
  return data.access_token as string;
}

async function createWebhook(clientId: string, clientSecret: string, environment: string) {
  const token = await paypalAccessToken(clientId, clientSecret, environment);
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/paypal-invoice-payments`;
  const response = await fetch(`${paypalBase(environment)}/v1/notifications/webhooks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      event_types: [
        { name: "PAYMENT.CAPTURE.COMPLETED" },
        { name: "PAYMENT.CAPTURE.DENIED" },
        { name: "PAYMENT.CAPTURE.REFUNDED" },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.id) return data.id as string;

  // Re-use an existing webhook for this app if the same URL was registered before.
  const list = await fetch(`${paypalBase(environment)}/v1/notifications/webhooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listed = await list.json().catch(() => ({}));
  const existing = listed.webhooks?.find((item: { id: string; url: string }) => item.url === webhookUrl);
  if (existing?.id) return existing.id as string;
  throw new Error(data.message || "PayPal webhook could not be registered");
}

async function stripeAccount(secretKey: string) {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(data.error?.message || "Stripe restricted key could not be verified");
  return data;
}

async function createStripeWebhook(secretKey: string) {
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-invoice-payments`;
  const form = new URLSearchParams();
  form.set("url", webhookUrl);
  form.append("enabled_events[]", "checkout.session.completed");
  form.append("enabled_events[]", "checkout.session.async_payment_succeeded");
  form.append("enabled_events[]", "charge.refunded");
  form.append("enabled_events[]", "refund.updated");
  const response = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id || !data.secret) {
    throw new Error(data.error?.message || "Stripe webhook could not be registered. Allow Webhook Endpoints write access on the restricted key.");
  }
  return { id: data.id as string, secret: data.secret as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return reply({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, service);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return reply({ error: "Unauthorized" }, 401);

    const { data: member } = await admin.from("workspace_members")
      .select("id").or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
    if (member) return reply({ error: "Only the workspace owner can manage payment gateways." }, 403);

    const { data: workspaceId, error: workspaceError } = await admin.rpc("ensure_workspace_for_owner", { p_owner: user.id });
    if (workspaceError || !workspaceId) throw workspaceError || new Error("Workspace not found");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const { data: connection } = await admin.from("payment_gateway_connections")
      .select("id,provider,environment,public_key,status,account_email,account_id,account_country,last_verified_at,created_at")
      .eq("workspace_id", workspaceId).eq("status", "connected").maybeSingle();

    if (action === "status") {
      return reply({ connection: connection ? {
        id: connection.id,
        provider: connection.provider,
        environment: connection.environment,
        clientIdHint: `${connection.public_key.slice(0, 8)}…${connection.public_key.slice(-4)}`,
        accountEmail: connection.account_email,
        accountId: connection.account_id,
        accountCountry: connection.account_country,
        lastVerifiedAt: connection.last_verified_at,
        connectedAt: connection.created_at,
      } : null });
    }

    if (action === "disconnect") {
      if (connection?.id) await admin.from("payment_gateway_connections").update({ status: "disabled", updated_at: new Date().toISOString() }).eq("id", connection.id);
      await admin.from("profiles").update({ payment_gateway: null }).eq("user_id", user.id);
      return reply({ success: true });
    }

    if (action !== "connect") return reply({ error: "Unsupported action" }, 400);

    const { data: profile } = await admin.from("profiles").select("plan,is_pro,email")
      .eq("user_id", user.id).maybeSingle();
    const plan = profile?.plan || (profile?.is_pro ? "pro" : "free");
    if (!['pro', 'business'].includes(plan)) {
      return reply({ error: "Online invoice payments are available on Pro and Business plans." }, 403);
    }

    const provider = body.provider === "stripe" ? "stripe" : "paypal";
    const environment = body.environment === "live" ? "live" : "sandbox";
    let publicKey = "";
    let encryptedSecret = "";
    let secretIv = "";
    let webhookId = "";
    let encryptedWebhookSecret: string | null = null;
    let webhookSecretIv: string | null = null;
    let accountEmail = profile?.email || user.email || null;
    let accountId: string | null = null;
    let accountCountry: string | null = null;

    if (provider === "paypal") {
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();
      if (clientId.length < 12 || clientSecret.length < 12) return reply({ error: "Enter valid PayPal Client ID and Secret." }, 400);
      await paypalAccessToken(clientId, clientSecret, environment);
      webhookId = await createWebhook(clientId, clientSecret, environment);
      const encrypted = await encrypt(clientSecret);
      publicKey = clientId;
      encryptedSecret = encrypted.encryptedSecret;
      secretIv = encrypted.secretIv;
    } else {
      const restrictedKey = String(body.restrictedKey || "").trim();
      const expectedPrefix = environment === "live" ? "rk_live_" : "rk_test_";
      if (!restrictedKey.startsWith(expectedPrefix)) return reply({ error: `Use a ${environment === "live" ? "Live" : "Test"} restricted Stripe key (${expectedPrefix}…).` }, 400);
      const stripe = await stripeAccount(restrictedKey);
      const stripeWebhook = await createStripeWebhook(restrictedKey);
      const encrypted = await encrypt(restrictedKey);
      const encryptedWebhook = await encrypt(stripeWebhook.secret);
      publicKey = `${expectedPrefix}${"•".repeat(12)}${restrictedKey.slice(-4)}`;
      encryptedSecret = encrypted.encryptedSecret;
      secretIv = encrypted.secretIv;
      webhookId = stripeWebhook.id;
      encryptedWebhookSecret = encryptedWebhook.encryptedSecret;
      webhookSecretIv = encryptedWebhook.secretIv;
      accountEmail = stripe.email || accountEmail;
      accountId = stripe.id;
      accountCountry = stripe.country || null;
    }

    await admin.from("payment_gateway_connections")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId).eq("status", "connected");

    const { error: insertError } = await admin.from("payment_gateway_connections").insert({
      workspace_id: workspaceId,
      owner_user_id: user.id,
      provider,
      environment,
      public_key: publicKey,
      encrypted_secret: encryptedSecret,
      secret_iv: secretIv,
      webhook_id: webhookId,
      encrypted_webhook_secret: encryptedWebhookSecret,
      webhook_secret_iv: webhookSecretIv,
      status: "connected",
      account_email: accountEmail,
      account_id: accountId,
      account_country: accountCountry,
      last_verified_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    await admin.from("profiles").update({ payment_gateway: provider }).eq("user_id", user.id);
    return reply({ success: true, provider, environment });
  } catch (error) {
    console.error("payment-gateway", error);
    return reply({ error: error instanceof Error ? error.message : "Payment gateway request failed" }, 400);
  }
});
