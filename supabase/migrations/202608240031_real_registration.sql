-- Migration: real citizen registration — real KK numbers, birth place & address.
-- Additive only.

alter table public.citizens add column if not exists birth_place text;
alter table public.citizens add column if not exists address text;

-- Rebuild register_citizen: supports pre-existing household OR brand-new real KK.
drop function if exists public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text, text, text);
create function public.register_citizen(
  p_nik text,
  p_full_name text,
  p_rt_code text default '',
  p_household_number text default '',
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
  p_address text default null,
  p_household_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  if p_provider not in ('google') then
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

  v_digits := regexp_replace(coalesce(p_nik, ''), '[^0-9]', '', 'g');
  if v_digits !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'NIK harus terdiri dari 16 digit angka.';
  end if;
  v_hash := encode(extensions.digest(v_digits, 'sha256'), 'hex');
  if exists (select 1 from public.citizens where nik_hash = v_hash) then
    return jsonb_build_object('status', 'nik_duplicate');
  end if;

  -- Resolve household: prefer explicit id, else legacy RT+KK match.
  if p_household_id is not null then
    if not exists (select 1 from public.households where household_id = p_household_id) then
      raise exception using errcode = '22023', message = 'Kartu keluarga tidak ditemukan.';
    end if;
    v_household_id := p_household_id;
  else
    declare
      v_rt_digits text := regexp_replace(coalesce(p_rt_code, ''), '[^0-9]', '', 'g');
      v_rt_canonical text := case when v_rt_digits <> '' then 'RT ' || lpad(v_rt_digits, 2, '0') else upper(trim(coalesce(p_rt_code, ''))) end;
    begin
      select h.household_id into v_household_id
      from public.households h join public.rts r on r.rt_id = h.rt_id
      where (upper(trim(r.code)) = upper(trim(p_rt_code)) or upper(trim(r.code)) = v_rt_canonical or regexp_replace(r.code, '[^0-9]', '', 'g') = v_rt_digits)
        and upper(trim(h.household_number)) = upper(trim(p_household_number))
      limit 1;
    end;
    if v_household_id is null then
      raise exception using errcode = '22023',
        message = 'Data wilayah atau KK tidak ditemukan. Pilih RT dan nomor KK yang terdaftar.';
    end if;
  end if;

  if exists (select 1 from public.linked_accounts where user_id = v_user_id) then
    return jsonb_build_object('status', 'already_linked');
  end if;

  begin
    insert into public.citizens (
      household_id, nik_hash, nik_last4, full_name, phone, birth_date,
      gender, blood_type, marital_status, emergency_contact_name,
      emergency_contact_phone, family_relation, verification_status,
      birth_place, address
    ) values (
      v_household_id, v_hash, right(v_digits, 4), trim(p_full_name), nullif(trim(p_phone), ''), p_birth_date,
      nullif(trim(p_gender), ''), nullif(trim(p_blood_type), ''), nullif(trim(p_marital_status), ''),
      nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), ''),
      nullif(trim(p_family_relation), ''), 'pending',
      nullif(trim(p_birth_place), ''), nullif(trim(p_address), '')
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
-- PUBLIC: register a brand-new household with the REAL 16-digit KK number
-- ============================================================
create or replace function public.register_new_household(
  p_rt_code text,
  p_kk_number text,
  p_head_name text,
  p_address text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_recent integer;
  v_rt_digits text;
  v_rt_canonical text;
  v_rt_id uuid;
  v_clean_kk text := upper(regexp_replace(coalesce(p_kk_number, ''), '[\s-]', '', 'g'));
  v_id uuid;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.'; end if;

  -- Rate limit: max 3 household registrations per user per hour.
  select count(*) into v_recent from public.audit_logs
  where actor_user_id = v_uid and action = 'register_household' and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    raise exception using errcode = '429', message = 'Terlalu banyak percobaan. Coba lagi nanti.';
  end if;

  v_rt_digits := regexp_replace(coalesce(p_rt_code, ''), '[^0-9]', '', 'g');
  if v_rt_digits = '' then raise exception using errcode = '22023', message = 'RT wajib dipilih.'; end if;
  v_rt_canonical := 'RT ' || lpad(v_rt_digits, 2, '0');

  if length(v_clean_kk) < 10 or length(v_clean_kk) > 30 then
    raise exception using errcode = '22023', message = 'Nomor KK tidak valid (minimal 10 karakter angka sesuai kartu keluarga).';
  end if;
  if nullif(trim(coalesce(p_head_name, '')), '') is null or length(trim(p_head_name)) > 120 then
    raise exception using errcode = '22023', message = 'Nama kepala keluarga tidak valid.';
  end if;

  select rt_id into v_rt_id from public.rts r
  where regexp_replace(r.code, '[^0-9]', '', 'g') = v_rt_digits limit 1;
  if v_rt_id is null then
    raise exception using errcode = '22023', message = 'RT tidak ditemukan.';
  end if;

  begin
    insert into public.households (rt_id, household_number, head_name, address)
    values (v_rt_id, v_clean_kk, trim(p_head_name), nullif(trim(p_address), ''))
    returning household_id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Nomor KK tersebut sudah terdaftar pada RT ini. Silakan pilih dari daftar.';
  end;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_uid, 'register_household', 'household', v_id, jsonb_build_object('rt', v_rt_canonical));

  return jsonb_build_object('status', 'created', 'household_id', v_id);
end;
$$;

-- ============================================================
-- PUBLIC: list registered households of an RT (masked KK) so warga can pick theirs
-- ============================================================
create or replace function public.get_public_households(p_rt_code text)
returns table (household_id uuid, head_name text, kk_last4 text, address text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_rt_digits text := regexp_replace(coalesce(p_rt_code, ''), '[^0-9]', '', 'g');
begin
  if v_rt_digits = '' then return; end if;
  return query
  select h.household_id, h.head_name, right(h.household_number, 4) as kk_last4, coalesce(h.address, '')
  from public.households h join public.rts r on r.rt_id = h.rt_id
  where regexp_replace(r.code, '[^0-9]', '', 'g') = v_rt_digits
  order by h.head_name;
end; $$;

revoke all on function public.register_citizen(text,text,text,text,text,date,text,text,text,text,text,text,text,text,text,uuid) from public;
revoke all on function public.register_new_household(text,text,text,text) from public;
revoke all on function public.get_public_households(text) from public;

grant execute on function public.register_citizen(text,text,text,text,text,date,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.register_new_household(text,text,text,text) to authenticated;
grant execute on function public.get_public_households(text) to authenticated;

notify pgrst, 'reload schema';
