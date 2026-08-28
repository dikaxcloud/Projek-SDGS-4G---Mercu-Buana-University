-- Fix list_admin_profiles: auth.users.email is varchar(255) on the current GoTrue
-- schema, which no longer matches RETURNS TABLE(... email text ...) — Postgres
-- rejects the query with 42804 ("structure of query does not match function result
-- type"), breaking the Admin & Akses page for every role. Cast explicitly.

create or replace function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
  select p.user_id, u.email::text as email, p.role, p.display_name, p.is_active, p.created_at
  from public.profiles p join auth.users u on u.id = p.user_id
  order by p.created_at desc;
end; $$;

revoke all on function public.list_admin_profiles() from public;
grant execute on function public.list_admin_profiles() to authenticated;
