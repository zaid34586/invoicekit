create extension if not exists pgcrypto;

alter table public.workspace_members
  add column if not exists permissions jsonb,
  add column if not exists custom_role_name text;

create or replace function public.default_workspace_permissions(p_role text)
returns jsonb language sql immutable as $$
  select case p_role
    when 'owner' then '["*"]'::jsonb
    when 'manager' then '["dashboard.view","clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","invoices.delete","reports.view","support.view"]'::jsonb
    when 'accountant' then '["clients.view","invoices.view","reports.view","support.view"]'::jsonb
    when 'staff' then '["clients.view","clients.manage","invoices.view","invoices.create","invoices.edit","support.view"]'::jsonb
    else '[]'::jsonb end;
$$;

create or replace function public.has_workspace_permission(p_permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_role text; v_permissions jsonb;
begin
  if exists(select 1 from public.workspaces where owner_user_id=auth.uid()) then return true; end if;
  select role, coalesce(permissions, public.default_workspace_permissions(role)) into v_role,v_permissions
  from public.workspace_members where coalesce(user_id,auth_user_id)=auth.uid() and status='active' order by created_at desc limit 1;
  return coalesce(v_permissions ? '*' or v_permissions ? p_permission,false);
end; $$;
grant execute on function public.has_workspace_permission(text) to authenticated;

create or replace function public.get_my_workspace_context()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_member public.workspace_members%rowtype; v_workspace public.workspaces%rowtype; v_profile public.profiles%rowtype; v_invited boolean:=false;
begin
  if not exists(select 1 from auth.users where id=auth.uid()) then return jsonb_build_object('owner_user_id',null,'workspace_name',null,'role',null,'status','removed','permissions','[]'::jsonb,'owner_profile',null); end if;
  select * into v_member from public.workspace_members where coalesce(user_id,auth_user_id)=auth.uid() order by created_at desc limit 1;
  if v_member.id is not null then
    select * into v_workspace from public.workspaces where id=v_member.workspace_id;
    select * into v_profile from public.profiles where user_id=v_workspace.owner_user_id limit 1;
    return jsonb_build_object('owner_user_id',v_workspace.owner_user_id,'workspace_name',v_workspace.name,'role',v_member.role,'custom_role_name',v_member.custom_role_name,'status',v_member.status,'permissions',coalesce(v_member.permissions,public.default_workspace_permissions(v_member.role)),'owner_profile',to_jsonb(v_profile));
  end if;
  select coalesce((raw_user_meta_data->>'workspace_invitation_id') is not null,false) into v_invited from auth.users where id=auth.uid();
  if v_invited then return jsonb_build_object('owner_user_id',null,'workspace_name',null,'role',null,'status','removed','permissions','[]'::jsonb,'owner_profile',null); end if;
  select * into v_workspace from public.workspaces where owner_user_id=auth.uid() limit 1;
  select * into v_profile from public.profiles where user_id=auth.uid() limit 1;
  return jsonb_build_object('owner_user_id',auth.uid(),'workspace_name',coalesce(v_workspace.name,v_profile.business_name,'My Workspace'),'role','owner','status','active','permissions','["*"]'::jsonb,'owner_profile',to_jsonb(v_profile));
end; $$;
grant execute on function public.get_my_workspace_context() to authenticated;

create table if not exists public.workspace_branding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  logo_url text, brand_color text not null default '#4f46e5', accent_color text not null default '#7c3aed',
  pdf_template text not null default 'modern' check(pdf_template in ('modern','classic','minimal')),
  invoice_theme text not null default 'light' check(invoice_theme in ('light','bold','elegant')),
  email_logo_url text, email_footer text, remove_rivox_branding boolean not null default true,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
alter table public.workspace_branding enable row level security;
create policy "workspace branding read" on public.workspace_branding for select to authenticated using(public.is_workspace_owner(workspace_id) or public.is_workspace_member(workspace_id));
create policy "workspace branding owner write" on public.workspace_branding for all to authenticated using(public.is_workspace_owner(workspace_id)) with check(public.is_workspace_owner(workspace_id));

create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, key_prefix text not null, key_hash text not null unique, last_used_at timestamptz,
  revoked_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.workspace_api_keys enable row level security;
create policy "workspace api keys owner" on public.workspace_api_keys for select to authenticated using(public.is_workspace_owner(workspace_id));

create table if not exists public.workspace_api_rate_limits (
  api_key_id uuid not null references public.workspace_api_keys(id) on delete cascade, window_start timestamptz not null,
  request_count integer not null default 1, primary key(api_key_id,window_start)
);
alter table public.workspace_api_rate_limits enable row level security;

create or replace function public.create_workspace_api_key(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_plan text; v_raw text; v_id uuid;
begin
  select w.id,coalesce(p.plan,case when p.is_pro then 'pro' else 'free' end) into v_workspace,v_plan from public.workspaces w join public.profiles p on p.user_id=w.owner_user_id where w.owner_user_id=auth.uid();
  if v_workspace is null or v_plan<>'business' then raise exception 'Business plan required'; end if;
  v_raw:='rvx_live_'||encode(gen_random_bytes(32),'hex');
  insert into public.workspace_api_keys(workspace_id,name,key_prefix,key_hash,created_by) values(v_workspace,left(trim(p_name),80),left(v_raw,17),encode(digest(v_raw,'sha256'),'hex'),auth.uid()) returning id into v_id;
  return jsonb_build_object('id',v_id,'api_key',v_raw,'prefix',left(v_raw,17));
end; $$;
grant execute on function public.create_workspace_api_key(text) to authenticated;

create or replace function public.revoke_workspace_api_key(p_id uuid)
returns void language sql security definer set search_path=public as $$ update public.workspace_api_keys k set revoked_at=now() where k.id=p_id and public.is_workspace_owner(k.workspace_id); $$;
grant execute on function public.revoke_workspace_api_key(uuid) to authenticated;

create table if not exists public.workspace_webhooks (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 url text not null check(url ~ '^https://'), events text[] not null, signing_secret text not null,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.workspace_webhooks enable row level security;
create policy "workspace webhook owner" on public.workspace_webhooks for all to authenticated using(public.is_workspace_owner(workspace_id)) with check(public.is_workspace_owner(workspace_id));

create table if not exists public.workspace_webhook_deliveries (
 id uuid primary key default gen_random_uuid(), webhook_id uuid not null references public.workspace_webhooks(id) on delete cascade,
 event_type text not null, payload jsonb not null, status text not null default 'pending' check(status in ('pending','delivered','failed')),
 attempts integer not null default 0, response_status integer, response_body text, next_retry_at timestamptz not null default now(), delivered_at timestamptz, created_at timestamptz not null default now()
);
alter table public.workspace_webhook_deliveries enable row level security;
create policy "webhook deliveries owner read" on public.workspace_webhook_deliveries for select to authenticated using(exists(select 1 from public.workspace_webhooks w where w.id=webhook_id and public.is_workspace_owner(w.workspace_id)));

create table if not exists public.workspace_audit_logs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_user_id uuid references auth.users(id), actor_email text, action text not null, entity_type text, entity_id text,
 metadata jsonb not null default '{}'::jsonb, ip_address text, created_at timestamptz not null default now()
);
alter table public.workspace_audit_logs enable row level security;
create policy "workspace audit owner read" on public.workspace_audit_logs for select to authenticated using(public.is_workspace_owner(workspace_id));
create index if not exists workspace_audit_filter_idx on public.workspace_audit_logs(workspace_id,action,created_at desc);

create or replace function public.log_workspace_event(p_action text,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_owner uuid;
begin
 v_owner:=public.current_workspace_owner_id(); select id into v_workspace from public.workspaces where owner_user_id=v_owner;
 if v_workspace is not null and p_action in ('login','settings.changed') then insert into public.workspace_audit_logs(workspace_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata) values(v_workspace,auth.uid(),auth.jwt()->>'email',p_action,'workspace',v_workspace::text,coalesce(p_metadata,'{}'::jsonb)); end if;
end; $$;
grant execute on function public.log_workspace_event(text,jsonb) to authenticated;

create or replace function public.business_event_trigger() returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_workspace uuid; v_event text; v_entity text; v_payload jsonb; v_data jsonb;
begin
  if tg_op='DELETE' then v_owner:=old.user_id; v_data:=to_jsonb(old); else v_owner:=new.user_id; v_data:=to_jsonb(new); end if;
  select id into v_workspace from public.workspaces where owner_user_id=v_owner;
  if v_workspace is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_entity:=tg_table_name; v_event:=case when tg_table_name='invoices' and tg_op='INSERT' then 'invoice.created' when tg_table_name='invoices' and tg_op='UPDATE' and new.status='paid' and old.status is distinct from new.status then 'invoice.paid' when tg_table_name='invoices' and tg_op='UPDATE' and new.status='overdue' and old.status is distinct from new.status then 'invoice.overdue' when tg_table_name='invoices' and tg_op='UPDATE' then 'invoice.updated' when tg_table_name='clients' and tg_op='INSERT' then 'customer.created' else 'customer.updated' end;
  v_payload:=jsonb_build_object('event',v_event,'workspace_id',v_workspace,'data',v_data,'created_at',now());
  insert into public.workspace_webhook_deliveries(webhook_id,event_type,payload) select id,v_event,v_payload from public.workspace_webhooks where workspace_id=v_workspace and active and v_event=any(events);
  if tg_op='UPDATE' then insert into public.workspace_audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id,metadata) values(v_workspace,auth.uid(),case when tg_table_name='invoices' then 'invoice.edited' else 'customer.updated' end,tg_table_name,coalesce(new.id,old.id)::text,'{}'); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists business_invoice_events on public.invoices; create trigger business_invoice_events after insert or update on public.invoices for each row execute function public.business_event_trigger();
drop trigger if exists business_client_events on public.clients; create trigger business_client_events after insert or update on public.clients for each row execute function public.business_event_trigger();

-- Replace broad legacy member policies with permission-aware database enforcement.
do $$ declare t text;
begin
  foreach t in array array['clients','invoices'] loop
    execute format('drop policy if exists "workspace members select %1$s" on public.%1$I',t);
    execute format('drop policy if exists "workspace members insert %1$s" on public.%1$I',t);
    execute format('drop policy if exists "workspace members update %1$s" on public.%1$I',t);
    execute format('drop policy if exists "workspace members delete %1$s" on public.%1$I',t);
  end loop;
end $$;
create policy "permission members select clients" on public.clients for select to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('clients.view'));
create policy "permission members insert clients" on public.clients for insert to authenticated with check(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('clients.manage'));
create policy "permission members update clients" on public.clients for update to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('clients.manage')) with check(user_id=public.current_workspace_owner_id());
create policy "permission members delete clients" on public.clients for delete to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('clients.manage'));
create policy "permission members select invoices" on public.invoices for select to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('invoices.view'));
create policy "permission members insert invoices" on public.invoices for insert to authenticated with check(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('invoices.create'));
create policy "permission members update invoices" on public.invoices for update to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('invoices.edit')) with check(user_id=public.current_workspace_owner_id());
create policy "permission members delete invoices" on public.invoices for delete to authenticated using(user_id=public.current_workspace_owner_id() and public.has_workspace_permission('invoices.delete'));

create or replace function public.business_subscription_event() returns trigger language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_payload jsonb;
begin
 if old.plan is distinct from new.plan or old.subscription_status is distinct from new.subscription_status then
  select id into v_workspace from public.workspaces where owner_user_id=new.user_id;
  if v_workspace is not null then
   v_payload:=jsonb_build_object('event','subscription.updated','workspace_id',v_workspace,'data',jsonb_build_object('plan',new.plan,'subscription_status',new.subscription_status,'plan_expires_at',new.plan_expires_at),'created_at',now());
   insert into public.workspace_webhook_deliveries(webhook_id,event_type,payload) select id,'subscription.updated',v_payload from public.workspace_webhooks where workspace_id=v_workspace and active and 'subscription.updated'=any(events);
   insert into public.workspace_audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id,metadata) values(v_workspace,auth.uid(),'billing.updated','profile',new.user_id::text,jsonb_build_object('plan',new.plan,'status',new.subscription_status));
  end if;
 end if; return new;
end; $$;
drop trigger if exists business_subscription_events on public.profiles;
create trigger business_subscription_events after update of plan,subscription_status on public.profiles for each row execute function public.business_subscription_event();
