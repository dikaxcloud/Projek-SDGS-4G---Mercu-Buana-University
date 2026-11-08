-- Permintaan layanan warga dan kegiatan kesehatan. Additive, tanpa mengubah data lama.

create table if not exists public.community_service_requests (
  request_id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.citizens(citizen_id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 160),
  category text not null check (category in ('pemeriksaan', 'informasi', 'bantuan_akses', 'lainnya')),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'accepted', 'in_progress', 'completed', 'rejected')),
  response_note text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_health_activities (
  activity_id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  location text not null check (char_length(trim(location)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  registration_enabled boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists community_service_requests_citizen_idx on public.community_service_requests(citizen_id, created_at desc);
create index if not exists community_service_requests_status_idx on public.community_service_requests(status, created_at desc);
create index if not exists community_health_activities_starts_idx on public.community_health_activities(starts_at);

alter table public.community_service_requests enable row level security;
alter table public.community_health_activities enable row level security;
revoke all on public.community_service_requests, public.community_health_activities from anon, authenticated;

create or replace function public.create_my_community_service_request(p_title text, p_category text, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_citizen_id uuid; v_request_id uuid;
begin
  select la.citizen_id into v_citizen_id from public.linked_accounts la where la.user_id = auth.uid() limit 1;
  if v_citizen_id is null or not public.citizen_access_ok(v_citizen_id) then raise exception using errcode = '42501', message = 'Akun warga aktif diperlukan.'; end if;
  if p_category not in ('pemeriksaan', 'informasi', 'bantuan_akses', 'lainnya') then raise exception using errcode = '22023', message = 'Kategori permintaan tidak valid.'; end if;
  insert into public.community_service_requests (citizen_id, title, category, description)
  values (v_citizen_id, trim(p_title), p_category, trim(p_description)) returning request_id into v_request_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'community_service_request_created', 'community_service_request', v_request_id, jsonb_build_object('category', p_category));
  return jsonb_build_object('status', 'submitted', 'request_id', v_request_id);
end;
$$;

create or replace function public.list_my_community_service_requests()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select r.request_id, r.title, r.category, r.description, r.status, r.response_note, r.created_at, r.updated_at
    from public.community_service_requests r
    join public.linked_accounts la on la.citizen_id = r.citizen_id
    where la.user_id = auth.uid()
  ) x;
$$;

create or replace function public.list_staff_community_service_requests(p_status text default '')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_guard();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select r.request_id, r.title, r.category, r.description, r.status, r.response_note, r.created_at, r.updated_at, c.citizen_id, c.full_name, c.nik_last4
    from public.community_service_requests r join public.citizens c on c.citizen_id = r.citizen_id
    where nullif(p_status, '') is null or r.status = p_status
  ) x;
$$;

create or replace function public.update_community_service_request(p_request_id uuid, p_status text, p_response_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_citizen_id uuid; v_user_id uuid;
begin
  perform public.staff_guard();
  if p_status not in ('under_review', 'accepted', 'in_progress', 'completed', 'rejected') then raise exception using errcode = '22023', message = 'Status permintaan tidak valid.'; end if;
  update public.community_service_requests
  set status = p_status, response_note = nullif(trim(coalesce(p_response_note, '')), ''), assigned_to = auth.uid(), updated_at = now()
  where request_id = p_request_id returning citizen_id into v_citizen_id;
  if v_citizen_id is null then raise exception using errcode = '22023', message = 'Permintaan tidak ditemukan.'; end if;
  for v_user_id in select user_id from public.linked_accounts where citizen_id = v_citizen_id loop
    insert into public.notifications (user_id, title, message, notification_type)
    values (v_user_id, 'Status permintaan layanan diperbarui', 'Status terbaru: ' || p_status || '.', 'service_request');
  end loop;
  return jsonb_build_object('status', p_status);
end;
$$;

create or replace function public.list_public_community_health_activities()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb)
  from (
    select activity_id, title, description, location, starts_at, ends_at, registration_enabled, status
    from public.community_health_activities
    where status = 'published' and ends_at >= now()
  ) x;
$$;

create or replace function public.list_staff_community_health_activities()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_guard();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc), '[]'::jsonb)
  from (select activity_id, title, description, location, starts_at, ends_at, registration_enabled, status from public.community_health_activities) x;
$$;

create or replace function public.create_community_health_activity(p_title text, p_description text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz, p_registration_enabled boolean, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_activity_id uuid;
begin
  perform public.admin_guard();
  if p_starts_at <= now() or p_ends_at <= p_starts_at then raise exception using errcode = '22023', message = 'Waktu kegiatan tidak valid.'; end if;
  insert into public.community_health_activities (title, description, location, starts_at, ends_at, registration_enabled, status, created_by)
  values (trim(p_title), trim(p_description), trim(p_location), p_starts_at, p_ends_at, coalesce(p_registration_enabled, false), case when p_publish then 'published' else 'draft' end, auth.uid()) returning activity_id into v_activity_id;
  return jsonb_build_object('activity_id', v_activity_id, 'status', case when p_publish then 'published' else 'draft' end);
end;
$$;

create or replace function public.update_community_health_activity_status(p_activity_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  if p_status not in ('draft', 'published', 'cancelled', 'completed') then raise exception using errcode = '22023', message = 'Status kegiatan tidak valid.'; end if;
  update public.community_health_activities set status = p_status, updated_at = now() where activity_id = p_activity_id;
  if not found then raise exception using errcode = '22023', message = 'Kegiatan tidak ditemukan.'; end if;
  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.create_my_community_service_request(text, text, text), public.list_my_community_service_requests(), public.list_staff_community_service_requests(text), public.update_community_service_request(uuid, text, text), public.list_public_community_health_activities(), public.list_staff_community_health_activities(), public.create_community_health_activity(text, text, text, timestamptz, timestamptz, boolean, boolean), public.update_community_health_activity_status(uuid, text) from public;
grant execute on function public.create_my_community_service_request(text, text, text), public.list_my_community_service_requests(), public.list_staff_community_service_requests(text), public.update_community_service_request(uuid, text, text), public.list_public_community_health_activities(), public.list_staff_community_health_activities(), public.create_community_health_activity(text, text, text, timestamptz, timestamptz, boolean, boolean), public.update_community_health_activity_status(uuid, text) to authenticated;
