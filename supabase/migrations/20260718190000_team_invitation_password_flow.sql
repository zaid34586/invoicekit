create or replace function public.get_my_pending_workspace_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_inv public.workspace_invitations%rowtype;
  v_workspace public.workspaces%rowtype;
  v_inviter_name text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return jsonb_build_object('valid', false, 'error', 'Authentication required.');
  end if;

  update public.workspace_invitations set status = 'expired', updated_at = now()
  where lower(email) = v_email and status = 'pending' and expires_at <= now();

  select * into v_inv from public.workspace_invitations
  where lower(email) = v_email and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if v_inv.id is null then
    return jsonb_build_object('valid', false, 'error', 'This invitation is invalid, expired, or already used.');
  end if;

  select * into v_workspace from public.workspaces where id = v_inv.workspace_id;
  select coalesce(nullif(business_name, ''), email, 'Workspace owner') into v_inviter_name
  from public.profiles where user_id = v_inv.invited_by limit 1;

  return jsonb_build_object(
    'valid', true, 'email', v_inv.email, 'name', v_inv.name, 'role', v_inv.role,
    'workspace_name', v_workspace.name, 'invited_by_name', coalesce(v_inviter_name, 'Workspace owner'),
    'expires_at', v_inv.expires_at
  );
end;
$$;

grant execute on function public.get_my_pending_workspace_invitation() to authenticated;
