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

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

async function recordInvitationEmail(admin: ReturnType<typeof createClient>, inviteId: string, email: string, result: { sent: boolean; id?: string; error?: string }) {
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("workspace_invitations").update({ email_status: result.sent ? "sent" : "failed", email_sent_at: result.sent ? now : null, email_provider_id: result.id || null, email_error: result.error || null, last_email_attempt_at: now, updated_at: now }).eq("id", inviteId),
    admin.from("email_delivery_logs").insert({ template_key: "team_invitation", recipient_email: email, subject: "Rivox workspace invitation", status: result.sent ? "sent" : "failed", provider_message_id: result.id || null, error_message: result.error || null, metadata: { invitation_id: inviteId } }),
  ]);
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

    const { data: callerMembership } = await admin.from("workspace_members")
      .select("id").or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
    if (callerMembership || user.user_metadata?.workspace_invitation_id) {
      return json({ error: "Only the workspace owner can manage team members." }, 403);
    }

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
            .select("id,user_id,email,name,role,status,joined_at,permissions,custom_role_name")
            .eq("workspace_id", workspaceId)
            .order("created_at"),
          admin
            .from("workspace_invitations")
            .select("id,email,name,role,status,expires_at,created_at,email_status,email_sent_at,email_error,last_email_attempt_at")
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

      // Expired pending rows must not block a fresh invitation. Remove only
      // unaccepted Auth accounts created by those invitations.
      const { data: expiredInvites } = await admin.from("workspace_invitations")
        .select("id,email").eq("workspace_id", workspaceId).eq("status", "pending").lte("expires_at", new Date().toISOString());
      for (const expired of expiredInvites || []) {
        const expiredUser = await findAuthUserByEmail(admin, expired.email.toLowerCase());
        if (expiredUser?.user_metadata?.workspace_invitation_id === expired.id) {
          const [{ count: memberships }, { count: ownedWorkspaces }] = await Promise.all([
            admin.from("workspace_members").select("id", { count: "exact", head: true }).or(`user_id.eq.${expiredUser.id},auth_user_id.eq.${expiredUser.id}`),
            admin.from("workspaces").select("id", { count: "exact", head: true }).eq("owner_user_id", expiredUser.id),
          ]);
          if (!memberships && !ownedWorkspaces) {
            await admin.from("profiles").delete().eq("user_id", expiredUser.id);
            await admin.auth.admin.deleteUser(expiredUser.id);
          }
        }
      }
      if (expiredInvites?.length) await admin.from("workspace_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).in("id", expiredInvites.map((item) => item.id));

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
      await recordInvitationEmail(admin, invite.id, email, emailResult);
      await admin.from("workspace_audit_logs").insert({ workspace_id: workspaceId, actor_user_id: user.id, actor_email: user.email, action: "member.invited", entity_type: "workspace_invitation", entity_id: invite.id, metadata: { email, role } });
      return json({ success: true, invite, emailSent: emailResult.sent, emailError: emailResult.error || null });
    }

    if (action === "resend") {
      const inviteId = String(body.inviteId || "");
      const { data: invitation } = await admin.from("workspace_invitations")
        .select("id,email,name,role,status,expires_at").eq("id", inviteId).eq("workspace_id", workspaceId).maybeSingle();
      if (!invitation || invitation.status !== "pending") return json({ error: "Pending invitation not found." }, 404);

      const invitedAuthUser = await findAuthUserByEmail(admin, invitation.email.toLowerCase());
      if (!invitedAuthUser || invitedAuthUser.user_metadata?.workspace_invitation_id !== inviteId) {
        return json({ error: "The invited login is missing. Revoke this invitation and send a new one." }, 409);
      }
      const password = temporaryPassword();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const { error: updateUserError } = await admin.auth.admin.updateUserById(invitedAuthUser.id, {
        password,
        user_metadata: { ...invitedAuthUser.user_metadata, force_password_change: true, workspace_invitation_id: inviteId, workspace_role: invitation.role },
      });
      if (updateUserError) return json({ error: updateUserError.message }, 400);
      await admin.from("workspace_invitations").update({ expires_at: expiresAt, status: "pending", updated_at: new Date().toISOString() }).eq("id", inviteId);
      const appOrigin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://getrivox.vercel.app";
      const loginUrl = `${appOrigin.replace(/\/$/, "")}/login?team=1&email=${encodeURIComponent(invitation.email)}`;
      const emailResult = await sendMemberCredentials({ email: invitation.email, name: invitation.name, password, role: invitation.role, workspace: profile?.business_name || "Rivox Workspace", loginUrl });
      await recordInvitationEmail(admin, inviteId, invitation.email, emailResult);
      await admin.from("workspace_audit_logs").insert({ workspace_id: workspaceId, actor_user_id: user.id, actor_email: user.email, action: "member.invitation_resent", entity_type: "workspace_invitation", entity_id: inviteId, metadata: { email: invitation.email, role: invitation.role } });
      if (!emailResult.sent) return json({ error: emailResult.error || "Invitation email could not be sent.", invitationRetained: true }, 502);
      return json({ success: true, emailSent: true, expiresAt });
    }

    if (action === "update") {
      const id = String(body.memberId || "");
      const { data: targetMember } = await admin.from("workspace_members")
        .select("user_id,auth_user_id,email,role,status").eq("id", id).eq("workspace_id", workspaceId).neq("role", "owner").maybeSingle();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.role && ["manager", "accountant", "staff"].includes(body.role)) patch.role = body.role;
      if (body.status && ["active", "disabled"].includes(body.status)) patch.status = body.status;
      if (body.permissions !== undefined || body.customRoleName !== undefined) {
        const plan = (profile?.plan || (profile?.is_pro ? "pro" : "free")) as string;
        if (plan !== "business") return json({ error: "Custom permissions require the Business plan." }, 403);
        if (body.permissions !== undefined) {
          const allowed = ["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","invoices.delete","reports.view","support.view"];
          if (!Array.isArray(body.permissions) || body.permissions.some((p: unknown) => typeof p !== "string" || !allowed.includes(p))) return json({ error: "Invalid permissions." }, 400);
          patch.permissions = body.permissions;
        }
        if (body.customRoleName !== undefined) patch.custom_role_name = String(body.customRoleName || "").trim().slice(0, 40) || null;
      }
      const { error } = await admin
        .from("workspace_members")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .neq("role", "owner");
      if (error) throw error;
      const targetUserId = targetMember?.user_id || targetMember?.auth_user_id;
      if (targetUserId) {
        const profilePatch: Record<string, unknown> = {};
        if (patch.role) profilePatch.workspace_role = patch.role;
        if (patch.status) profilePatch.workspace_member_status = patch.status;
        if (Object.keys(profilePatch).length) await admin.from("profiles").update(profilePatch).eq("user_id", targetUserId);
      }
      await admin.from("workspace_audit_logs").insert({ workspace_id: workspaceId, actor_user_id: user.id, actor_email: user.email, action: patch.status ? "member.status_changed" : "member.role_changed", entity_type: "workspace_member", entity_id: id, metadata: patch });
      return json({ success: true });
    }

    if (action === "remove") {
      const { data: targetMember } = await admin.from("workspace_members")
        .select("user_id,auth_user_id,email").eq("id", body.memberId).eq("workspace_id", workspaceId).neq("role", "owner").maybeSingle();
      const { error } = await admin
        .from("workspace_members")
        .delete()
        .eq("id", body.memberId)
        .eq("workspace_id", workspaceId)
        .neq("role", "owner");
      if (error) throw error;
      const targetUserId = targetMember?.user_id || targetMember?.auth_user_id;
      if (targetUserId) {
        await admin.from("profiles").delete().eq("user_id", targetUserId);
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUserId);
        if (deleteAuthError) throw deleteAuthError;
      }
      await admin.from("workspace_audit_logs").insert({ workspace_id: workspaceId, actor_user_id: user.id, actor_email: user.email, action: "member.removed", entity_type: "workspace_member", entity_id: String(body.memberId), metadata: { email: targetMember?.email } });
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
