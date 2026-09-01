-- Keep public customer data consistent when an Auth user is deleted from
-- either Rivox or the Supabase dashboard.
create or replace function public.cleanup_deleted_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists cleanup_public_profile_after_auth_delete on auth.users;
create trigger cleanup_public_profile_after_auth_delete
after delete on auth.users
for each row execute function public.cleanup_deleted_auth_user();

revoke all on function public.cleanup_deleted_auth_user() from public, anon, authenticated;
