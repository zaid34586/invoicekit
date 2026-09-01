import { createClient } from "@supabase/supabase-js";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const signature=async(secret:string,body:string)=>{const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,"0")).join("")};

// Bug-010 fix: attempts an actual HTTP delivery for a single delivery row
// and records the result. Shared by both the manual "Retry" action and the
// new "deliver-pending" sweep triggered right after invoice/client writes.
async function attemptDelivery(admin: ReturnType<typeof createClient>, delivery: any, hook: any) {
  const payload = JSON.stringify(delivery.payload);
  const sig = await signature(hook.signing_secret, payload);
  let status = 0, responseBody = "";
  try {
    const response = await fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Rivox-Event": delivery.event_type, "X-Rivox-Signature": `sha256=${sig}`, "X-Rivox-Delivery": delivery.id },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    status = response.status;
    responseBody = (await response.text()).slice(0, 2000);
  } catch (e) {
    responseBody = e instanceof Error ? e.message : "Network failure";
  }
  const success = status >= 200 && status < 300;
  const attempts = (delivery.attempts || 0) + 1;
  const next = new Date(Date.now() + Math.min(3600000, 30000 * Math.pow(2, attempts))).toISOString();
  await admin.from("workspace_webhook_deliveries").update({
    status: success ? "delivered" : "failed",
    attempts,
    response_status: status || null,
    response_body: responseBody,
    next_retry_at: next,
    delivered_at: success ? new Date().toISOString() : null,
  }).eq("id", delivery.id);
  return { success, status };
}

// Resolve the workspace this user can act on: owner directly, or via an
// active workspace_members row (mirrors public.current_workspace_owner_id()).
async function resolveWorkspaceId(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: ownWorkspace } = await admin.from("workspaces").select("id").eq("owner_user_id", userId).maybeSingle();
  if (ownWorkspace?.id) return ownWorkspace.id as string;
  const { data: member } = await admin.from("workspace_members").select("workspace_id").or(`user_id.eq.${userId},auth_user_id.eq.${userId}`).eq("status", "active").maybeSingle();
  return (member?.workspace_id as string | undefined) || null;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, service);
    const body = await req.json();

    // Cron-triggered sweep: authenticated via a shared secret (set with
    // `supabase secrets set WEBHOOK_CRON_SECRET=...`) instead of a user
    // session, since a scheduled job has no logged-in user. Without this,
    // deliveries only ever retried when a customer happened to create or
    // edit an invoice/client themselves -- a failed delivery from an
    // otherwise-idle workspace could sit "failed" indefinitely.
    if (body.action === "cron-sweep") {
      const expected = Deno.env.get("WEBHOOK_CRON_SECRET");
      const provided = req.headers.get("x-cron-secret");
      if (!expected || !provided || provided !== expected) return json({ error: "Unauthorized" }, 401);
      const { data: due } = await admin.from("workspace_webhook_deliveries")
        .select("*,workspace_webhooks!inner(id,url,signing_secret,workspace_id,active)")
        .eq("workspace_webhooks.active", true)
        .in("status", ["pending", "failed"])
        .lte("next_retry_at", new Date().toISOString())
        .lt("attempts", 8)
        .order("created_at", { ascending: true })
        .limit(200);
      let delivered = 0, failed = 0;
      for (const d of due || []) {
        const hook = (d as any).workspace_webhooks;
        const result = await attemptDelivery(admin, d, hook);
        if (result.success) delivered++; else failed++;
      }
      return json({ swept: (due || []).length, delivered, failed });
    }

    const auth = req.headers.get("authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: callerProfile } = await admin.from("profiles").select("is_banned").eq("user_id", user.id).maybeSingle();
    if (callerProfile?.is_banned) return json({ error: "Account suspended" }, 403);

    if (body.action === "deliver-pending") {
      const workspaceId = await resolveWorkspaceId(admin, user.id);
      if (!workspaceId) return json({ delivered: 0, failed: 0 });
      const { data: due } = await admin.from("workspace_webhook_deliveries")
        .select("*,workspace_webhooks!inner(id,url,signing_secret,workspace_id,active)")
        .eq("workspace_webhooks.workspace_id", workspaceId)
        .eq("workspace_webhooks.active", true)
        .in("status", ["pending", "failed"])
        .lte("next_retry_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(20);
      let delivered = 0, failed = 0;
      for (const d of due || []) {
        const hook = (d as any).workspace_webhooks;
        const result = await attemptDelivery(admin, d, hook);
        if (result.success) delivered++; else failed++;
      }
      return json({ delivered, failed });
    }

    // Manual retry of a single delivery -- owner-only (matches the
    // Business Center route, which is restricted to workspace owners).
    const { data: delivery } = await admin.from("workspace_webhook_deliveries").select("*,workspace_webhooks!inner(id,url,signing_secret,workspace_id,active,workspaces!inner(owner_user_id))").eq("id", body.deliveryId).maybeSingle();
    const hook = (delivery as any)?.workspace_webhooks;
    if (!delivery || hook?.workspaces?.owner_user_id !== user.id) return json({ error: "Delivery not found" }, 404);
    if (!hook.active) return json({ error: "Webhook is disabled" }, 400);
    const result = await attemptDelivery(admin, delivery, hook);
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
