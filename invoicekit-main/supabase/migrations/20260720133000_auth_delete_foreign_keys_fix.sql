-- Business features must never block deletion of an Auth identity.
-- Preserve historical actor fields as NULL when the user is removed.

alter table if exists public.workspace_branding
  drop constraint if exists workspace_branding_updated_by_fkey;
alter table if exists public.workspace_branding
  add constraint workspace_branding_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table if exists public.workspace_api_keys
  drop constraint if exists workspace_api_keys_created_by_fkey;
alter table if exists public.workspace_api_keys
  add constraint workspace_api_keys_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table if exists public.workspace_audit_logs
  drop constraint if exists workspace_audit_logs_actor_user_id_fkey;
alter table if exists public.workspace_audit_logs
  add constraint workspace_audit_logs_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;
