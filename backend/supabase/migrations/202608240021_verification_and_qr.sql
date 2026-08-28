-- Migration: Production data migration part 1
-- 1) Citizen verification workflow (PENDING_VERIFICATION / VERIFIED / REJECTED)
-- 2) Automatic citizen QR system (secure random token, hash + plain, lifecycle)
-- 3) register_citizen v3: pending status + rate limit
-- 4) Demo citizen cleanup (seed citizens without Google link & without records)
-- Additive only. Counts recorded in audit_logs.

-- ============================================================
-- Verification columns
-- ============================================================
alter table public.citizens add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending','verified','rejected'));
alter table public.citizens add column if not exists verification_note text;
alter table public.citizens add column if not exists verified_at timestamptz;
alter table public.citizens add column if not exists verified_by uuid references auth.users(id) on delete set null;

-- Existing citizens that already have a linked Google account are trusted.
update public.citizens c
set verification_status = 'verified', verified_at = now()
where exists (select 1 from public.linked_accounts la where la.citizen_id = c.citizen_id);

-- ============================================================
-- CITIZEN QR CODES
-- ============================================================
create table if not exists public.citizen_qr_codes (
  qr_id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.citizens(citizen_id) on delete cascade,
  token text not null,
  token_hash text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','REPLACED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists one_active_qr_per_citizen on public.citizen_qr_codes(citizen_id) where status = 'ACTIVE';
create index if not exists citizen_qr_hash_idx on public.citizen_qr_codes(token_hash);

alter table public.citizen_qr_codes enable row level security;
create policy "citizen qr own or staff read" on public.citizen_qr_codes for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'admin')
);

revoke insert, update, delete on table public.citizen_qr_codes from anon, authenticated;

-- ============================================================
-- INTERNAL: issue a QR (marks previous ACTIVE as REPLACED)
-- returns new plain token
-- ============================================================
create or replace function public._issue_citizen_qr(p_citizen_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_raw bytea := extensions.gen_random_bytes(32);
  v_token text := replace(replace(replace(encode(v_raw, 'base64'), '+', ''), '/', ''), '=', '');
  v_hash text := encode(extensions.digest(v_token, 'sha256'), 'hex');
begin
  update public.citizen_qr_codes set status = 'REPLACED', updated_at = now()
  where citizen_id = p_citizen_id and status = 'ACTIVE';
  insert into public.citizen_qr_codes (citizen_id, token, token_hash, status)
  values (p_citizen_id, v_token, v_hash, 'ACTIVE');
  return v_token;
end;
$$;

-- ============================================================
-- REGISTER CITIZEN v3: pending verification + rate limit
-- ============================================================
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
  p_provider text default 'google',
  p_birth_place text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nik text;
  v_digits text;
  v_hash text;
  v_household_id uuid;
  v_citizen_id uuid;
  v_provider_subject text;
  v_recent integer;
begin
  -- Rate limit: max 5 registration attempts per user per hour.
  select count(*) into v_recent from public.audit_logs
  where actor_user_id = v_user_id and action = 'register' and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception using errcode = '429', message = 'Terlalu banyak percobaan. Coba lagi nanti.';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  if p_provider is null or p_provider not in ('google') then
    raise exception using errcode = '22023', message = 'Metode masuk tidak didukung.';
  end if;

  select identity_data ->> 'sub' into v_provider_subject
  from auth.identities where user_id = v_user_id and provider = p_provider
  order by created_at desc limit 1;
  if v_provider_subject is null then
    raise exception using errcode = '42501', message = 'Identitas akun tidak dapat diverifikasi.';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama lengkap tidak valid.';
  end if;

  -- NIK validation + duplicate protection
  v_digits := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
  if v_digits !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'NIK harus terdiri dari 16 digit angka.';
  end if;
  v_nik := v_digits;
  v_hash := encode(extensions.digest(v_nik, 'sha256'), 'hex');
  if exists (select 1 from public.citizens where nik_hash = v_hash) then
    return jsonb_build_object('status', 'nik_duplicate');
  end if;

  -- RT/KK resolution (tolerant input like rt1 / RT01)
  declare
    v_rt_digits text := regexp_replace(coalesce(p_rt_code, ''), '[^0-9]', '', 'g');
    v_rt_canonical text := case when v_rt_digits <> '' then 'RT ' || lpad(v_rt_digits, 2, '0') else upper(trim(coalesce(p_rt_code, ''))) end;
  begin
    select h.household_id into v_household_id
    from public.households h join public.rts r on r.rt_id = h.rt_id
    where (upper(trim(r.code)) = upper(trim(coalesce(p_rt_code, ''))) or upper(trim(r.code)) = v_rt_canonical or regexp_replace(r.code, '[^0-9]', '', 'g') = v_rt_digits)
      and upper(trim(h.household_number)) = upper(trim(p_household_number))
    limit 1;
  end;

  if v_household_id is null then
    raise exception using errcode = '22023',
      message = 'Data wilayah atau KK tidak ditemukan. Pilih RT yang tersedia dan gunakan nomor KK terdaftar, contoh: RT 01 dengan KK-01-01.';
  end if;

  if exists (select 1 from public.linked_accounts where user_id = v_user_id) then
    return jsonb_build_object('status', 'already_linked');
  end if;

  begin
    insert into public.citizens (
      household_id, nik_hash, nik_last4, full_name, phone, birth_date,
      gender, blood_type, marital_status, emergency_contact_name,
      emergency_contact_phone, family_relation, verification_status
    ) values (
      v_household_id, v_hash, right(v_nik, 4), trim(p_full_name), nullif(trim(p_phone), ''), p_birth_date,
      nullif(trim(p_gender), ''), nullif(trim(p_blood_type), ''), nullif(trim(p_marital_status), ''),
      nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), ''),
      nullif(trim(p_family_relation), ''), 'pending'
    ) returning citizen_id into v_citizen_id;

    insert into public.linked_accounts (user_id, citizen_id, provider, provider_subject)
    values (v_user_id, v_citizen_id, p_provider, v_provider_subject);
  exception when unique_violation then
    return jsonb_build_object('status', 'nik_duplicate');
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'register', 'citizen', v_citizen_id, jsonb_build_object('source', 'self_registration', 'verification', 'pending'));

  return jsonb_build_object('status', 'pending_verification', 'citizen_id', v_citizen_id);
end;
$$;

-- ============================================================
-- ADMIN VERIFICATION (+ automatic QR issuance on approve)
-- ============================================================
create or replace function public.admin_verify_citizen(p_citizen_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  perform public.admin_guard();
  if p_approve is null then
    raise exception using errcode = '22023', message = 'Keputusan verifikasi tidak valid.';
  end if;
  if not p_approve and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'Alasan penolakan wajib diisi.';
  end if;

  update public.citizens
  set verification_status = case when p_approve then 'verified' else 'rejected' end,
      verification_note = case when p_approve then null else nullif(trim(p_reason), '') end,
      verified_at = case when p_approve then now() else null end,
      verified_by = case when p_approve then auth.uid() else null end,
      updated_at = now()
  where citizen_id = p_citizen_id;

  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  if p_approve then
    v_token := public._issue_citizen_qr(p_citizen_id);
  else
    update public.citizen_qr_codes set status = 'REVOKED', revoked_at = now(), updated_at = now()
    where citizen_id = p_citizen_id and status = 'ACTIVE';
  end if;

  -- Notify the linked warga through the existing notification system.
  insert into public.notifications (user_id, title, message, notification_type)
  select la.user_id,
    case when p_approve then 'Pendaftaran disetujui ✅' else 'Pendaftaran ditolak' end,
    case when p_approve then 'Data Anda telah diverifikasi admin. QR Kesehatan Anda sudah aktif — buka menu QR Saya.'
         else 'Data Anda ditolak. Alasan: ' || nullif(trim(p_reason), '') || ' Silakan hubungi petugas desa.' end,
    'verification'
  from public.linked_accounts la where la.citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when p_approve then 'verify' else 'reject' end, 'citizen', p_citizen_id,
          jsonb_build_object('reason', nullif(trim(p_reason), '')));

  return jsonb_build_object('status', case when p_approve then 'verified' else 'rejected' end);
end;
$$;

-- ============================================================
-- WARGA: my active QR
-- ============================================================
create or replace function public.get_my_citizen_qr()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row record;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.'; end if;
  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then return jsonb_build_object('state', 'no_citizen'); end if;

  select * into v_row from public.citizen_qr_codes
  where citizen_id = v_citizen and status = 'ACTIVE'
  order by created_at desc limit 1;

  return jsonb_build_object(
    'state', case when v_row.qr_id is null then 'none' else 'ready' end,
    'token', v_row.token,
    'created_at', v_row.created_at,
    'verification_status', (select verification_status::text from public.citizens where citizen_id = v_citizen),
    'full_name', (select full_name from public.citizens where citizen_id = v_citizen),
    'rt_code', (select r.code from public.citizens c join public.households h on h.household_id = c.household_id join public.rts r on r.rt_id = h.rt_id where c.citizen_id = v_citizen),
    'household_number', (select h.household_number from public.citizens c join public.households h on h.household_id = c.household_id where c.citizen_id = v_citizen)
  );
end;
$$;

-- ============================================================
-- STAFF: resolve scanned QR token -> minimal citizen info
-- ============================================================
create or replace function public.resolve_citizen_qr(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_clean text := upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text := encode(extensions.digest(v_clean, 'sha256'), 'hex');
  v_result jsonb;
begin
  perform public.staff_guard();
  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'rt_code', r.code,
    'household_number', h.household_number,
    'blood_type', c.blood_type,
    'gender', c.gender,
    'birth_date', c.birth_date,
    'verification_status', c.verification_status,
    'qr_state', q.status
  )
  into v_result
  from public.citizen_qr_codes q
  join public.citizens c on c.citizen_id = q.citizen_id
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where q.token_hash = v_hash and q.status = 'ACTIVE';

  if v_result is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'citizen', v_result);
end;
$$;

-- ============================================================
-- STAFF: view/regenerate a citizen's QR
-- ============================================================
create or replace function public.get_citizen_qr_for_staff(p_citizen_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_row record;
begin
  perform public.staff_guard();
  select * into v_row from public.citizen_qr_codes
  where citizen_id = p_citizen_id and status = 'ACTIVE'
  order by created_at desc limit 1;
  if v_row.qr_id is null then return jsonb_build_object('state', 'none'); end if;
  return jsonb_build_object('state', 'ready', 'token', v_row.token, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.regenerate_citizen_qr(p_citizen_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  perform public.staff_guard();
  if not exists (select 1 from public.citizens where citizen_id = p_citizen_id and verification_status = 'verified') then
    raise exception using errcode = '22023', message = 'Hanya warga terverifikasi yang dapat memiliki QR.';
  end if;
  v_token := public._issue_citizen_qr(p_citizen_id);
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'regenerate_qr', 'citizen', p_citizen_id, '{}');
  return jsonb_build_object('status', 'regenerated', 'token', v_token);
end;
$$;

-- ============================================================
-- Context & listing expose verification fields
-- ============================================================
create or replace function public.get_my_citizen_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_citizen_id uuid; v_household_id uuid; v_profile jsonb; v_family jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  select la.citizen_id into v_citizen_id from public.linked_accounts la where la.user_id = auth.uid() limit 1;
  if v_citizen_id is null then return jsonb_build_object('profile', null, 'family', '[]'::jsonb); end if;

  select jsonb_build_object(
    'citizen_id', c.citizen_id, 'full_name', c.full_name, 'nik_last4', c.nik_last4,
    'household_number', h.household_number, 'rt_code', r.code, 'gender', c.gender,
    'birth_date', c.birth_date, 'blood_type', c.blood_type, 'family_relation', c.family_relation,
    'phone', c.phone, 'verification_status', c.verification_status, 'verification_note', c.verification_note
  ), c.household_id into v_profile, v_household_id
  from public.citizens c join public.households h on h.household_id = c.household_id join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = v_citizen_id and c.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'citizen_id', c.citizen_id, 'full_name', c.full_name, 'nik_last4', c.nik_last4,
    'family_relation', c.family_relation, 'gender', c.gender) order by c.full_name), '[]'::jsonb)
  into v_family
  from public.citizens c where c.household_id = v_household_id and c.is_active;

  return jsonb_build_object('profile', v_profile, 'family', v_family);
end;
$$;

drop function if exists public.list_staff_citizens(text, text, text, integer, integer);
create function public.list_staff_citizens(
  p_query text default '', p_rt text default '', p_status text default '',
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  citizen_id uuid, full_name text, nik_last4 text, household_number text,
  rt_code text, phone text, gender text, blood_type text, birth_date date,
  family_relation text, is_active boolean, google_connected boolean,
  verification_status text, last_examined_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_rt text := left(trim(coalesce(p_rt, '')), 10);
  v_status text := lower(left(trim(coalesce(p_status, '')), 20));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.staff_guard();
  return query
  with latest_exam as (
    select citizen_id, max(examined_at) as last_at from public.health_records group by citizen_id
  )
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code,
         c.phone, c.gender, c.blood_type, c.birth_date, c.family_relation, c.is_active,
         (la.linked_account_id is not null) as google_connected,
         c.verification_status::text as verification_status,
         le.last_at as last_examined_at
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  left join public.linked_accounts la on la.citizen_id = c.citizen_id
  left join latest_exam le on le.citizen_id = c.citizen_id
  where (v_query = '' or c.full_name ilike '%' || v_query || '%' or c.nik_last4 = right(regexp_replace(v_query, '[^0-9]', '', 'g'), 4) or h.household_number ilike '%' || v_query || '%')
    and (v_rt = '' or upper(r.code) = upper(v_rt))
    and (
      v_status = ''
      or (v_status = 'active' and c.is_active)
      or (v_status = 'inactive' and not c.is_active)
      or (v_status = 'connected' and la.linked_account_id is not null)
      or (v_status = 'pending' and la.linked_account_id is null)
      or (v_status = 'pending_verification' and c.verification_status = 'pending')
      or (v_status = 'verified' and c.verification_status = 'verified')
      or (v_status = 'rejected' and c.verification_status = 'rejected')
    )
  order by c.created_at desc, c.full_name
  limit v_limit offset v_offset;
end; $$;

-- ============================================================
-- ADMIN: promote a Google user to nakes by email (real nakes onboarding)
-- ============================================================
create or replace function public.admin_set_user_role(p_email text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  perform public.admin_guard();
  if p_role not in ('nakes', 'warga') then
    raise exception using errcode = '22023', message = 'Role hanya boleh nakes atau warga.';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception using errcode = '22023', message = 'Akun Google dengan email tersebut belum pernah login.';
  end if;
  update public.profiles set role = p_role::public.app_role, updated_at = now() where user_id = v_uid;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'set_role', 'profiles', v_uid, jsonb_build_object('role', p_role, 'email', lower(trim(p_email))));
  return jsonb_build_object('status', 'updated', 'user_id', v_uid, 'role', p_role);
end;
$$;

-- ============================================================
-- DEMO CITIZEN CLEANUP (approved): seed heads w/o Google & w/o records
-- Count recorded in audit_logs.
-- ============================================================
with deleted as (
  delete from public.citizens c
  where c.nik_hash like encode(extensions.digest('DEMO-NIK-', 'sha256'), 'hex') || '%'
    and c.full_name in ('Budi Santoso', 'Rina Wulandari', 'Slamet Haryono')
    and not exists (select 1 from public.linked_accounts la where la.citizen_id = c.citizen_id)
    and not exists (select 1 from public.health_records hr where hr.citizen_id = c.citizen_id)
  returning 1
)
insert into public.audit_logs (action, entity, entity_id, metadata)
select 'demo_citizen_cleanup', 'citizens', null, jsonb_build_object('deleted', count(*)) from deleted;

-- ============================================================
-- Grants
-- ============================================================
revoke all on function public._issue_citizen_qr(uuid) from public;
revoke all on function public.register_citizen(text,text,text,text,text,date,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.admin_verify_citizen(uuid,boolean,text) from public;
revoke all on function public.get_my_citizen_qr() from public;
revoke all on function public.resolve_citizen_qr(text) from public;
revoke all on function public.get_citizen_qr_for_staff(uuid) from public;
revoke all on function public.regenerate_citizen_qr(uuid) from public;
revoke all on function public.get_my_citizen_context() from public;
revoke all on function public.list_staff_citizens(text,text,text,integer,integer) from public;
revoke all on function public.admin_set_user_role(text,text) from public;

grant execute on function public.register_citizen(text,text,text,text,text,date,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_verify_citizen(uuid,boolean,text) to authenticated;
grant execute on function public.get_my_citizen_qr() to authenticated;
grant execute on function public.resolve_citizen_qr(text) to authenticated;
grant execute on function public.get_citizen_qr_for_staff(uuid) to authenticated;
grant execute on function public.regenerate_citizen_qr(uuid) to authenticated;
grant execute on function public.get_my_citizen_context() to authenticated;
grant execute on function public.list_staff_citizens(text,text,text,integer,integer) to authenticated;
grant execute on function public.admin_set_user_role(text,text) to authenticated;
