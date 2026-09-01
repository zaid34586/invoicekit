-- Public invoice branding must resolve from the invoice token itself.
-- The Business plan is enforced when branding is created/updated; repeating
-- that plan check here caused valid, already-published designs to disappear
-- when legacy profile rows used a different plan/workspace representation.
create or replace function public.get_shared_invoice_branding(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select to_jsonb(b) - 'workspace_id' - 'updated_by'
  into v_result
  from public.invoices i
  join public.workspace_branding b on exists (
    select 1
    from public.workspaces w
    where w.id = b.workspace_id
      and (
        w.owner_user_id = i.user_id
        or w.owner_user_id = coalesce(
          (
            select p.workspace_owner_id
            from public.profiles p
            where p.user_id = i.user_id or p.id = i.user_id
            limit 1
          ),
          i.user_id
        )
        or exists (
          select 1
          from public.workspace_members m
          where m.workspace_id = w.id
            and coalesce(m.user_id, m.auth_user_id) = i.user_id
            and m.status = 'active'
        )
      )
  )
  where i.share_token = p_token
  order by b.updated_at desc
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_shared_invoice_branding(uuid) from public;
grant execute on function public.get_shared_invoice_branding(uuid) to anon, authenticated;

