import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "mz7123272@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return Response.json({ error: "Server configuration missing." }, { status: 500, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (userData.user?.email?.toLowerCase() !== OWNER_EMAIL) {
      return Response.json({ error: "Not allowed." }, { status: 403, headers: corsHeaders });
    }

    const { email, password, name, role = "limited", notes } = await req.json();
    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400, headers: corsHeaders });
    }
    if (String(password).length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { role: "team_member", name: name ?? null },
    });
    if (createError) return Response.json({ error: createError.message }, { status: 400, headers: corsHeaders });

    const { error: insertError } = await admin.from("admin_team_members").upsert({
      auth_user_id: created.user.id,
      email: normalizedEmail,
      name: name ?? null,
      role,
      status: "active",
      temporary_password: String(password),
      notes: notes ?? null,
      created_by: userData.user.id,
    }, { onConflict: "email" });
    if (insertError) return Response.json({ error: insertError.message }, { status: 400, headers: corsHeaders });

    return Response.json({ ok: true, user_id: created.user.id }, { headers: corsHeaders });
  } catch (_e) {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders });
  }
});
