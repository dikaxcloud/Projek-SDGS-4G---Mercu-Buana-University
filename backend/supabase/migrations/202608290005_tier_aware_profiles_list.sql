-- Tier-aware profiles listing: Tier2 (Senior) cannot see Developer (Tier1), Tier3 (Junior) cannot see Tier1/2
drop function if exists public.list_admin_profiles();
create function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, admin_tier smallint, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_caller_tier smallint;
begin
  perform public.admin_guard();
  v_caller_tier := public.current_admin_tier();
  return query
  select p.user_id, u.email::text, p.role, p.admin_tier, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where
    -- Tier-aware visibility
    (v_caller_tier = 1) -- Owner sees all
    or (v_caller_tier = 2 and coalesce(p.admin_tier, 3) <> 1 and p.user_id not in (select user_id from public.app_owners)) -- Senior sees all except Owner
    or (v_caller_tier = 3 and coalesce(p.admin_tier, 3) in (3) and p.role in ('admin','nakes','warga') and p.user_id not in (select user_id from public.app_owners) and coalesce(p.admin_tier, 3) not in (1,2)) -- Junior sees only Tier3,4,5
    or (v_caller_tier in (4,5) and false) -- Nakes/Warga shouldn't call this (admin_guard already blocks), but just in case
    -- Actually for simplicity: if caller is Senior, exclude Tier1; if Junior, exclude Tier1,2
    -- The above where is complex, simplify to:
    -- Use logic: if caller 1 -> all, caller 2 -> tier !=1, caller 3 -> tier in (3,4,5)
    -- But we need to handle nakes/warga tier mapping
  order by p.created_at desc;
end;
$$;

-- Simpler version override with correct logic
drop function if exists public.list_admin_profiles();
create function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, admin_tier smallint, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_caller_tier smallint;
begin
  perform public.admin_guard();
  v_caller_tier := public.current_admin_tier();
  return query
  select p.user_id, u.email::text, p.role, p.admin_tier, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where
    case
      when v_caller_tier = 1 then true
      when v_caller_tier = 2 then coalesce(p.admin_tier, case when p.role='admin' then 3 when p.role='nakes' then 4 else 5 end) <> 1
      when v_caller_tier = 3 then coalesce(p.admin_tier, case when p.role='admin' then 3 when p.role='nakes' then 4 else 5 end) in (3,4,5)
      else false
    end
  order by p.created_at desc;
end; $$;

revoke all on function public.list_admin_profiles() from public;
grant execute on function public.list_admin_profiles() to authenticated;
