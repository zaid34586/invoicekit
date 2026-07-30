-- Assignment Center Phase 1: smart auto-suggestion backend.
--
-- Goal (per the redesign plan): when the admin is about to create a task or
-- assign a ticket, the system should suggest a starting point instead of a
-- blank dropdown --
--   * Support tickets -> the active "support" agent with the fewest open
--     tickets right now (load-balance), UNLESS the subject/message smells
--     like billing/refund/payment, in which case prefer "finance" agents.
--   * Tasks -> filtered/suggested by the chosen department, again picking
--     whoever currently has the least open work.
-- The admin can always override -- this is a suggestion, not a lock.
create or replace function public.admin_suggest_assignee(
  p_kind text,            -- 'task' | 'ticket'
  p_department text default null,   -- task department: general/support/finance/sales/engineering
  p_text text default null          -- ticket subject + message, for keyword routing
)
returns table (
  member_id uuid,
  name text,
  email text,
  role text,
  open_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target_roles text[];
  v_haystack text := lower(coalesce(p_text, ''));
begin
  -- Only the platform owner/admin can call this -- same guard used by every
  -- other admin_* table/RPC in this schema.
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'mz7123272@gmail.com' then
    raise exception 'Not authorized';
  end if;

  if p_kind = 'ticket' then
    if v_haystack ~ '(refund|billing|payment|charge|invoice|subscription|price|receipt)' then
      v_target_roles := array['finance', 'full_access'];
    else
      v_target_roles := array['support', 'full_access'];
    end if;
  else
    v_target_roles := case coalesce(p_department, 'general')
      when 'support' then array['support', 'full_access']
      when 'finance' then array['finance', 'full_access']
      when 'sales' then array['full_access', 'limited']
      when 'engineering' then array['full_access', 'limited']
      else array['full_access', 'limited']
    end;
  end if;

  return query
  with candidates as (
    select m.id, m.name, m.email, m.role,
      -- Prefer an exact role match over the full_access fallback pool.
      array_position(v_target_roles, m.role) as role_rank
    from public.admin_team_members m
    where m.status = 'active'
      and m.role = any(v_target_roles)
      and m.role <> 'viewer'
  ),
  load as (
    select c.id, c.name, c.email, c.role, c.role_rank,
      coalesce((select count(*) from public.admin_tasks t where t.assigned_to = c.id and t.status in ('pending','in_progress','blocked')), 0)
      + coalesce((select count(*) from public.admin_support_tickets s where s.assigned_to = c.id and s.status not in ('resolved','closed')), 0)
      as open_count
    from candidates c
  )
  select l.id, l.name, l.email, l.role, l.open_count
  from load l
  order by l.role_rank asc, l.open_count asc, l.name asc nulls last
  limit 1;
end;
$$;

grant execute on function public.admin_suggest_assignee(text, text, text) to authenticated;
