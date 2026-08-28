-- Migration: Staff (admin/nakes) citizen & administration management.
-- Additive only: new RPCs + one replacement of create_account_link_token
-- (staff guard + human-friendly activation code). No schema drops.

-- ============================================================
-- Guards
-- ============================================================
create or replace function public.staff_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('nakes', 'admin') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
end;
$$;

-- ============================================================
-- CREATE CITIZEN (staff) with NIK duplicate protection
-- ============================================================
create or replace function public.staff_create_citizen(
  p_nik text,
  p_full_name text,
  p_household_id uuid,
  p_family_relation text default null,
  p_phone text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_blood_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
  v_hash text;
  v_citizen_id uuid;
  v_existing uuid;
begin
  perform public.staff_guard();

  if v_digits !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'NIK harus terdiri dari 16 digit angka.';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama lengkap tidak valid.';
  end if;
  if p_gender is not null and p_gender not in ('perempuan', 'laki-laki', 'lainnya') then
    raise exception using errcode = '22023', message = 'Jenis kelamin tidak valid.';
  end if;
  if p_blood_type is not null and p_blood_type !~ '^(A|B|AB|O)[+-]$' then
    raise exception using errcode = '22023', message = 'Golongan darah tidak valid.';
  end if;
  if not exists (select 1 from public.households where household_id = p_household_id) then
    raise exception using errcode = '22023', message = 'Kartu keluarga tidak ditemukan. Tambahkan KK terlebih dahulu.';
  end if;

  -- Duplicate protection on hashed NIK.
  v_hash := encode(extensions.digest(v_digits, 'sha256'), 'hex');
  select c.citizen_id into v_existing from public.citizens c where c.nik_hash = v_hash limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'citizen_id', v_existing);
  end if;

  begin
    insert into public.citizens (
      household_id, nik_hash, nik_last4, full_name, phone, birth_date,
      gender, blood_type, family_relation
    ) values (
      p_household_id, v_hash, right(v_digits, 4), trim(p_full_name), nullif(trim(p_phone), ''),
      p_birth_date, p_gender, p_blood_type, nullif(trim(p_family_relation), '')
    ) returning citizen_id into v_citizen_id;
  exception when unique_violation then
    select c.citizen_id into v_existing from public.citizens c where c.nik_hash = v_hash limit 1;
    return jsonb_build_object('status', 'duplicate', 'citizen_id', v_existing);
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create', 'citizen', v_citizen_id, jsonb_build_object('source', 'staff_dashboard'));

  return jsonb_build_object('status', 'created', 'citizen_id', v_citizen_id);
end;
$$;

-- ============================================================
-- UPDATE CITIZEN (staff; admin keeps its own richer variant)
-- ============================================================
create or replace function public.staff_update_citizen(
  p_citizen_id uuid,
  p_full_name text,
  p_phone text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_blood_type text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.staff_guard();
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama warga tidak valid.';
  end if;
  if p_gender is not null and p_gender not in ('perempuan', 'laki-laki', 'lainnya') then
    raise exception using errcode = '22023', message = 'Jenis kelamin tidak valid.';
  end if;
  if p_blood_type is not null and p_blood_type !~ '^(A|B|AB|O)[+-]$' then
    raise exception using errcode = '22023', message = 'Golongan darah tidak valid.';
  end if;

  update public.citizens set
    full_name = trim(p_full_name),
    phone = nullif(trim(p_phone), ''),
    birth_date = p_birth_date,
    gender = p_gender,
    blood_type = p_blood_type,
    is_active = coalesce(p_is_active, true),
    updated_at = now()
  where citizen_id = p_citizen_id;

  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'update', 'citizen', p_citizen_id, jsonb_build_object('fields', jsonb_build_array('full_name','phone','birth_date','gender','blood_type','is_active')));

  return jsonb_build_object('status', 'updated');
end;
$$;

-- ============================================================
-- LIST CITIZENS with filters + Google connection status
-- p_status: '' | active | inactive | connected | pending
-- ============================================================
create or replace function public.list_staff_citizens(
  p_query text default '',
  p_rt text default '',
  p_status text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  citizen_id uuid, full_name text, nik_last4 text, household_number text,
  rt_code text, phone text, gender text, blood_type text, birth_date date,
  family_relation text, is_active boolean, google_connected boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_rt text := left(trim(coalesce(p_rt, '')), 10);
  v_status text := lower(left(trim(coalesce(p_status, '')), 12));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.staff_guard();
  return query
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code,
         c.phone, c.gender, c.blood_type, c.birth_date, c.family_relation, c.is_active,
         (la.linked_account_id is not null) as google_connected
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  left join public.linked_accounts la on la.citizen_id = c.citizen_id
  where (v_query = '' or c.full_name ilike '%' || v_query || '%' or c.nik_last4 = right(regexp_replace(v_query, '[^0-9]', '', 'g'), 4) or h.household_number ilike '%' || v_query || '%')
    and (v_rt = '' or upper(r.code) = upper(v_rt))
    and (
      v_status = ''
      or (v_status = 'active' and c.is_active)
      or (v_status = 'inactive' and not c.is_active)
      or (v_status = 'connected' and la.linked_account_id is not null)
      or (v_status = 'pending' and la.linked_account_id is null)
    )
  order by c.full_name
  limit v_limit offset v_offset;
end; $$;

-- ============================================================
-- CITIZEN DETAIL for staff incl. Google connection info
-- ============================================================
create or replace function public.get_staff_citizen_detail(p_citizen_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
  v_user_id uuid;
  v_email text;
begin
  perform public.staff_guard();
  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'phone', c.phone,
    'gender', c.gender,
    'birth_date', c.birth_date,
    'blood_type', c.blood_type,
    'family_relation', c.family_relation,
    'is_active', c.is_active,
    'household', jsonb_build_object(
      'household_id', h.household_id,
      'household_number', h.household_number,
      'address', h.address,
      'rt_code', r.code
    )
  )
  into v_result
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = p_citizen_id;

  if v_result is null then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  select la.user_id into v_user_id from public.linked_accounts la where la.citizen_id = p_citizen_id limit 1;
  v_email := null;
  if v_user_id is not null then
    select u.email into v_email from auth.users u where u.id = v_user_id limit 1;
  end if;

  v_result := jsonb_set(v_result, '{google}', jsonb_build_object('connected', v_user_id is not null, 'email', v_email));
  return v_result;
end; $$;

-- ============================================================
-- HOUSEHOLD (KK) management
-- ============================================================
create or replace function public.staff_create_household(
  p_rt_id uuid,
  p_household_number text,
  p_head_name text,
  p_address text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.staff_guard();
  if length(trim(coalesce(p_household_number, ''))) not between 3 and 30 then
    raise exception using errcode = '22023', message = 'Nomor KK tidak valid (3-30 karakter).';
  end if;
  if nullif(trim(coalesce(p_head_name, '')), '') is null or length(trim(p_head_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama kepala keluarga tidak valid.';
  end if;
  if not exists (select 1 from public.rts where rt_id = p_rt_id) then
    raise exception using errcode = '22023', message = 'RT tidak ditemukan.';
  end if;

  begin
    insert into public.households(rt_id, household_number, head_name, address)
    values (p_rt_id, upper(trim(p_household_number)), trim(p_head_name), nullif(trim(p_address), ''))
    returning household_id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Nomor KK sudah digunakan pada RT tersebut.';
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create', 'household', v_id, jsonb_build_object('household_number', upper(trim(p_household_number))));

  return jsonb_build_object('status', 'created', 'household_id', v_id);
end;
$$;

create or replace function public.list_staff_households(p_query text default '', p_limit integer default 100, p_offset integer default 0)
returns table (household_id uuid, household_number text, head_name text, address text, rt_code text, rt_id uuid, citizen_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.staff_guard();
  return query
  select h.household_id, h.household_number, h.head_name, h.address, r.code, r.rt_id, count(c.citizen_id)
  from public.households h
  join public.rts r on r.rt_id = h.rt_id
  left join public.citizens c on c.household_id = h.household_id and c.is_active
  where v_query = '' or h.household_number ilike '%' || v_query || '%' or h.head_name ilike '%' || v_query || '%' or r.code ilike '%' || v_query || '%'
  group by h.household_id, r.code, r.rt_id
  order by r.code, h.household_number
  limit v_limit offset v_offset;
end; $$;

create or replace function public.list_household_members(p_household_id uuid)
returns table (citizen_id uuid, full_name text, nik_last4 text, family_relation text, gender text, is_active boolean, google_connected boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.staff_guard();
  return query
  select c.citizen_id, c.full_name, c.nik_last4, c.family_relation, c.gender, c.is_active,
         (la.linked_account_id is not null) as google_connected
  from public.citizens c
  left join public.linked_accounts la on la.citizen_id = c.citizen_id
  where c.household_id = p_household_id
  order by c.full_name;
end; $$;

-- ============================================================
-- RT management (admin)
-- ============================================================
create or replace function public.admin_create_rt(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_id uuid;
  v_rw uuid;
begin
  perform public.admin_guard();
  if v_code !~ '^RT [0-9]{2}$' then
    raise exception using errcode = '22023', message = 'Kode RT harus berformat RT XX (contoh RT 06).';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception using errcode = '22023', message = 'Nama RT wajib diisi.';
  end if;
  select rw_id into v_rw from public.rws order by created_at limit 1;
  if v_rw is null then
    raise exception using errcode = '22023', message = 'RW belum tersedia.';
  end if;

  begin
    insert into public.rts(rw_id, code, name) values (v_rw, v_code, trim(p_name)) returning rt_id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Kode RT sudah digunakan.';
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create', 'rt', v_id, jsonb_build_object('code', v_code));
  return jsonb_build_object('status', 'created', 'rt_id', v_id);
end;
$$;

create or replace function public.admin_update_rt(p_rt_id uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception using errcode = '22023', message = 'Nama RT wajib diisi.';
  end if;
  update public.rts set name = trim(p_name) where rt_id = p_rt_id;
  if not found then
    raise exception using errcode = '22023', message = 'RT tidak ditemukan.';
  end if;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'update', 'rt', p_rt_id, '{}');
  return jsonb_build_object('status', 'updated');
end;
$$;

create or replace function public.list_staff_rts()
returns table (rt_id uuid, code text, name text, household_count bigint, citizen_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.staff_guard();
  return query
  select r.rt_id, r.code, r.name, count(distinct h.household_id), count(c.citizen_id)
  from public.rts r
  left join public.households h on h.rt_id = r.rt_id
  left join public.citizens c on c.household_id = h.household_id and c.is_active
  group by r.rt_id
  order by r.code;
end; $$;

-- ============================================================
-- ACTIVATION CODE: staff-generatable, human friendly (ABCD-1234)
-- Replaces previous hex token generation. link_account stays compatible:
-- the code is still stored hashed with expiry + single use.
-- ============================================================
create or replace function public.create_account_link_token(p_citizen_id uuid, p_expires_in_minutes integer default 15)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw bytea;
  v_chars text := '';
  v_plain text;
  i integer;
begin
  perform public.staff_guard();
  if not exists (select 1 from public.citizens where citizen_id = p_citizen_id and is_active) then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  v_raw := extensions.gen_random_bytes(8);
  for i in 1..8 loop
    v_chars := v_chars || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(v_raw, i - 1) % 31) + 1, 1);
  end loop;
  v_plain := substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);

  insert into public.account_link_tokens (citizen_id, token_hash, expires_at, created_by)
  values (p_citizen_id, encode(extensions.digest(v_plain, 'sha256'), 'hex'), now() + make_interval(mins => greatest(5, least(coalesce(p_expires_in_minutes, 15), 60))), auth.uid());

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create_link_token', 'citizen', p_citizen_id, jsonb_build_object('expires_in_minutes', greatest(5, least(coalesce(p_expires_in_minutes, 15), 60))));

  return v_plain;
end;
$$;

-- ============================================================
-- Grants
-- ============================================================
revoke all on function public.staff_guard() from public;
revoke all on function public.staff_create_citizen(text, text, uuid, text, text, date, text, text) from public;
revoke all on function public.staff_update_citizen(uuid, text, text, date, text, text, boolean) from public;
revoke all on function public.list_staff_citizens(text, text, text, integer, integer) from public;
revoke all on function public.get_staff_citizen_detail(uuid) from public;
revoke all on function public.staff_create_household(uuid, text, text, text) from public;
revoke all on function public.list_staff_households(text, integer, integer) from public;
revoke all on function public.list_household_members(uuid) from public;
revoke all on function public.admin_create_rt(text, text) from public;
revoke all on function public.admin_update_rt(uuid, text) from public;
revoke all on function public.list_staff_rts() from public;
revoke all on function public.create_account_link_token(uuid, integer) from public;

grant execute on function public.staff_create_citizen(text, text, uuid, text, text, date, text, text) to authenticated;
grant execute on function public.staff_update_citizen(uuid, text, text, date, text, text, boolean) to authenticated;
grant execute on function public.list_staff_citizens(text, text, text, integer, integer) to authenticated;
grant execute on function public.get_staff_citizen_detail(uuid) to authenticated;
grant execute on function public.staff_create_household(uuid, text, text, text) to authenticated;
grant execute on function public.list_staff_households(text, integer, integer) to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
grant execute on function public.admin_create_rt(text, text) to authenticated;
grant execute on function public.admin_update_rt(uuid, text) to authenticated;
grant execute on function public.list_staff_rts() to authenticated;
grant execute on function public.create_account_link_token(uuid, integer) to authenticated;
