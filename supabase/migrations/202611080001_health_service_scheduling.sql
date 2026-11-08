-- Jadwal, pendaftaran, dan antrean pemeriksaan. Additive, tanpa mengubah rekam medis lama.

create table if not exists public.health_service_schedules (
  schedule_id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text,
  location text not null check (char_length(trim(location)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 1000),
  status text not null default 'open' check (status in ('draft', 'open', 'closed', 'completed', 'cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.health_service_registrations (
  registration_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.health_service_schedules(schedule_id) on delete restrict,
  citizen_id uuid not null references public.citizens(citizen_id) on delete restrict,
  queue_number integer not null check (queue_number > 0),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (schedule_id, citizen_id),
  unique (schedule_id, queue_number)
);

create index if not exists health_service_schedules_starts_at_idx on public.health_service_schedules(starts_at);
create index if not exists health_service_registrations_schedule_status_idx on public.health_service_registrations(schedule_id, status, queue_number);
create index if not exists health_service_registrations_citizen_idx on public.health_service_registrations(citizen_id, created_at desc);

alter table public.health_service_schedules enable row level security;
alter table public.health_service_registrations enable row level security;
revoke all on public.health_service_schedules, public.health_service_registrations from anon, authenticated;

create or replace function public.list_health_service_schedules()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb)
  from (
    select s.schedule_id, s.title, s.description, s.location, s.starts_at, s.ends_at, s.capacity, s.status,
      (select count(*) from public.health_service_registrations r where r.schedule_id = s.schedule_id and r.status in ('confirmed', 'waiting', 'in_progress'))::integer as registered_count
    from public.health_service_schedules s
    where s.status = 'open' and s.starts_at > now()
  ) x;
$$;

create or replace function public.register_health_service(p_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_citizen_id uuid;
  v_schedule public.health_service_schedules%rowtype;
  v_count integer;
  v_queue integer;
  v_registration_id uuid;
begin
  select la.citizen_id into v_citizen_id from public.linked_accounts la where la.user_id = auth.uid() limit 1;
  if v_citizen_id is null or not public.citizen_access_ok(v_citizen_id) then
    raise exception using errcode = '42501', message = 'Akun warga aktif diperlukan untuk mendaftar layanan.';
  end if;

  select * into v_schedule from public.health_service_schedules where schedule_id = p_schedule_id for update;
  if not found or v_schedule.status <> 'open' or v_schedule.starts_at <= now() then
    raise exception using errcode = '22023', message = 'Jadwal tidak tersedia untuk pendaftaran.';
  end if;
  if exists (select 1 from public.health_service_registrations where schedule_id = p_schedule_id and citizen_id = v_citizen_id) then
    raise exception using errcode = '23505', message = 'Anda sudah terdaftar pada jadwal ini.';
  end if;

  select count(*) into v_count from public.health_service_registrations where schedule_id = p_schedule_id and status in ('confirmed', 'waiting', 'in_progress');
  if v_count >= v_schedule.capacity then
    update public.health_service_schedules set status = 'closed', updated_at = now() where schedule_id = p_schedule_id;
    raise exception using errcode = '22023', message = 'Kuota jadwal sudah penuh.';
  end if;

  select coalesce(max(queue_number), 0) + 1 into v_queue from public.health_service_registrations where schedule_id = p_schedule_id;
  insert into public.health_service_registrations (schedule_id, citizen_id, queue_number, status)
  values (p_schedule_id, v_citizen_id, v_queue, 'confirmed') returning registration_id into v_registration_id;
  insert into public.notifications (user_id, title, message, notification_type)
  select auth.uid(), 'Pendaftaran pemeriksaan dikonfirmasi', 'Nomor antrean Anda: ' || v_queue || '.', 'service_registration';
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'health_service_registered', 'health_service_registration', v_registration_id, jsonb_build_object('schedule_id', p_schedule_id, 'queue_number', v_queue));
  return jsonb_build_object('status', 'confirmed', 'registration_id', v_registration_id, 'queue_number', v_queue);
end;
$$;

create or replace function public.list_my_health_service_registrations()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc), '[]'::jsonb)
  from (
    select r.registration_id, r.queue_number, r.status, r.created_at, s.schedule_id, s.title, s.location, s.starts_at, s.ends_at, s.status as schedule_status
    from public.health_service_registrations r
    join public.health_service_schedules s on s.schedule_id = r.schedule_id
    join public.linked_accounts la on la.citizen_id = r.citizen_id
    where la.user_id = auth.uid()
  ) x;
$$;

create or replace function public.cancel_my_health_service_registration(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.health_service_registrations r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  from public.linked_accounts la, public.health_service_schedules s
  where r.registration_id = p_registration_id and la.citizen_id = r.citizen_id and la.user_id = auth.uid()
    and s.schedule_id = r.schedule_id and s.starts_at > now() and r.status in ('pending', 'confirmed', 'waiting');
  if not found then raise exception using errcode = '42501', message = 'Pendaftaran tidak dapat dibatalkan.'; end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function public.create_health_service_schedule(p_title text, p_description text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz, p_capacity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public.staff_guard();
  if p_starts_at <= now() or p_ends_at <= p_starts_at or p_capacity not between 1 and 1000 then raise exception using errcode = '22023', message = 'Data jadwal tidak valid.'; end if;
  insert into public.health_service_schedules (title, description, location, starts_at, ends_at, capacity, status, created_by)
  values (trim(p_title), nullif(trim(coalesce(p_description, '')), ''), trim(p_location), p_starts_at, p_ends_at, p_capacity, 'open', auth.uid()) returning schedule_id into v_id;
  return jsonb_build_object('schedule_id', v_id, 'status', 'open');
end;
$$;

create or replace function public.list_staff_health_service_registrations(p_schedule_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_guard();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.queue_number), '[]'::jsonb)
  from (
    select r.registration_id, r.queue_number, r.status, r.created_at, c.citizen_id, c.full_name, c.nik_last4
    from public.health_service_registrations r join public.citizens c on c.citizen_id = r.citizen_id
    where r.schedule_id = p_schedule_id
  ) x;
$$;

create or replace function public.call_next_health_service_registration(p_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_registration public.health_service_registrations%rowtype;
begin
  perform public.staff_guard();
  if exists (select 1 from public.health_service_registrations where schedule_id = p_schedule_id and status = 'in_progress') then
    raise exception using errcode = '22023', message = 'Selesaikan pemeriksaan yang sedang berlangsung terlebih dahulu.';
  end if;
  select * into v_registration from public.health_service_registrations where schedule_id = p_schedule_id and status in ('confirmed', 'waiting') order by queue_number for update skip locked limit 1;
  if not found then return jsonb_build_object('status', 'empty'); end if;
  update public.health_service_registrations set status = 'in_progress', updated_at = now() where registration_id = v_registration.registration_id;
  return jsonb_build_object('status', 'in_progress', 'registration_id', v_registration.registration_id, 'queue_number', v_registration.queue_number, 'citizen_id', v_registration.citizen_id);
end;
$$;

create or replace function public.complete_health_service_registration(p_registration_id uuid, p_health_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_citizen_id uuid;
begin
  perform public.staff_guard();
  select citizen_id into v_citizen_id from public.health_service_registrations where registration_id = p_registration_id and status = 'in_progress' for update;
  if v_citizen_id is null then raise exception using errcode = '22023', message = 'Antrean tidak sedang dalam pemeriksaan.'; end if;
  if not exists (select 1 from public.health_records where health_record_id = p_health_record_id and citizen_id = v_citizen_id) then
    raise exception using errcode = '22023', message = 'Rekam pemeriksaan tidak sesuai dengan warga dalam antrean.';
  end if;
  update public.health_service_registrations set status = 'completed', updated_at = now() where registration_id = p_registration_id;
  return jsonb_build_object('status', 'completed');
end;
$$;

create or replace function public.update_health_service_registration_status(p_registration_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.staff_guard();
  if p_status not in ('waiting', 'completed', 'cancelled', 'rejected') then raise exception using errcode = '22023', message = 'Status antrean tidak valid.'; end if;
  update public.health_service_registrations set status = p_status, updated_at = now(), cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end where registration_id = p_registration_id;
  if not found then raise exception using errcode = '22023', message = 'Pendaftaran tidak ditemukan.'; end if;
  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.list_health_service_schedules() from public;
revoke all on function public.register_health_service(uuid) from public;
revoke all on function public.list_my_health_service_registrations() from public;
revoke all on function public.cancel_my_health_service_registration(uuid) from public;
revoke all on function public.create_health_service_schedule(text, text, text, timestamptz, timestamptz, integer) from public;
revoke all on function public.list_staff_health_service_registrations(uuid) from public;
revoke all on function public.call_next_health_service_registration(uuid) from public;
revoke all on function public.complete_health_service_registration(uuid, uuid) from public;
revoke all on function public.update_health_service_registration_status(uuid, text) from public;
grant execute on function public.list_health_service_schedules(), public.register_health_service(uuid), public.list_my_health_service_registrations(), public.cancel_my_health_service_registration(uuid), public.create_health_service_schedule(text, text, text, timestamptz, timestamptz, integer), public.list_staff_health_service_registrations(uuid), public.call_next_health_service_registration(uuid), public.complete_health_service_registration(uuid, uuid), public.update_health_service_registration_status(uuid, text) to authenticated;
