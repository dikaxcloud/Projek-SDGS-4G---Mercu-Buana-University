-- Opaque citizen lookup for staff detail screens.
create or replace function public.get_citizen_by_id(p_citizen_id uuid)
returns table (
  citizen_id uuid,
  full_name text,
  nik_last4 text,
  household_number text,
  rt_code text,
  gender text,
  birth_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  return query
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code, c.gender, c.birth_date
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = p_citizen_id and c.is_active;
end;
$$;

revoke all on function public.get_citizen_by_id(uuid) from public;
grant execute on function public.get_citizen_by_id(uuid) to authenticated;
