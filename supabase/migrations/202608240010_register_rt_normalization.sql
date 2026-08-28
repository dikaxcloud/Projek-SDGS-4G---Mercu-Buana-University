-- Migration: Normalize RT/KK input in register_citizen
-- Makes registration tolerant to inputs like 'rt01', 'RT1', 'rt 1' etc.
-- Additive: replaces register_citizen function only.

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
  v_rt_digits text;
  v_rt_canonical text;
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

  -- Canonicalize RT input: 'rt1', 'RT01', 'rt 1' -> 'RT 01'
  v_rt_digits := regexp_replace(coalesce(p_rt_code, ''), '[^0-9]', '', 'g');
  if v_rt_digits <> '' then
    v_rt_canonical := 'RT ' || lpad(v_rt_digits, 2, '0');
  else
    v_rt_canonical := upper(trim(coalesce(p_rt_code, '')));
  end if;

  select h.household_id into v_household_id
  from public.households h
  join public.rts r on r.rt_id = h.rt_id
  where (
    upper(trim(r.code)) = upper(trim(coalesce(p_rt_code, '')))
    or upper(trim(r.code)) = v_rt_canonical
    or regexp_replace(r.code, '[^0-9]', '', 'g') = v_rt_digits
  )
  and upper(trim(h.household_number)) = upper(trim(p_household_number))
  limit 1;

  if v_household_id is null then
    raise exception using errcode = '22023',
      message = 'Data wilayah atau KK tidak ditemukan. Pilih RT yang tersedia dan gunakan nomor KK terdaftar, contoh: RT 01 dengan KK-01-01.';
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

revoke all on function public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text) from public;
grant execute on function public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text) to authenticated;
