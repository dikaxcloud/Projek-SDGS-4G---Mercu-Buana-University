-- Staff read RPCs. Results keep NIK masked and expose only demo-safe identity fields.

create or replace function public.search_citizens(p_query text default '', p_limit integer default 20)
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
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  return query
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code, c.gender, c.birth_date
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.is_active
    and (v_query = '' or c.full_name ilike '%' || v_query || '%' or h.household_number ilike '%' || v_query || '%' or r.code ilike '%' || v_query || '%')
  order by c.full_name
  limit v_limit;
end;
$$;

create or replace function public.get_nakes_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_total_citizens integer;
  v_total_households integer;
  v_today integer;
  v_followups integer;
  v_by_day jsonb;
begin
  if public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  select count(*) into v_total_citizens from public.citizens where is_active;
  select count(*) into v_total_households from public.households;
  select count(*) into v_today from public.health_records where examined_at >= v_today_start;
  select count(*) into v_followups from public.health_records where needs_follow_up and not exists (
    select 1 from public.health_records newer where newer.citizen_id = health_records.citizen_id and newer.examined_at > health_records.examined_at and not newer.needs_follow_up
  );
  select coalesce(jsonb_agg(jsonb_build_object('label', to_char(day, 'DD Mon'), 'total', total) order by day), '[]'::jsonb)
    into v_by_day
  from (
    select date_trunc('day', examined_at)::date as day, count(*)::integer as total
    from public.health_records
    where examined_at >= now() - interval '4 days'
    group by date_trunc('day', examined_at)::date
  ) daily;
  return jsonb_build_object('totalCitizens', v_total_citizens, 'totalHouseholds', v_total_households, 'todayExaminations', v_today, 'followUps', v_followups, 'byDay', v_by_day);
end;
$$;

revoke all on function public.search_citizens(text, integer) from public;
revoke all on function public.get_nakes_summary() from public;
grant execute on function public.search_citizens(text, integer) to authenticated;
grant execute on function public.get_nakes_summary() to authenticated;
