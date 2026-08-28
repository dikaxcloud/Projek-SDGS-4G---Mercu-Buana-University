-- Migration: Real dashboard data for admin, nakes, warga + public landing data.
-- Additive only: new RPCs + extended get_admin_summary. No drops.

-- ============================================================
-- EXTENDED ADMIN SUMMARY
-- ============================================================
create or replace function public.get_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now());
  v_week_ago timestamptz := date_trunc('day', now()) - interval '6 days';
  v_rts jsonb;
  v_recent jsonb;
begin
  perform public.admin_guard();
  select coalesce(jsonb_agg(jsonb_build_object('label', r.code, 'total', coalesce(x.total, 0)) order by r.code), '[]'::jsonb)
    into v_rts
  from public.rts r
  left join (
    select h.rt_id, count(*)::integer as total
    from public.households h
    group by h.rt_id
  ) x on x.rt_id = r.rt_id;

  select coalesce(jsonb_agg(row order by (row->>'examined_at') desc), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
      'health_record_id', hr.health_record_id,
      'citizen_name', c.full_name,
      'summary', coalesce(
        nullif(concat_ws(' · ',
          case when bp.systolic is not null then bp.systolic || '/' || bp.diastolic || ' mmHg' end,
          case when bs.value_mg_dl is not null then bs.value_mg_dl || ' mg/dL' end,
          case when w.weight_kg is not null then w.weight_kg || ' kg' end), ''), 'Pemeriksaan umum'),
      'examined_at', hr.examined_at,
      'examiner', coalesce(hw.full_name, p.display_name, 'Nakes')
    ) row
    from public.health_records hr
    join public.citizens c on c.citizen_id = hr.citizen_id
    left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
    left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
    left join public.weight_records w on w.health_record_id = hr.health_record_id
    left join public.profiles p on p.user_id = hr.examiner_user_id
    left join public.health_workers hw on hw.user_id = hr.examiner_user_id and hw.is_active
    order by hr.examined_at desc
    limit 6
  ) recent_rows;

  return jsonb_build_object(
    'totalCitizens', (select count(*)::integer from public.citizens where is_active),
    'totalHouseholds', (select count(*)::integer from public.households),
    'totalRts', (select count(*)::integer from public.rts),
    'totalHealthWorkers', (select count(*)::integer from public.health_workers where is_active),
    'todayExaminations', (select count(*)::integer from public.health_records where examined_at >= v_today),
    'weekExaminations', (select count(*)::integer from public.health_records where examined_at >= v_week_ago),
    'neverExaminedCitizens', (select count(*)::integer from public.citizens c where c.is_active and not exists (select 1 from public.health_records hr where hr.citizen_id = c.citizen_id)),
    'newCitizensThisWeek', (select count(*)::integer from public.citizens c where c.is_active and c.created_at >= v_week_ago),
    'rtDistribution', v_rts,
    'recentExaminations', v_recent
  );
end;
$$;

-- ============================================================
-- NAKES DASHBOARD (own work numbers)
-- ============================================================
create or replace function public.get_nakes_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today timestamptz := date_trunc('day', now());
  v_recent jsonb;
begin
  if v_uid is null or public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;

  select coalesce(jsonb_agg(row order by (row->>'examined_at') desc), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
      'health_record_id', hr.health_record_id,
      'citizen_id', c.citizen_id,
      'citizen_name', c.full_name,
      'summary', coalesce(
        nullif(concat_ws(' · ',
          case when bp.systolic is not null then bp.systolic || '/' || bp.diastolic || ' mmHg' end,
          case when bs.value_mg_dl is not null then bs.value_mg_dl || ' mg/dL' end,
          case when w.weight_kg is not null then w.weight_kg || ' kg' end,
          case when t.temperature_c is not null then t.temperature_c || ' °C' end), ''), 'Pemeriksaan umum'),
      'examined_at', hr.examined_at,
      'needs_follow_up', hr.needs_follow_up
    ) row
    from public.health_records hr
    join public.citizens c on c.citizen_id = hr.citizen_id
    left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
    left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
    left join public.weight_records w on w.health_record_id = hr.health_record_id
    left join public.temperature_records t on t.health_record_id = hr.health_record_id
    where hr.examiner_user_id = v_uid
    order by hr.examined_at desc
    limit 8
  ) recent_rows;

  return jsonb_build_object(
    'examinerName', coalesce((select full_name from public.health_workers where user_id = v_uid and is_active limit 1), (select display_name from public.profiles where user_id = v_uid), 'Nakes'),
    'myExaminationsToday', (select count(*)::integer from public.health_records where examiner_user_id = v_uid and examined_at >= v_today),
    'myTotalExaminations', (select count(*)::integer from public.health_records where examiner_user_id = v_uid),
    'myCitizensToday', (select count(distinct citizen_id)::integer from public.health_records where examiner_user_id = v_uid and examined_at >= v_today),
    'unexaminedCitizens', (select count(*)::integer from public.citizens c where c.is_active and not exists (select 1 from public.health_records hr where hr.citizen_id = c.citizen_id)),
    'followUps', (select count(*)::integer from public.health_records hr where hr.needs_follow_up and hr.examiner_user_id = v_uid and not exists (select 1 from public.health_records newer where newer.citizen_id = hr.citizen_id and newer.examined_at > hr.examined_at and not newer.needs_follow_up)),
    'recentExaminations', v_recent
  );
end;
$$;

-- ============================================================
-- NAKES: RIWAYAT PEMERIKSAAN SAYA (paginated)
-- ============================================================
create or replace function public.list_my_examinations(p_limit integer default 20, p_offset integer default 0)
returns table (
  health_record_id uuid, citizen_id uuid, citizen_name text, rt_code text,
  systolic integer, diastolic integer, sugar numeric, weight_kg numeric,
  temperature_c numeric, pulse_bpm integer, complaint text, needs_follow_up boolean,
  examined_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_uid is null or public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  return query
  select hr.health_record_id, c.citizen_id, c.full_name, r2.code,
         bp.systolic, bp.diastolic, bs.value_mg_dl, w.weight_kg,
         t.temperature_c, pu.pulse_bpm, hr.complaint, hr.needs_follow_up, hr.examined_at
  from public.health_records hr
  join public.citizens c on c.citizen_id = hr.citizen_id
  join public.households h on h.household_id = c.household_id
  join public.rts r2 on r2.rt_id = h.rt_id
  left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
  left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
  left join public.weight_records w on w.health_record_id = hr.health_record_id
  left join public.temperature_records t on t.health_record_id = hr.health_record_id
  left join public.pulse_records pu on pu.health_record_id = hr.health_record_id
  where hr.examiner_user_id = v_uid
  order by hr.examined_at desc
  limit v_limit offset v_offset;
end; $$;

-- ============================================================
-- EXAMINATION DETAIL (staff) incl. examiner identity
-- ============================================================
create or replace function public.get_examination_detail(p_health_record_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;

  select jsonb_build_object(
    'health_record_id', hr.health_record_id,
    'examined_at', hr.examined_at,
    'complaint', hr.complaint,
    'notes', hr.notes,
    'needs_follow_up', hr.needs_follow_up,
    'reference_note', hr.reference_note,
    'citizen', jsonb_build_object(
      'citizen_id', c.citizen_id,
      'full_name', c.full_name,
      'nik_last4', c.nik_last4,
      'gender', c.gender,
      'birth_date', c.birth_date,
      'rt_code', r2.code,
      'household_number', h.household_number
    ),
    'metrics', jsonb_build_object(
      'systolic', bp.systolic, 'diastolic', bp.diastolic,
      'sugar', bs.value_mg_dl, 'sugar_context', bs.context,
      'weight_kg', w.weight_kg, 'height_cm', w.height_cm,
      'temperature_c', t.temperature_c, 'pulse_bpm', pu.pulse_bpm
    ),
    'examiner_name', coalesce(hw.full_name, p.display_name, 'Nakes'),
    'examiner_role', coalesce(public.current_app_role()::text, ''),
    'created_at', hr.created_at
  )
  into v_result
  from public.health_records hr
  join public.citizens c on c.citizen_id = hr.citizen_id
  join public.households h on h.household_id = c.household_id
  join public.rts r2 on r2.rt_id = h.rt_id
  left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
  left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
  left join public.weight_records w on w.health_record_id = hr.health_record_id
  left join public.temperature_records t on t.health_record_id = hr.health_record_id
  left join public.pulse_records pu on pu.health_record_id = hr.health_record_id
  left join public.profiles p on p.user_id = hr.examiner_user_id
  left join public.health_workers hw on hw.user_id = hr.examiner_user_id and hw.is_active
  where hr.health_record_id = p_health_record_id;

  if v_result is null then
    raise exception using errcode = '22023', message = 'Pemeriksaan tidak ditemukan.';
  end if;
  return v_result;
end; $$;

-- ============================================================
-- WARGA: own history with real examiner names (paginated)
-- ============================================================
create or replace function public.list_my_health_history(p_limit integer default 20, p_offset integer default 0)
returns table (
  health_record_id uuid, examined_at timestamptz, complaint text,
  systolic integer, diastolic integer, sugar numeric, sugar_context text,
  weight_kg numeric, height_cm numeric, temperature_c numeric, pulse_bpm integer,
  examiner_name text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then
    return;
  end if;
  return query
  select hr.health_record_id, hr.examined_at, hr.complaint,
         bp.systolic, bp.diastolic, bs.value_mg_dl, bs.context::text,
         w.weight_kg, w.height_cm, t.temperature_c, pu.pulse_bpm,
         coalesce(hw.full_name, p.display_name, 'Nakes Desa')
  from public.health_records hr
  left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
  left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
  left join public.weight_records w on w.health_record_id = hr.health_record_id
  left join public.temperature_records t on t.health_record_id = hr.health_record_id
  left join public.pulse_records pu on pu.health_record_id = hr.health_record_id
  left join public.profiles p on p.user_id = hr.examiner_user_id
  left join public.health_workers hw on hw.user_id = hr.examiner_user_id and hw.is_active
  where hr.citizen_id = v_citizen
  order by hr.examined_at desc
  limit v_limit offset v_offset;
end; $$;

-- ============================================================
-- PUBLIC LANDING DATA (anon callable, no sensitive fields)
-- ============================================================
create or replace function public.get_public_landing_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_workers jsonb;
  v_articles jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', w.full_name, 'role', w.position, 'specialty', w.specialty, 'is_online', w.is_online
  ) order by w.full_name), '[]'::jsonb)
    into v_workers
  from public.health_workers w where w.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', a.article_id, 'title', a.title, 'slug', a.slug, 'summary', a.summary
  ) order by a.updated_at desc), '[]'::jsonb)
    into v_articles
  from (select * from public.health_articles where is_published order by updated_at desc limit 3) a;

  return jsonb_build_object(
    'stats', jsonb_build_array(
      jsonb_build_object('value', (select count(*)::text from public.rts), 'label', 'RT terlayani'),
      jsonb_build_object('value', (select count(*)::text from public.households), 'label', 'Kepala keluarga'),
      jsonb_build_object('value', (select count(*)::text from public.citizens where is_active), 'label', 'Warga terdata'),
      jsonb_build_object('value', (select count(*)::text from public.health_workers where is_active), 'label', 'Tenaga kesehatan')
    ),
    'workers', v_workers,
    'articles', v_articles
  );
end; $$;

-- ============================================================
-- Grants
-- ============================================================
revoke all on function public.get_admin_summary() from public;
revoke all on function public.get_nakes_dashboard() from public;
revoke all on function public.list_my_examinations(integer, integer) from public;
revoke all on function public.get_examination_detail(uuid) from public;
revoke all on function public.list_my_health_history(integer, integer) from public;
revoke all on function public.get_public_landing_data() from public;

grant execute on function public.get_admin_summary() to authenticated;
grant execute on function public.get_nakes_dashboard() to authenticated;
grant execute on function public.list_my_examinations(integer, integer) to authenticated;
grant execute on function public.get_examination_detail(uuid) to authenticated;
grant execute on function public.list_my_health_history(integer, integer) to authenticated;
grant execute on function public.get_public_landing_data() to anon, authenticated;
