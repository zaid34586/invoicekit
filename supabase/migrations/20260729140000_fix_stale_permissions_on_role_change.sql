-- Bug-009: changing a member's role from the Team Members page updated the
-- role label correctly, but the member's actual access stayed frozen on
-- their OLD role. Root cause (fixed in supabase/functions/workspace-team):
-- a pure role change never touched workspace_members.permissions, so any
-- member who previously had an explicit permissions array saved (e.g. the
-- owner opened "Permissions" once, even without changing anything) kept
-- that exact old array forever, ignoring every later role change.
--
-- This backfills any already-affected members: if a member has no custom
-- role name (i.e. they were never deliberately given a bespoke permission
-- set) but their saved permissions no longer match their current role's
-- defaults, clear the stale array so they immediately fall back to their
-- current role's correct permissions.
update public.workspace_members
set permissions = null,
    updated_at = now()
where role <> 'owner'
  and permissions is not null
  and (custom_role_name is null or custom_role_name = '')
  and permissions <> public.default_workspace_permissions(role);
