import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function sendMemberCredentials(params: { email: string; name: string | null; password: string; role: string; workspace: string; loginUrl: string }) {
  const key = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!key) return { sent: false, error: "RESEND_API_KEY is not configured" };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Rivox <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: params.email,
      subject: `Your Rivox login for ${params.workspace}`,
      html: `<div style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px"><div style="max-width:600px;margin:auto;background:white;border-radius:18px;padding:30px"><h1 style="color:#4f46e5">Welcome to Rivox</h1><p>Hello <b>${escapeHtml(params.name || params.email)}</b>,</p><p>You have been added to <b>${escapeHtml(params.workspace)}</b> as <b>${escapeHtml(params.role)}</b>.</p><div style="background:#f1f5f9;border-radius:12px;padding:18px"><p><b>Email</b><br>${escapeHtml(params.email)}</p><p><b>Temporary password</b><br><code style="font-size:16px">${escapeHtml(params.password)}</code></p></div><p>You will be asked to create a new password after your first login.</p><a href="${escapeHtml(params.loginUrl)}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Login to Rivox</a></div></div>`,
    }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok ? { sent: true, id: result?.id } : { sent: false, error: result?.message || `Email failed (${response.status})` };
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, service);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("plan,is_pro,business_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: workspaceId, error: workspaceError } = await admin.rpc(
      "ensure_workspace_for_owner",
      { p_owner: user.id },
    );
    if (workspaceError) throw workspaceError;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
      await admin
        .from("workspace_invitations")
        .update({ status: "expired" })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .lte("expires_at", new Date().toISOString());

      const [{ data: dbMembers, error: memberError }, { data: invites, error: inviteError }] =
        await Promise.all([
          admin
            .from("workspace_members")
            .select("id,user_id,email,name,role,status,joined_at")
            .eq("workspace_id", workspaceId)
            .order("created_at"),
          admin
            .from("workspace_invitations")
            .select("id,email,name,role,status,expires_at,created_at")
            .eq("workspace_id", workspaceId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ]);

      if (memberError || inviteError) throw memberError || inviteError;

      const owner = {
        id: `owner-${user.id}`,
        user_id: user.id,
        email: user.email || "",
        name: profile?.business_name || "Owner",
        role: "owner",
        status: "active",
        joined_at: user.created_at,
      };
      const members = [owner, ...(dbMembers || []).filter((m: any) => m.role !== "owner")];
      const plan = (profile?.plan || (profile?.is_pro ? "pro" : "free")) as string;
      const limit = plan === "business" ? null : plan === "pro" ? 3 : 0;

      return json({
        members,
        invites,
        plan,
        seatLimit: limit,
        seatsUsed: members.filter((m: any) => m.role !== "owner" && m.status === "active").length,
      });
    }

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim() || null;
      const password = String(body.password || "");
      const role = String(body.role || "");
      if (!email || password.length < 8 || !["manager", "accountant", "staff"].includes(role)) {
        return json({ error: "Valid email, role and a temporary password of at least 8 characters are required" }, 400);
      }

      const plan = (profile?.plan || (profile?.is_pro ? "pro" : "free")) as string;
      const limit = plan === "business" ? 999999 : plan === "pro" ? 3 : 0;
      const { count } = await admin
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .neq("role", "owner")
        .eq("status", "active");
      const { count: pending } = await admin
        .from("workspace_invitations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if ((count || 0) + (pending || 0) >= limit) {
        return json(
          { error: limit === 0 ? "Upgrade to Pro to invite team members." : "Team seat limit reached." },
          403,
        );
      }

      const { data: existing } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .ilike("email", email)
        .maybeSingle();
      if (existing) return json({ error: "This person is already a workspace member." }, 409);

      // Supabase creates an Auth user as soon as inviteUserByEmail is called.
      // Revoking an app invitation does not remove that Auth record, so a retry
      // otherwise fails with "email address has already been registered". Only
      // remove records created by our earlier workspace invite when they never
      // joined a workspace and never created a customer profile.
      const existingAuthUser = await findAuthUserByEmail(admin, email);
      if (existingAuthUser) {
        const [{ count: memberships }, { count: ownedWorkspaces }] = await Promise.all([
          admin
            .from("workspace_members")
            .select("id", { count: "exact", head: true })
            .or(`user_id.eq.${existingAuthUser.id},auth_user_id.eq.${existingAuthUser.id}`),
          admin
            .from("workspaces")
            .select("id", { count: "exact", head: true })
            .eq("owner_user_id", existingAuthUser.id),
        ]);
        const wasWorkspaceInvite = Boolean(existingAuthUser.user_metadata?.workspace_invitation_id);
        if (wasWorkspaceInvite && !memberships && !ownedWorkspaces) {
          // The old /login invite callback could create a blank customer profile
          // before the invitation was accepted. It is safe to remove only after
          // confirming this invited account owns no workspace and joined none.
          await admin.from("profiles").delete().eq("user_id", existingAuthUser.id);
          const { error: deleteError } = await admin.auth.admin.deleteUser(existingAuthUser.id);
          if (deleteError) return json({ error: `Unable to reset the previous invitation: ${deleteError.message}` }, 409);
        } else {
          return json({
            error: "An account with this email already exists. Ask this user to sign in, or use a different email address.",
          }, 409);
        }
      }

      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data: invite, error: inviteError } = await admin
        .from("workspace_invitations")
        .insert({ workspace_id: workspaceId, email, name, role, invited_by: user.id, expires_at: expires })
        .select()
        .single();

      if (inviteError) {
        return json(
          { error: inviteError.code === "23505" ? "A pending invitation already exists for this email." : inviteError.message },
          409,
        );
      }

      const appOrigin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://getrivox.vercel.app";
      const loginUrl = `${appOrigin.replace(/\/$/, "")}/login?team=1&email=${encodeURIComponent(email)}`;
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { workspace_invitation_id: invite.id, workspace_role: role, invited_name: name, force_password_change: true },
      });
      if (createError) {
        await admin.from("workspace_invitations").delete().eq("id", invite.id);
        return json({ error: createError.message }, 400);
      }
      const emailResult = await sendMemberCredentials({ email, name, password, role, workspace: profile?.business_name || "Rivox Workspace", loginUrl });
      return json({ success: true, invite, emailSent: emailResult.sent, emailError: emailResult.error || null });
    }

    if (action === "update") {
      const id = String(body.memberId || "");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.role && ["manager", "accountant", "staff"].includes(body.role)) patch.role = body.role;
      if (body.status && ["active", "disabled"].includes(body.status)) patch.status = body.status;
      const { error } = await admin
        .from("workspace_members")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .neq("role", "owner");
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "remove") {
      const { error } = await admin
        .from("workspace_members")
        .delete()
        .eq("id", body.memberId)
        .eq("workspace_id", workspaceId)
        .neq("role", "owner");
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "revoke") {
      const { data: invitation } = await admin
        .from("workspace_invitations")
        .select("email")
        .eq("id", body.inviteId)
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .maybeSingle();
      const { error } = await admin
        .from("workspace_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", body.inviteId)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      if (invitation?.email) {
        const invitedAuthUser = await findAuthUserByEmail(admin, invitation.email.toLowerCase());
        if (invitedAuthUser?.user_metadata?.workspace_invitation_id === body.inviteId) {
          const [{ count: memberships }, { count: ownedWorkspaces }] = await Promise.all([
            admin.from("workspace_members").select("id", { count: "exact", head: true })
              .or(`user_id.eq.${invitedAuthUser.id},auth_user_id.eq.${invitedAuthUser.id}`),
            admin.from("workspaces").select("id", { count: "exact", head: true })
              .eq("owner_user_id", invitedAuthUser.id),
          ]);
          if (!memberships && !ownedWorkspaces) {
            await admin.from("profiles").delete().eq("user_id", invitedAuthUser.id);
            await admin.auth.admin.deleteUser(invitedAuthUser.id);
          }
        }
      }
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("workspace-team", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
