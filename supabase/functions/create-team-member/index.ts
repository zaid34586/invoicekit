import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "mz7123272@gmail.com";

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

  if (!email || !password) return json({ error: "Email and password are required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, team_member: true },
  });

  if (createError) return json({ error: createError.message }, 400);

  const { error: insertError } = await admin.from("admin_team_members").upsert({
    auth_user_id: created.user.id,
    email,
    name,
    role,
    status: "active",
    temporary_password: password,
    notes,
    created_by: caller.user.id,
  }, { onConflict: "email" });

  if (insertError) return json({ error: insertError.message }, 400);

  await admin.from("admin_audit_logs").insert({
    actor_user_id: caller.user.id,
    action: "create_team_member_login",
    target_type: "admin_team_members",
    target_id: email,
    details: { role, name },
  });

  return json({ success: true, message: "Team member login created successfully", user_id: created.user.id });
});
