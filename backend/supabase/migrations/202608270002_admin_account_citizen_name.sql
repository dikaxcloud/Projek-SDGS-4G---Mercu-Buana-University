create or replace function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
  select p.user_id, u.email::text, p.role, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  order by p.created_at desc;
end; $$;

update public.profiles p
set display_name = c.full_name, updated_at = now()
from public.linked_accounts la
join public.citizens c on c.citizen_id = la.citizen_id
where la.user_id = p.user_id
  and nullif(btrim(c.full_name), '') is not null
  and p.display_name is distinct from c.full_name;
