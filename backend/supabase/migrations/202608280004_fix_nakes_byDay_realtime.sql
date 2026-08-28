-- Fix byDay to be realtime 5 days with Indonesian labels and zero-filled
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
  -- Realtime 5 days: always 5 entries, zero-filled, label like "Jumat, 29 Agu"
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'total', total, 'day', day) order by day), '[]'::jsonb)
    into v_by_day
  from (
    select
      g.day::date as day,
      case extract(dow from g.day)
        when 0 then 'Minggu'
        when 1 then 'Senin'
        when 2 then 'Selasa'
        when 3 then 'Rabu'
        when 4 then 'Kamis'
        when 5 then 'Jumat'
        when 6 then 'Sabtu'
      end
      || ', ' ||
      to_char(g.day, 'DD')
      || ' ' ||
      case extract(month from g.day)
        when 1 then 'Jan'
        when 2 then 'Feb'
        when 3 then 'Mar'
        when 4 then 'Apr'
        when 5 then 'Mei'
        when 6 then 'Jun'
        when 7 then 'Jul'
        when 8 then 'Agu'
        when 9 then 'Sep'
        when 10 then 'Okt'
        when 11 then 'Nov'
        when 12 then 'Des'
      end as label,
      coalesce(d.total, 0)::integer as total
    from generate_series(
      (date_trunc('day', now())::date - interval '4 days')::date,
      date_trunc('day', now())::date,
      interval '1 day'
    ) g(day)
    left join (
      select date_trunc('day', examined_at)::date as day, count(*)::integer as total
      from public.health_records
      where examined_at >= date_trunc('day', now()) - interval '4 days'
      group by date_trunc('day', examined_at)::date
    ) d on d.day = g.day::date
  ) s;

  return jsonb_build_object('totalCitizens', v_total_citizens, 'totalHouseholds', v_total_households, 'todayExaminations', v_today, 'followUps', v_followups, 'byDay', v_by_day);
end;
$$;

revoke all on function public.get_nakes_summary() from public;
grant execute on function public.get_nakes_summary() to authenticated;
