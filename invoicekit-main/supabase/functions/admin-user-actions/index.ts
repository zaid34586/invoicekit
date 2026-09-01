import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL = "mz7123272@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, message: "Unauthorized" }, 401);
    }

    const requesterEmail = (userData.user.email ?? "").toLowerCase();
    if (requesterEmail !== ADMIN_EMAIL) {
      return json({ ok: false, message: "Forbidden" }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const userId = String(body.user_id ?? "");

    if (!userId) {
      return json({ ok: false, message: "user_id required" }, 400);
    }

    if (userId === userData.user.id && action === "delete_auth_user") {
      return json({ ok: false, message: "Owner admin cannot delete self" }, 400);
    }

    if (action === "delete_auth_user") {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true, message: "Auth user deleted" });
    }

    if (action === "reset_password") {
      const password = String(body.password ?? "");
      if (password.length < 8) {
        return json({ ok: false, message: "Password must be at least 8 characters" }, 400);
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ ok: true, message: "Password reset" });
    }

    if (action === "mark_auth_banned") {
      const reason = String(body.reason ?? "Banned by admin");
      const { data: target, error: getError } = await adminClient.auth.admin.getUserById(userId);
      if (getError) throw getError;
      const currentMetadata = target.user?.app_metadata ?? {};
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...currentMetadata,
          invoicekit_banned: true,
          invoicekit_ban_reason: reason,
          invoicekit_banned_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      // Kill every active session/refresh token for this user right now --
      // without this, a banned user's already-open tab (or a captured
      // access token used directly against the API) keeps working, and
      // they can keep silently refreshing to new access tokens forever.
      // The client-side is_banned check only catches it on their next
      // full profile load, which this closes the gap on.
      const { error: signOutError } = await adminClient.auth.admin.signOut(userId, "global");
      if (signOutError) {
        console.error("mark_auth_banned: failed to revoke sessions", signOutError.message);
      }
      return json({ ok: true, message: "Auth metadata marked banned" });
    }

    if (action === "mark_auth_unbanned") {
      const { data: target, error: getError } = await adminClient.auth.admin.getUserById(userId);
      if (getError) throw getError;
      const currentMetadata = { ...(target.user?.app_metadata ?? {}) } as Record<string, unknown>;
      delete currentMetadata.invoicekit_banned;
      delete currentMetadata.invoicekit_ban_reason;
      delete currentMetadata.invoicekit_banned_at;
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: currentMetadata,
      });
      if (error) throw error;
      return json({ ok: true, message: "Auth metadata unbanned" });
    }

    return json({ ok: false, message: "Unknown action" }, 400);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
