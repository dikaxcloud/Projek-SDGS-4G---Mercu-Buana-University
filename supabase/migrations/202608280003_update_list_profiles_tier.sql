-- Extend list_admin_profiles to include admin_tier for hierarchy
drop function if exists public.list_admin_profiles();
create function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, admin_tier smallint, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
  select p.user_id, u.email::text, p.role, p.admin_tier, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  order by p.created_at desc;
end; $$;
revoke all on function public.list_admin_profiles() from public;
grant execute on function public.list_admin_profiles() to authenticated;
