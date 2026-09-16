-- Admin API keys for AI agents & integrations.
--
-- Lets the admin issue scoped API keys to any AI agent / external service.
-- Raw keys are only ever shown once at creation (hashed with SHA-256 at rest).
-- Agents authenticate with "Authorization: Bearer aiag_live_..."; the verify
-- function (callable by anyone holding the key) checks the hash, revoke state
-- and expiry, updates last_used_at, and returns the agent identity — so key
-- issuance, revocation and verification are all handled automatically.

create table if not exists public.admin_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- human label, e.g. "LeadGen Agent"
  agent text not null default 'generic', -- what/which agent uses it
  key_prefix text not null,           -- e.g. 'aiag_live_ab12…' (display only)
  key_hash text not null unique,      -- sha256 hex of the raw key
  scopes text[] not null default '{read}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.admin_api_keys enable row level security;

-- Admin (only) can see the key registry. Raw keys are never stored, so this
-- only exposes name/prefix/timestamps.
drop policy if exists "admin read api keys" on public.admin_api_keys;
create policy "admin read api keys" on public.admin_api_keys
for select to authenticated using (lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com');

-- Admin creates a key. Returns the raw key exactly once.
create or replace function public.create_admin_api_key(p_name text, p_agent text default 'generic', p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_raw text; v_id uuid; v_prefix text;
begin
  if lower(auth.jwt() ->> 'email') <> 'mz7123272@gmail.com' then
    raise exception 'Admin only';
  end if;
  v_raw := 'aiag_live_' || encode(gen_random_bytes(32), 'hex');
  v_prefix := left(v_raw, 17);
  insert into public.admin_api_keys(name, agent, key_prefix, key_hash, scopes, expires_at, created_by)
  values (left(nullif(trim(p_name), ''), 80), left(nullif(trim(p_agent), ''), 60), v_prefix,
          encode(digest(v_raw, 'sha256'), 'hex'), array['read'], p_expires_at, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'api_key', v_raw, 'prefix', v_prefix);
end; $$;
grant execute on function public.create_admin_api_key(text, text, timestamptz) to authenticated;

-- Admin revokes a key (automatic handling — status flips everywhere instantly).
create or replace function public.revoke_admin_api_key(p_id uuid)
returns void language sql security definer set search_path = public as $$
update public.admin_api_keys
set revoked_at = now(), revoked_by = lower(auth.jwt() ->> 'email')
where id = p_id and lower(auth.jwt() ->> 'email') = 'mz7123272@gmail.com';
$$;
grant execute on function public.revoke_admin_api_key(uuid) to authenticated;

-- Any caller holding the raw key can verify it (Bearer token). Updates
-- last_used_at. Returns only identity/validity — never the raw key.
create or replace function public.verify_admin_api_key(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v admin_api_keys%rowtype; v_valid boolean;
begin
  if p_key is null or p_key = '' then
    return jsonb_build_object('valid', false, 'error', 'missing_key');
  end if;
  select * into v from public.admin_api_keys
  where key_hash = encode(digest(p_key, 'sha256'), 'hex');
  if v.id is null then
    return jsonb_build_object('valid', false, 'error', 'invalid_key');
  end if;
  v_valid := v.revoked_at is null and (v.expires_at is null or v.expires_at > now());
  if v_valid then
    update public.admin_api_keys set last_used_at = now() where id = v.id;
  end if;
  return jsonb_build_object(
    'valid', v_valid,
    'error', case when v.revoked_at is not null then 'revoked'
                  when v.expires_at is not null and v.expires_at <= now() then 'expired'
                  else null end,
    'key_id', v.id, 'name', v.name, 'agent', v.agent, 'scopes', v.scopes
  );
end; $$;
grant execute on function public.verify_admin_api_key(text) to authenticated;
