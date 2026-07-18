create or replace function public.complete_workspace_member_first_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_workspace uuid;
  v_owner uuid;
  v_role text;
begin
  v_result := public.claim_workspace_invitation();
  if coalesce((v_result->>'claimed')::boolean, false) is false then
    return v_result;
  end if;

  v_workspace := (v_result->>'workspace_id')::uuid;
  v_role := v_result->>'role';
  select owner_user_id into v_owner from public.workspaces where id = v_workspace;

  update public.profiles
  set workspace_owner_id = v_owner,
      workspace_role = v_role,
      workspace_member_status = 'active'
  where user_id = auth.uid() or id = auth.uid();

  return v_result || jsonb_build_object('owner_user_id', v_owner);
end;
$$;

grant execute on function public.complete_workspace_member_first_login() to authenticated;
