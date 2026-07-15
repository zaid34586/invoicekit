import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("PADDLE_KEY_ENCRYPTION_SECRET");
  if (!secret || secret.length < 32) throw new Error("PADDLE_KEY_ENCRYPTION_SECRET must be at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return { encryptedKey: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decrypt(encryptedKey: string, ivValue: string) {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivValue) }, key, fromBase64(encryptedKey));
  return decoder.decode(decrypted);
}

async function testPaddleKey(apiKey: string, environment = String(Deno.env.get("PADDLE_ENV") || "production").toLowerCase()) {
  const baseUrl = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${baseUrl}/products?per_page=1`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Paddle API returned ${response.status}: ${body.slice(0, 240)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const ownerEmail = (Deno.env.get("RIVOX_OWNER_EMAIL") || "mz7123272@gmail.com").toLowerCase();
    if ((user.email || "").toLowerCase() !== ownerEmail) throw new Error("Owner access required");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({}));
    const action = payload.action || "status";

    const getRow = async () => {
      const { data, error } = await admin.from("admin_paddle_credentials").select("*").eq("id", "primary").single();
      if (error) throw error;
      return data;
    };

    if (action === "status") {
      const row = await getRow();
      return Response.json({ ok: true, status: {
        configured: Boolean(row.encrypted_key), last_four: row.last_four, expires_at: row.expires_at,
        updated_at: row.updated_at, connection_status: row.connection_status,
        last_tested_at: row.last_tested_at, last_error: row.last_error,
      } }, { headers: corsHeaders });
    }

    if (action === "update_key") {
      const apiKey = String(payload.api_key || "").trim();
      const expiresAt = String(payload.expires_at || "").trim();
      if (!apiKey.startsWith("pdl_") && !apiKey.startsWith("pdl_live_")) throw new Error("This does not look like a Paddle API key.");
      if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) throw new Error("A valid expiry date is required.");
      await testPaddleKey(apiKey);
      const encrypted = await encrypt(apiKey);
      const { error } = await admin.from("admin_paddle_credentials").upsert({
        id: "primary", encrypted_key: encrypted.encryptedKey, encryption_iv: encrypted.iv,
        last_four: apiKey.slice(-4), expires_at: expiresAt, connection_status: "connected",
        last_tested_at: new Date().toISOString(), last_error: null, updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      const row = await getRow();
      return Response.json({ ok: true, status: { configured: true, last_four: row.last_four, expires_at: row.expires_at, updated_at: row.updated_at, connection_status: row.connection_status, last_tested_at: row.last_tested_at, last_error: null } }, { headers: corsHeaders });
    }

    if (action === "test") {
      const row = await getRow();
      if (!row.encrypted_key || !row.encryption_iv) throw new Error("No encrypted Paddle API key has been saved yet.");
      try {
        const apiKey = await decrypt(row.encrypted_key, row.encryption_iv);
        await testPaddleKey(apiKey);
        await admin.from("admin_paddle_credentials").update({ connection_status: "connected", last_tested_at: new Date().toISOString(), last_error: null }).eq("id", "primary");
      } catch (error) {
        await admin.from("admin_paddle_credentials").update({ connection_status: "error", last_tested_at: new Date().toISOString(), last_error: error instanceof Error ? error.message : "Connection failed" }).eq("id", "primary");
        throw error;
      }
      const updated = await getRow();
      return Response.json({ ok: true, status: { configured: true, last_four: updated.last_four, expires_at: updated.expires_at, updated_at: updated.updated_at, connection_status: updated.connection_status, last_tested_at: updated.last_tested_at, last_error: updated.last_error } }, { headers: corsHeaders });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
