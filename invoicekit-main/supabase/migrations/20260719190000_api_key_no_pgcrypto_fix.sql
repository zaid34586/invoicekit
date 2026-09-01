-- Portable API key generation: avoid gen_random_bytes/pgcrypto schema
-- differences across hosted Supabase projects.
create or replace function public.create_workspace_api_key(p_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_workspace uuid; v_plan text; v_raw text; v_id uuid; v_name text;
begin
  select w.id,coalesce(p.plan,case when p.is_pro then 'pro' else 'free' end)
    into v_workspace,v_plan
  from public.workspaces w
  join public.profiles p on p.user_id=w.owner_user_id
  where w.owner_user_id=auth.uid()
  limit 1;

  if v_workspace is null or v_plan<>'business' then
    raise exception 'Business plan required';
  end if;

  v_name:=left(nullif(trim(p_name),''),80);
  if v_name is null then raise exception 'API key name is required'; end if;

  v_raw:='rvx_live_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.workspace_api_keys(workspace_id,name,key_prefix,key_hash,created_by)
  values(v_workspace,v_name,left(v_raw,17),encode(sha256(convert_to(v_raw,'UTF8')),'hex'),auth.uid())
  returning id into v_id;

  insert into public.workspace_audit_logs(workspace_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
  values(v_workspace,auth.uid(),auth.jwt()->>'email','api_key.created','api_key',v_id::text,jsonb_build_object('name',v_name));

  return jsonb_build_object('id',v_id,'api_key',v_raw,'prefix',left(v_raw,17));
end; $$;
grant execute on function public.create_workspace_api_key(text) to authenticated;
