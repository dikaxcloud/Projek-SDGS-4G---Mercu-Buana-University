-- ============================================================================
-- RESTRUKTURISASI ROLE: 5 role -> 4 role
--
-- SEBELUMNYA: app_role = ('warga','nakes','admin') + kolom profiles.admin_tier
--            tier 1 = Owner/Developer, tier 2 = Kepala Desa (Senior Admin),
--            tier 3 = RT/RW (Junior Admin)
-- SESUDAHNYA: app_role = ('developer','rt_rw','nakes','warga')
--
-- Petunjuk: 'admin_1', 'admin_2', 'admin_3' tidak pernah ada sebagai nilai enum.
-- Yang ada adalah role='admin' + admin_tier. Mapping:
--   admin + tier 1 (atau pemilik di app_owners/bootstrap_admins) -> developer
--   admin + tier 2 atau 3                                     -> rt_rw
--   nakes                                                     -> nakes
--   warga                                                     -> warga
--
-- Tidak ada akun yang dihapus dan tidak ada akun duplikat: hanya nilai
-- enum role yang dipetakan ulang. Data akun tetap utuh.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lepaskan policy yang memanggil current_app_role() (ketergantungan tipe)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles own or staff read" on public.profiles;
drop policy if exists "public reads published articles" on public.health_articles;
drop policy if exists "staff reads workers" on public.health_workers;
drop policy if exists "nakes own update" on public.health_workers;
drop policy if exists "citizen own or staff read" on public.citizens;
drop policy if exists "linked account own read" on public.linked_accounts;
drop policy if exists "admin reads link token metadata" on public.account_link_tokens;
drop policy if exists "health own or staff read" on public.health_records;
drop policy if exists "health staff insert" on public.health_records;
drop policy if exists "health staff update" on public.health_records;
drop policy if exists "health details own or staff read" on public.blood_pressure_records;
drop policy if exists "health details staff write" on public.blood_pressure_records;
drop policy if exists "sugar details owner or staff" on public.blood_sugar_records;
drop policy if exists "sugar details staff" on public.blood_sugar_records;
drop policy if exists "sugar details staff write" on public.blood_sugar_records;
drop policy if exists "weight details staff" on public.weight_records;
drop policy if exists "weight details owner or staff" on public.weight_records;
drop policy if exists "temperature details staff" on public.temperature_records;
drop policy if exists "temperature details owner or staff" on public.temperature_records;
drop policy if exists "pulse details staff" on public.pulse_records;
drop policy if exists "pulse details owner or staff" on public.pulse_records;
drop policy if exists "ai_analyses_own_or_staff_read" on public.ai_health_analyses;
drop policy if exists "citizen qr own or staff read" on public.citizen_qr_codes;
drop policy if exists "audit admin read" on public.audit_logs;

-- ---------------------------------------------------------------------------
-- 2. Lepaskan fungsi yang memakai app_role / admin_tier pada signature-nya
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_access();
drop function if exists public.list_admin_profiles();
drop function if exists public.current_app_role();
drop function if exists public.current_admin_tier();
drop function if exists public.target_admin_tier(uuid);
drop function if exists public.admin_set_admin_tier(uuid, smallint);

-- ---------------------------------------------------------------------------
-- 3. Ganti enum + petakan data role lama ke role baru
-- ---------------------------------------------------------------------------
create type public.app_role_new as enum ('developer', 'rt_rw', 'nakes', 'warga');

drop trigger if exists on_profiles_role_change on public.profiles;

alter table public.profiles alter column role drop default;

alter table public.profiles
  alter column role type public.app_role_new
  using (
    case
      when role::text = 'admin' then
        case when admin_tier = 1 then 'developer'::public.app_role_new else 'rt_rw'::public.app_role_new end
      else role::text::public.app_role_new
    end
  );

alter table public.profiles alter column role set default 'warga';

drop type public.app_role;
alter type public.app_role_new rename to app_role;

-- 3b. Kolom tier sudah tidak bermakna: satu role = satu tingkat akses
alter table public.profiles drop constraint if exists admin_tier_valid;
alter table public.profiles drop column if exists admin_tier;

-- Kembalikan trigger sinkronisasi direktori nakes (role baru sudah final).
drop trigger if exists on_profiles_role_change on public.profiles;
create trigger on_profiles_role_change
  after insert or update of role on public.profiles
  for each row execute function public.sync_nakes_directory();

-- Jaring pengaman: pemilik sistem lama ikut menjadi developer
update public.profiles p
set role = 'developer'
where p.role = 'rt_rw'
  and (
    exists (select 1 from public.app_owners o where o.user_id = p.user_id)
    or exists (
      select 1 from public.bootstrap_admins b
      join auth.users u on u.id = p.user_id
      where lower(b.email) = lower(u.email)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Resolver role + guard (authorization level, bukan hanya UI)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns app_role
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where user_id = auth.uid() and is_active = true limit 1),
    'warga'::app_role
  )
$$;

-- Guard umum untuk RPC administratif (warga, KK, RT, nakes, artikel, kontak).
-- Nakes tetap setara seperti sebelumnya (role parity).
create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('developer', 'rt_rw', 'nakes') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
end;
$$;

-- Guard sensitif: hanya Developer (ubah role, hapus akun, dll).
create or replace function public.admin_only_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'developer' then
    raise exception using errcode = '42501', message = 'Hanya Developer yang dapat melakukan aksi ini.';
  end if;
end;
$$;

-- Guard petugas lapangan (nakes + admin wilayah).
create or replace function public.staff_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
end;
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.admin_guard() from public;
revoke all on function public.admin_only_guard() from public;
revoke all on function public.staff_guard() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.admin_guard() to authenticated;
grant execute on function public.admin_only_guard() to authenticated;
grant execute on function public.staff_guard() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_my_access(): tanpa admin_tier
-- ---------------------------------------------------------------------------
create function public.get_my_access()
returns table (
  user_id uuid,
  role public.app_role,
  display_name text,
  citizen_id uuid,
  nik_last4 text,
  email_verified boolean
)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.role, p.display_name, la.citizen_id, c.nik_last4, coalesce(p.email_verified, false)
  from public.profiles p
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where p.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;
revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. handle_new_user(): terima role baru dari metadata undangan
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_meta_role text;
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'warga', nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (user_id) do nothing;

  v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  -- Developer tidak diundang lewat undangan biasa (lihat Edge Function).
  if v_meta_role in ('rt_rw', 'nakes', 'warga') then
    update public.profiles set role = v_meta_role::public.app_role, updated_at = now()
    where user_id = new.id and role = 'warga';
  end if;

  -- Jaring pengaman: email pemilik sistem selalu Developer.
  select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email)) into v_is_owner;
  if not v_is_owner then
    select exists (select 1 from public.app_owners where user_id = new.id) into v_is_owner;
  end if;
  if v_is_owner then
    update public.profiles set role = 'developer', updated_at = now() where user_id = new.id;
    insert into public.app_owners (user_id) values (new.id) on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Guard inline pada RPC yang menyebut role lama
-- ---------------------------------------------------------------------------
create or replace function public.search_citizens(p_query text default '', p_limit integer default 20)
returns table (
  citizen_id uuid, full_name text, nik_last4 text, household_number text,
  rt_code text, gender text, birth_date date
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
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

create or replace function public.get_citizen_by_id(p_citizen_id uuid)
returns table (
  citizen_id uuid, full_name text, nik_last4 text, household_number text,
  rt_code text, gender text, birth_date date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
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

create or replace function public.get_nakes_summary()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_total_citizens integer;
  v_total_households integer;
  v_today integer;
  v_followups integer;
  v_by_day jsonb;
begin
  if public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  select count(*) into v_total_citizens from public.citizens where is_active;
  select count(*) into v_total_households from public.households;
  select count(*) into v_today from public.health_records where examined_at >= v_today_start;
  select count(*) into v_followups from public.health_records where needs_follow_up and not exists (
    select 1 from public.health_records newer where newer.citizen_id = health_records.citizen_id and newer.examined_at > health_records.examined_at and not newer.needs_follow_up
  );
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'total', total, 'day', day) order by day), '[]'::jsonb)
    into v_by_day
  from (
    select
      g.day::date as day,
      case extract(dow from g.day)
        when 0 then 'Minggu' when 1 then 'Senin' when 2 then 'Selasa' when 3 then 'Rabu'
        when 4 then 'Kamis' when 5 then 'Jumat' when 6 then 'Sabtu'
      end || ', ' || to_char(g.day, 'DD') ||
      case extract(month from g.day)
        when 1 then 'Jan' when 2 then 'Feb' when 3 then 'Mar' when 4 then 'Apr'
        when 5 then 'Mei' when 6 then 'Jun' when 7 then 'Jul' when 8 then 'Agu'
        when 9 then 'Sep' when 10 then 'Okt' when 11 then 'Nov' when 12 then 'Des'
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

create or replace function public.get_nakes_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today timestamptz := date_trunc('day', now());
  v_recent jsonb;
begin
  if v_uid is null or public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  select coalesce(jsonb_agg(row order by (row->>'examined_at') desc), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
      'health_record_id', hr.health_record_id, 'citizen_id', c.citizen_id,
      'citizen_name', c.full_name,
      'summary', coalesce(
        nullif(concat_ws(' · ',
          case when bp.systolic is not null then bp.systolic || '/' || bp.diastolic || ' mmHg' end,
          case when bs.value_mg_dl is not null then bs.value_mg_dl || ' mg/dL' end,
          case when w.weight_kg is not null then w.weight_kg || ' kg' end,
          case when t.temperature_c is not null then t.temperature_c || ' °C' end), ''), 'Pemeriksaan umum'),
      'examined_at', hr.examined_at, 'needs_follow_up', hr.needs_follow_up
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
  if v_uid is null or public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
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

create or replace function public.get_examination_detail(p_health_record_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.current_app_role() not in ('nakes', 'developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  select jsonb_build_object(
    'health_record_id', hr.health_record_id, 'examined_at', hr.examined_at,
    'complaint', hr.complaint, 'notes', hr.notes,
    'needs_follow_up', hr.needs_follow_up, 'reference_note', hr.reference_note,
    'citizen', jsonb_build_object(
      'citizen_id', c.citizen_id, 'full_name', c.full_name, 'nik_last4', c.nik_last4,
      'gender', c.gender, 'birth_date', c.birth_date, 'rt_code', r2.code, 'household_number', h.household_number
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
  ) into v_result
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

create or replace function public.create_health_record(
  p_citizen_id uuid,
  p_examined_at timestamptz default now(),
  p_complaint text default null,
  p_notes text default null,
  p_needs_follow_up boolean default false,
  p_reference_note text default null,
  p_idempotency_key uuid default gen_random_uuid(),
  p_blood_pressure jsonb default null,
  p_blood_sugar jsonb default null,
  p_weight jsonb default null,
  p_temperature_c numeric default null,
  p_pulse_bpm integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role := public.current_app_role();
  v_record_id uuid;
  v_linked_user uuid;
  v_systolic integer;
  v_diastolic integer;
  v_sugar numeric;
  v_weight numeric;
  v_height numeric;
  v_context public.blood_sugar_context;
begin
  if v_role not in ('nakes', 'developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Hanya petugas berwenang yang dapat menyimpan pemeriksaan.';
  end if;
  if not exists (select 1 from public.citizens where citizen_id = p_citizen_id and is_active) then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if exists (select 1 from public.health_records where idempotency_key = p_idempotency_key) then
    select health_record_id into v_record_id from public.health_records where idempotency_key = p_idempotency_key;
    return jsonb_build_object('status', 'already_saved', 'health_record_id', v_record_id);
  end if;

  if p_blood_pressure is not null then
    v_systolic := (p_blood_pressure ->> 'systolic')::integer;
    v_diastolic := (p_blood_pressure ->> 'diastolic')::integer;
    if v_systolic not between 40 and 300 or v_diastolic not between 20 and 200 then
      raise exception using errcode = '22023', message = 'Nilai tekanan darah tidak valid.';
    end if;
  end if;
  if p_blood_sugar is not null then
    v_sugar := (p_blood_sugar ->> 'value_mg_dl')::numeric;
    v_context := (p_blood_sugar ->> 'context')::public.blood_sugar_context;
    if v_sugar not between 1 and 2000 then raise exception using errcode = '22023', message = 'Nilai gula darah tidak valid.'; end if;
  end if;
  if p_weight is not null then
    v_weight := (p_weight ->> 'weight_kg')::numeric;
    v_height := nullif((p_weight ->> 'height_cm')::numeric, 0);
    if v_weight not between 1 and 500 or (v_height is not null and v_height not between 30 and 250) then raise exception using errcode = '22023', message = 'Nilai berat atau tinggi badan tidak valid.'; end if;
  end if;
  if p_temperature_c is not null and p_temperature_c not between 25 and 45 then raise exception using errcode = '22023', message = 'Nilai suhu tubuh tidak valid.'; end if;
  if p_pulse_bpm is not null and p_pulse_bpm not between 20 and 250 then raise exception using errcode = '22023', message = 'Nilai denyut nadi tidak valid.'; end if;

  insert into public.health_records (citizen_id, examiner_user_id, examined_at, complaint, notes, needs_follow_up, reference_note, idempotency_key)
  values (p_citizen_id, auth.uid(), coalesce(p_examined_at, now()), nullif(trim(p_complaint), ''), nullif(trim(p_notes), ''), coalesce(p_needs_follow_up, false), nullif(trim(p_reference_note), ''), p_idempotency_key)
  returning health_record_id into v_record_id;

  if p_blood_pressure is not null then insert into public.blood_pressure_records values (v_record_id, v_systolic, v_diastolic, nullif((p_blood_pressure ->> 'pulse_bpm')::integer, 0)); end if;
  if p_blood_sugar is not null then insert into public.blood_sugar_records values (v_record_id, v_sugar, v_context); end if;
  if p_weight is not null then insert into public.weight_records values (v_record_id, v_weight, v_height); end if;
  if p_temperature_c is not null then insert into public.temperature_records values (v_record_id, p_temperature_c); end if;
  if p_pulse_bpm is not null then insert into public.pulse_records values (v_record_id, p_pulse_bpm); end if;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create', 'health_record', v_record_id, jsonb_build_object('citizen_id', p_citizen_id, 'needs_follow_up', coalesce(p_needs_follow_up, false)));

  for v_linked_user in select user_id from public.linked_accounts where citizen_id = p_citizen_id loop
    insert into public.notifications (user_id, title, message, notification_type)
    values (v_linked_user, 'Pemeriksaan baru telah ditambahkan.', 'Data pemeriksaan kesehatan Anda telah diperbarui.', 'health_record');
  end loop;

  return jsonb_build_object('status', 'created', 'health_record_id', v_record_id);
end;
$$;

create or replace function public.update_my_nakes_profile(
  p_full_name text default null, p_position text default null, p_specialty text default null,
  p_phone text default null, p_avatar_url text default null, p_whatsapp_number text default null,
  p_work_status text default null, p_is_siaga boolean default null,
  p_services text default null, p_schedule text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using errcode='42501', message='Belum login'; end if;
  if public.current_app_role() <> 'nakes' then raise exception using errcode='42501', message='Hanya nakes'; end if;
  if p_work_status is not null and p_work_status not in ('Sedang bertugas','Sedang menangani warga','Tidak sedang bertugas','Tidak tersedia') then raise exception using errcode='22023', message='Status tidak valid'; end if;
  update public.health_workers set
    full_name = coalesce(nullif(trim(p_full_name),''), full_name),
    position = coalesce(nullif(trim(p_position),''), position),
    specialty = coalesce(nullif(trim(p_specialty),''), specialty),
    phone = coalesce(nullif(trim(p_phone),''), phone),
    avatar_url = coalesce(nullif(trim(p_avatar_url),''), avatar_url),
    whatsapp_number = coalesce(nullif(trim(p_whatsapp_number),''), whatsapp_number),
    work_status = coalesce(p_work_status, work_status),
    is_siaga = coalesce(p_is_siaga, is_siaga),
    services = coalesce(nullif(trim(p_services),''), services),
    schedule = coalesce(nullif(trim(p_schedule),''), schedule)
  where user_id = v_user;
  if not found then raise exception using errcode='22023', message='Profil nakes tidak ditemukan. Hubungi admin.'; end if;
  return jsonb_build_object('status','updated');
end; $$;

-- ---------------------------------------------------------------------------
-- 8. Manajemen role & akun (Developer-only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_email text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_target_role public.app_role;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();

  if p_role not in ('developer', 'rt_rw', 'nakes', 'warga') then
    raise exception using errcode = '22023', message = 'Role hanya boleh Developer, RT/RW, Nakes, atau Warga.';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception using errcode = '22023', message = 'Akun Google dengan email tersebut belum pernah login.';
  end if;
  if v_uid = auth.uid() then
    raise exception using errcode = '22023', message = 'Role akun sendiri tidak dapat diubah.';
  end if;

  select role into v_target_role from public.profiles where user_id = v_uid;
  if v_target_role = 'developer' then
    raise exception using errcode = '42501', message = 'Role Developer tidak dapat diubah dari daftar akun.';
  end if;

  update public.profiles set role = p_role::public.app_role, updated_at = now() where user_id = v_uid;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'set_role', 'profiles', v_uid, jsonb_build_object('role', p_role, 'previous_role', v_target_role, 'email', lower(trim(p_email))));
  return jsonb_build_object('status', 'updated', 'user_id', v_uid, 'role', p_role);
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_role text; v_dir_deleted integer := 0;
  v_citizen_id uuid; v_citizen_name text; v_records integer := 0;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Akun Anda sendiri tidak dapat dihapus.';
  end if;

  select u.email, p.role into v_email, v_role
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id;
  if not found then raise exception using errcode = '22023', message = 'Akun tidak ditemukan.'; end if;

  if coalesce(v_role, '') = 'developer' then
    raise exception using errcode = '42501', message = 'Akun Developer tidak dapat dihapus.';
  end if;

  select la.citizen_id, c.full_name into v_citizen_id, v_citizen_name
    from public.linked_accounts la
    join public.citizens c on c.citizen_id = la.citizen_id
    where la.user_id = p_user_id
    limit 1;
  if v_citizen_id is not null then
    select count(*) into v_records from public.health_records where citizen_id = v_citizen_id;
  end if;

  delete from public.health_workers where user_id = p_user_id;
  get diagnostics v_dir_deleted = row_count;

  if v_citizen_id is not null then
    delete from public.citizens where citizen_id = v_citizen_id;
  end if;

  delete from auth.users where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'user', p_user_id, jsonb_build_object(
      'email', v_email, 'role', coalesce(v_role, 'tanpa_role'),
      'health_worker_rows_deleted', v_dir_deleted,
      'citizen_deleted', coalesce(v_citizen_name, ''),
      'health_records_deleted', v_records));
  return jsonb_build_object('status', 'deleted', 'health_worker_rows_deleted', v_dir_deleted, 'citizen_deleted', coalesce(v_citizen_name, ''));
end;
$$;

-- Developer melihat semua akun; RT/RW melihat semua kecuali akun Developer.
create function public.list_admin_profiles()
returns table (user_id uuid, email text, role app_role, display_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller_role app_role;
begin
  perform public.admin_guard();
  v_caller_role := public.current_app_role();
  if v_caller_role = 'developer' then
    return query
    select p.user_id, u.email::text, p.role, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.linked_accounts la on la.user_id = p.user_id
    left join public.citizens c on c.citizen_id = la.citizen_id
    order by p.created_at desc;
    return;
  end if;
  if v_caller_role = 'rt_rw' then
    return query
    select p.user_id, u.email::text, p.role, coalesce(c.full_name, p.display_name), p.is_active, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.linked_accounts la on la.user_id = p.user_id
    left join public.citizens c on c.citizen_id = la.citizen_id
    where p.role <> 'developer'
    order by p.created_at desc;
  end if;
end;
$$;

revoke all on function public.admin_set_user_role(text, text) from public;
revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.list_admin_profiles() from public;
grant execute on function public.admin_set_user_role(text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.list_admin_profiles() to authenticated;

-- Grant ulang untuk fungsi yang definisinya ditulis ulang di migrasi ini
grant execute on function public.search_citizens(text, integer) to authenticated;
grant execute on function public.get_citizen_by_id(uuid) to authenticated;
grant execute on function public.get_nakes_summary() to authenticated;
grant execute on function public.get_nakes_dashboard() to authenticated;
grant execute on function public.list_my_examinations(integer, integer) to authenticated;
grant execute on function public.get_examination_detail(uuid) to authenticated;
grant execute on function public.create_health_record(uuid, timestamptz, text, text, boolean, text, uuid, jsonb, jsonb, jsonb, numeric, integer) to authenticated;
grant execute on function public.update_my_nakes_profile(text, text, text, text, text, text, text, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RLS policies dengan role baru
-- ---------------------------------------------------------------------------
create policy "profiles own or staff read" on public.profiles for select
  using (user_id = auth.uid() or public.current_app_role() in ('nakes', 'developer', 'rt_rw'));

create policy "public reads published articles" on public.health_articles for select
  using (is_published = true or public.current_app_role() in ('developer', 'rt_rw'));

create policy "staff reads workers" on public.health_workers for select to authenticated
  using (is_active = true or public.current_app_role() in ('developer', 'rt_rw'));

create policy "nakes own update" on public.health_workers for update to authenticated
  using (user_id = auth.uid() and public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  with check (user_id = auth.uid());

create policy "citizen own or staff read" on public.citizens for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

create policy "linked account own read" on public.linked_accounts for select
  using (user_id = auth.uid() or public.current_app_role() in ('developer', 'rt_rw'));

create policy "admin reads link token metadata" on public.account_link_tokens for select
  using (public.current_app_role() in ('developer', 'rt_rw'));

create policy "health own or staff read" on public.health_records for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

create policy "health staff insert" on public.health_records for insert to authenticated
  with check (public.current_app_role() in ('nakes', 'developer', 'rt_rw') and examiner_user_id = auth.uid());

create policy "health staff update" on public.health_records for update
  using (public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  with check (public.current_app_role() in ('nakes', 'developer', 'rt_rw'));

create policy "health details own or staff read" on public.blood_pressure_records for select
  using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))));

create policy "health details staff write" on public.blood_pressure_records for all
  using (public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  with check (public.current_app_role() in ('nakes', 'developer', 'rt_rw'));

create policy "sugar details owner or staff" on public.blood_sugar_records for select
  using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))));

create policy "sugar details staff write" on public.blood_sugar_records for all
  using (public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  with check (public.current_app_role() in ('nakes', 'developer', 'rt_rw'));

create policy "weight details owner or staff" on public.weight_records for select
  using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))));

create policy "temperature details owner or staff" on public.temperature_records for select
  using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))));

create policy "pulse details owner or staff" on public.pulse_records for select
  using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))));

create policy "ai_analyses_own_or_staff_read" on public.ai_health_analyses for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

create policy "citizen qr own or staff read" on public.citizen_qr_codes for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

create policy "audit admin read" on public.audit_logs for select
  using (public.current_app_role() in ('developer', 'rt_rw'));
