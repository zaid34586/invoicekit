import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
  const owner = auth.user;

  const { data: ownerProfile, error: profileError } = await admin
    .from("profiles")
    .select("user_id,id,email,business_name,country,country_code,currency,timezone,date_format,phone_verified,plan,is_pro,workspace_owner_id,workspace_role")
    .or(`user_id.eq.${owner.id},id.eq.${owner.id}`)
    .maybeSingle();
  if (profileError || !ownerProfile) return json({ error: "Owner profile not found" }, 403);
  if ((ownerProfile.workspace_owner_id && ownerProfile.workspace_owner_id !== owner.id) || ownerProfile.workspace_role === "member") {
    return json({ error: "Only the workspace owner can manage team members" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "invite");
  const email = cleanEmail(body.email);
  const role = String(body.role || "staff");
  const name = String(body.name || "").trim() || null;
  const memberId = String(body.memberId || "");

  const plan = ownerProfile.plan === "business" ? "business" : ownerProfile.plan === "pro" || ownerProfile.is_pro ? "pro" : "free";
  const limit = plan === "business" ? Number.POSITIVE_INFINITY : plan === "pro" ? 3 : 0;

  if (action === "invite") {
    if (!email) return json({ error: "Email is required" }, 400);
    if (!['manager','accountant','staff'].includes(role)) return json({ error: "Invalid role" }, 400);
    if (email === cleanEmail(owner.email)) return json({ error: "Owner email cannot be invited" }, 400);

    const { count } = await admin.from("workspace_members").select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", owner.id).in("status", ["pending", "active"]);
    if ((count || 0) >= limit) {
      return json({ error: plan === "free" ? "Team members are available on Pro and Business plans." : "Your Pro plan allows a maximum of 3 members." }, 403);
    }

    const { data: existing } = await admin.from("workspace_members").select("id,status,expires_at").eq("workspace_owner_id", owner.id).eq("email", email).maybeSingle();
    if (existing?.status === "active") return json({ error: "This person is already an active member." }, 409);
    if (existing?.status === "pending" && new Date(existing.expires_at).getTime() > Date.now()) return json({ error: "A valid pending invitation already exists for this email." }, 409);

    const redirectTo = String(body.redirectTo || `${req.headers.get("origin") || "https://getrivox.vercel.app"}/login?team_invite=1`);
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { workspace_owner_id: owner.id, workspace_role: role, invited_to_rivox: true },
    });
    if (inviteError) return json({ error: inviteError.message }, 400);

    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data: member, error: memberError } = await admin.from("workspace_members").upsert({
      workspace_owner_id: owner.id, auth_user_id: invited.user?.id || null, email, name, role,
      status: "pending", invited_by: owner.id, invited_at: new Date().toISOString(),
      last_invited_at: new Date().toISOString(), expires_at: expiresAt, updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_owner_id,email" }).select("*").single();
    if (memberError) return json({ error: memberError.message }, 400);

    if (invited.user?.id) {
      await admin.from("profiles").upsert({
        user_id: invited.user.id, id: invited.user.id, email,
        business_name: ownerProfile.business_name, country: ownerProfile.country,
        country_code: ownerProfile.country_code, currency: ownerProfile.currency,
        timezone: ownerProfile.timezone, date_format: ownerProfile.date_format,
        phone_verified: true, workspace_owner_id: owner.id, workspace_role: role,
        workspace_member_status: "active", plan: "free", is_pro: false,
      }, { onConflict: "user_id" });
      await admin.from("workspace_members").update({ status: "active", accepted_at: new Date().toISOString() }).eq("id", member.id);
    }
    return json({ success: true, member: { ...member, status: invited.user?.id ? "active" : "pending" } });
  }

  if (!memberId) return json({ error: "memberId is required" }, 400);
  const { data: member } = await admin.from("workspace_members").select("*").eq("id", memberId).eq("workspace_owner_id", owner.id).maybeSingle();
  if (!member) return json({ error: "Team member not found" }, 404);

  if (action === "disable" || action === "enable") {
    const disabled = action === "disable";
    if (member.auth_user_id) await admin.auth.admin.updateUserById(member.auth_user_id, { ban_duration: disabled ? "876000h" : "none" });
    await admin.from("workspace_members").update({ status: disabled ? "disabled" : "active", updated_at: new Date().toISOString() }).eq("id", member.id);
    if (member.auth_user_id) await admin.from("profiles").update({ workspace_member_status: disabled ? "disabled" : "active" }).eq("user_id", member.auth_user_id);
    return json({ success: true });
  }

  if (action === "remove") {
    if (member.auth_user_id) {
      await admin.from("profiles").delete().eq("user_id", member.auth_user_id);
      await admin.auth.admin.deleteUser(member.auth_user_id);
    }
    await admin.from("workspace_members").delete().eq("id", member.id);
    return json({ success: true });
  }

  if (action === "role") {
    if (!['manager','accountant','staff'].includes(role)) return json({ error: "Invalid role" }, 400);
    await admin.from("workspace_members").update({ role, updated_at: new Date().toISOString() }).eq("id", member.id);
    if (member.auth_user_id) await admin.from("profiles").update({ workspace_role: role }).eq("user_id", member.auth_user_id);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
});
