create or replace function public.get_shared_invoice_branding(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_invoice_user uuid;
  v_workspace_id uuid;
  v_owner_user uuid;
  v_plan text;
  v_brand public.workspace_branding%rowtype;
begin
  select i.user_id into v_invoice_user
  from public.invoices i
  where i.share_token=p_token
  limit 1;

  if v_invoice_user is null then return null; end if;

  -- Team-created invoices still belong to the owner's workspace. Older
  -- accounts store that relationship on profiles, while newer accounts also
  -- have workspace_members rows, so support both shapes.
  select coalesce(p.workspace_owner_id, p.user_id, v_invoice_user)
  into v_owner_user
  from public.profiles p
  where p.user_id=v_invoice_user or p.id=v_invoice_user
  limit 1;
  v_owner_user := coalesce(v_owner_user, v_invoice_user);

  select w.id,w.owner_user_id into v_workspace_id,v_owner_user
  from public.workspaces w
  where w.owner_user_id=v_owner_user
     or w.owner_user_id=v_invoice_user
     or exists(
       select 1 from public.workspace_members m
       where m.workspace_id=w.id and m.user_id=v_invoice_user and m.status='active'
     )
  order by case when w.owner_user_id=v_invoice_user then 0 else 1 end
  limit 1;

  if v_workspace_id is null then return null; end if;

  select lower(trim(coalesce(p.plan,case when p.is_pro then 'pro' else 'free' end)))
  into v_plan from public.profiles p where p.user_id=v_owner_user limit 1;

  if v_plan is distinct from 'business' then return null; end if;

  select b.* into v_brand
  from public.workspace_branding b
  where b.workspace_id=v_workspace_id
  limit 1;

  if v_brand.workspace_id is null then return null; end if;
  return to_jsonb(v_brand)-'workspace_id'-'updated_by';
end;
$$;

revoke all on function public.get_shared_invoice_branding(uuid) from public;
grant execute on function public.get_shared_invoice_branding(uuid) to anon,authenticated;
