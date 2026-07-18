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
      const role = String(body.role || "");
      if (!email || !["manager", "accountant", "staff"].includes(role)) {
        return json({ error: "Valid email and role are required" }, 400);
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
        const [{ count: memberships }, { count: profiles }] = await Promise.all([
          admin
            .from("workspace_members")
            .select("id", { count: "exact", head: true })
            .or(`user_id.eq.${existingAuthUser.id},auth_user_id.eq.${existingAuthUser.id}`),
          admin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .or(`user_id.eq.${existingAuthUser.id},id.eq.${existingAuthUser.id}`),
        ]);
        const wasWorkspaceInvite = Boolean(existingAuthUser.user_metadata?.workspace_invitation_id);
        if (wasWorkspaceInvite && !memberships && !profiles) {
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

      const appOrigin = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://getrivox.vercel.app";
      const redirectTo = `${appOrigin.replace(/\/$/, "")}/accept-invitation`;
      const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { workspace_invitation_id: invite.id, workspace_role: role, invited_name: name },
      });

      if (mailError) {
        await admin.from("workspace_invitations").delete().eq("id", invite.id);
        return json({ error: mailError.message }, 400);
      }
      return json({ success: true, invite });
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
          const [{ count: memberships }, { count: profiles }] = await Promise.all([
            admin.from("workspace_members").select("id", { count: "exact", head: true })
              .or(`user_id.eq.${invitedAuthUser.id},auth_user_id.eq.${invitedAuthUser.id}`),
            admin.from("profiles").select("id", { count: "exact", head: true })
              .or(`user_id.eq.${invitedAuthUser.id},id.eq.${invitedAuthUser.id}`),
          ]);
          if (!memberships && !profiles) await admin.auth.admin.deleteUser(invitedAuthUser.id);
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
