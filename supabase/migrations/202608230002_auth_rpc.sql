-- Desa Sehat Kenanga — authentication and secure RPCs
-- Run after 202608230001_initial_schema.sql.

create table if not exists public.account_link_tokens (
  link_token_id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.citizens(citizen_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.account_link_tokens enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'warga', nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.canonical_nik(p_nik text)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_nik text := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
begin
  if length(v_nik) <> 16 or v_nik !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'Data identitas tidak valid.';
  end if;
  return v_nik;
end;
$$;

create or replace function public.nik_digest(p_nik text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select encode(extensions.digest(public.canonical_nik(p_nik), 'sha256'), 'hex');
$$;

create or replace function public.get_my_access()
returns table (
  user_id uuid,
  role public.app_role,
  display_name text,
  citizen_id uuid,
  nik_last4 text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.role, p.display_name, la.citizen_id, c.nik_last4
  from public.profiles p
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where p.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.register_citizen(
  p_nik text,
  p_full_name text,
  p_rt_code text,
  p_household_number text,
  p_phone text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_blood_type text default null,
  p_marital_status text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_family_relation text default null,
  p_provider text default 'google'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nik text := public.canonical_nik(p_nik);
  v_hash text := encode(extensions.digest(v_nik, 'sha256'), 'hex');
  v_household_id uuid;
  v_citizen_id uuid;
  v_provider_subject text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  if p_provider is null or p_provider not in ('google') then
    raise exception using errcode = '22023', message = 'Metode masuk tidak didukung.';
  end if;

  select identity_data ->> 'sub'
    into v_provider_subject
  from auth.identities
  where user_id = v_user_id and provider = p_provider
  order by created_at desc
  limit 1;

  if v_provider_subject is null then
    raise exception using errcode = '42501', message = 'Identitas akun tidak dapat diverifikasi.';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama lengkap tidak valid.';
  end if;

  select h.household_id into v_household_id
  from public.households h
  join public.rts r on r.rt_id = h.rt_id
  where upper(trim(r.code)) = upper(trim(p_rt_code))
    and upper(trim(h.household_number)) = upper(trim(p_household_number));

  if v_household_id is null then
    raise exception using errcode = '22023', message = 'Data wilayah atau KK tidak ditemukan.';
  end if;

  if exists (select 1 from public.linked_accounts where user_id = v_user_id) then
    return jsonb_build_object('status', 'already_linked');
  end if;

  if exists (select 1 from public.citizens where nik_hash = v_hash) then
    return jsonb_build_object('status', 'already_registered');
  end if;

  begin
    insert into public.citizens (
      household_id, nik_hash, nik_last4, full_name, phone, birth_date,
      gender, blood_type, marital_status, emergency_contact_name,
      emergency_contact_phone, family_relation
    ) values (
      v_household_id, v_hash, right(v_nik, 4), trim(p_full_name), nullif(trim(p_phone), ''), p_birth_date,
      nullif(trim(p_gender), ''), nullif(trim(p_blood_type), ''), nullif(trim(p_marital_status), ''),
      nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), ''), nullif(trim(p_family_relation), '')
    ) returning citizen_id into v_citizen_id;

    insert into public.linked_accounts (user_id, citizen_id, provider, provider_subject)
    values (v_user_id, v_citizen_id, p_provider, v_provider_subject);
  exception when unique_violation then
    return jsonb_build_object('status', 'already_registered');
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'register', 'citizen', v_citizen_id, jsonb_build_object('source', 'self_registration'));

  return jsonb_build_object('status', 'created', 'citizen_id', v_citizen_id, 'nik_last4', right(v_nik, 4));
end;
$$;

create or replace function public.create_account_link_token(p_citizen_id uuid, p_expires_in_minutes integer default 15)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plain text := encode(extensions.gen_random_bytes(24), 'hex');
  v_minutes integer := greatest(5, least(coalesce(p_expires_in_minutes, 15), 60));
begin
  if public.current_app_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
  if not exists (select 1 from public.citizens where citizen_id = p_citizen_id and is_active) then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  insert into public.account_link_tokens (citizen_id, token_hash, expires_at, created_by)
  values (p_citizen_id, encode(extensions.digest(v_plain, 'sha256'), 'hex'), now() + make_interval(mins => v_minutes), auth.uid());

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create_link_token', 'citizen', p_citizen_id, jsonb_build_object('expires_in_minutes', v_minutes));

  return v_plain;
end;
$$;

create or replace function public.link_account(p_link_token text, p_provider text default 'google')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token_hash text := encode(extensions.digest(coalesce(trim(p_link_token), ''), 'sha256'), 'hex');
  v_token public.account_link_tokens%rowtype;
  v_provider_subject text;
  v_existing_citizen uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  if p_provider is null or p_provider not in ('google') then
    raise exception using errcode = '22023', message = 'Metode masuk tidak didukung.';
  end if;

  select identity_data ->> 'sub' into v_provider_subject
  from auth.identities
  where user_id = v_user_id and provider = p_provider
  order by created_at desc limit 1;

  if v_provider_subject is null then
    raise exception using errcode = '42501', message = 'Identitas akun tidak dapat diverifikasi.';
  end if;
  if exists (select 1 from public.linked_accounts where user_id = v_user_id) then
    return jsonb_build_object('status', 'already_linked');
  end if;
  if exists (select 1 from public.linked_accounts where provider = p_provider and provider_subject = v_provider_subject) then
    return jsonb_build_object('status', 'already_linked');
  end if;

  select * into v_token
  from public.account_link_tokens
  where token_hash = v_token_hash and consumed_at is null and expires_at > now()
  for update;

  if v_token.link_token_id is null then
    return jsonb_build_object('status', 'invalid_token');
  end if;

  select citizen_id into v_existing_citizen
  from public.linked_accounts where user_id = v_user_id;
  if v_existing_citizen is not null then
    return jsonb_build_object('status', 'already_linked');
  end if;

  insert into public.linked_accounts (user_id, citizen_id, provider, provider_subject)
  values (v_user_id, v_token.citizen_id, p_provider, v_provider_subject);

  update public.account_link_tokens
  set consumed_at = now(), consumed_by = v_user_id
  where link_token_id = v_token.link_token_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'link_account', 'citizen', v_token.citizen_id, jsonb_build_object('provider', p_provider));

  return jsonb_build_object('status', 'linked', 'citizen_id', v_token.citizen_id);
exception when unique_violation then
  return jsonb_build_object('status', 'invalid_token');
end;
$$;

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
  if v_role not in ('nakes', 'admin') then
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

revoke all on function public.canonical_nik(text) from public;
revoke all on function public.nik_digest(text) from public;
revoke all on function public.get_my_access() from public;
revoke all on function public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text) from public;
revoke all on function public.create_account_link_token(uuid, integer) from public;
revoke all on function public.link_account(text, text) from public;
revoke all on function public.create_health_record(uuid, timestamptz, text, text, boolean, text, uuid, jsonb, jsonb, jsonb, numeric, integer) from public;

grant execute on function public.get_my_access() to authenticated;
grant execute on function public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_account_link_token(uuid, integer) to authenticated;
grant execute on function public.link_account(text, text) to authenticated;
grant execute on function public.create_health_record(uuid, timestamptz, text, text, boolean, text, uuid, jsonb, jsonb, jsonb, numeric, integer) to authenticated;

create policy "admin reads link token metadata" on public.account_link_tokens
for select using (public.current_app_role() = 'admin');
