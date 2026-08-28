-- Migration: expose masked-safe email in admin profiles listing for role control.
drop function if exists public.list_admin_profiles();
create function public.list_admin_profiles()
returns table (user_id uuid, email text, role public.app_role, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
  select p.user_id, u.email, p.role, p.display_name, p.is_active, p.created_at
  from public.profiles p join auth.users u on u.id = p.user_id
  order by p.created_at desc;
end; $$;

revoke all on function public.list_admin_profiles() from public;
grant execute on function public.list_admin_profiles() to authenticated;

notify pgrst, 'reload schema';
