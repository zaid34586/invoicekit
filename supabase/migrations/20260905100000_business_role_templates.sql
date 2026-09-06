-- Business-plan team differentiation:
--
-- 1) Invitations can now carry custom permissions/custom_role_name at
--    invite time (previously you could only set these AFTER someone
--    accepted, via the "update" action -- a Business-plan customer had to
--    invite with a generic role, then go edit permissions separately).
-- 2) workspace_role_templates lets a Business-plan owner save a named,
--    reusable permission set ("Sales Lead", "Junior Accountant"...) once
--    and reuse it for every future invite with one click, instead of
--    re-checking the same boxes for every new hire. This is the concrete
--    "why pay for Business over Pro" feature beyond just seat count.

ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS custom_role_name text;

-- claim_workspace_invitation() creates/updates the workspace_member row when
-- someone accepts -- it needs to carry the two new fields across too,
-- otherwise a Business invite's custom permissions would be silently lost
-- the moment the invite is accepted.
create or replace function public.claim_workspace_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_inv public.workspace_invitations%rowtype;
  v_owner uuid;
begin
  select lower(email) into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null then
    return jsonb_build_object('claimed', false);
  end if;

  update public.workspace_invitations
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();

  select * into v_inv
  from public.workspace_invitations
  where lower(email) = v_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_inv.id is null then
    return jsonb_build_object('claimed', false);
  end if;

  select owner_user_id into v_owner
  from public.workspaces
  where id = v_inv.workspace_id;

  if exists (
    select 1 from public.workspace_members
    where workspace_owner_id = v_owner and lower(email) = v_email
  ) then
    update public.workspace_members
    set workspace_id = v_inv.workspace_id,
        user_id = auth.uid(),
        auth_user_id = auth.uid(),
        name = v_inv.name,
        role = v_inv.role,
        permissions = v_inv.permissions,
        custom_role_name = v_inv.custom_role_name,
        status = 'active',
        accepted_at = coalesce(accepted_at, now()),
        joined_at = coalesce(joined_at, now()),
        updated_at = now()
    where workspace_owner_id = v_owner and lower(email) = v_email;
  else
    insert into public.workspace_members(
      workspace_owner_id, auth_user_id, workspace_id, user_id,
      email, name, role, permissions, custom_role_name, status, invited_by,
      invited_at, accepted_at, expires_at, last_invited_at,
      joined_at, created_at, updated_at
    ) values (
      v_owner, auth.uid(), v_inv.workspace_id, auth.uid(),
      v_email, v_inv.name, v_inv.role, v_inv.permissions, v_inv.custom_role_name, 'active', v_inv.invited_by,
      v_inv.created_at, now(), v_inv.expires_at, v_inv.created_at,
      now(), now(), now()
    );
  end if;

  update public.workspace_invitations
  set status = 'accepted', updated_at = now()
  where id = v_inv.id;

  return jsonb_build_object(
    'claimed', true,
    'workspace_id', v_inv.workspace_id,
    'role', v_inv.role
  );
end;
$$;

-- 3) Reusable named permission sets, Business-plan only (enforced in the
-- workspace-team edge function, same place plan gating already happens).
create table if not exists public.workspace_role_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists workspace_role_templates_workspace_id_idx
  on public.workspace_role_templates(workspace_id);

alter table public.workspace_role_templates enable row level security;

drop policy if exists "owner manages role templates" on public.workspace_role_templates;
create policy "owner manages role templates" on public.workspace_role_templates for all to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = workspace_role_templates.workspace_id and w.owner_user_id = auth.uid())
)
with check (
  exists (select 1 from public.workspaces w where w.id = workspace_role_templates.workspace_id and w.owner_user_id = auth.uid())
);
