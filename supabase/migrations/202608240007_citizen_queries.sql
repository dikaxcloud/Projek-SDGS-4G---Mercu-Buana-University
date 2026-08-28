-- Citizen self-service queries. Return minimum masked identity and household data only.

create or replace function public.get_my_citizen_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_citizen_id uuid;
  v_household_id uuid;
  v_profile jsonb;
  v_family jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  select la.citizen_id into v_citizen_id
  from public.linked_accounts la
  where la.user_id = auth.uid()
  limit 1;

  if v_citizen_id is null then
    return jsonb_build_object('profile', null, 'family', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'household_number', h.household_number,
    'rt_code', r.code,
    'gender', c.gender,
    'birth_date', c.birth_date,
    'blood_type', c.blood_type,
    'family_relation', c.family_relation,
    'phone', c.phone
  ), c.household_id
  into v_profile, v_household_id
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = v_citizen_id and c.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'family_relation', c.family_relation,
    'gender', c.gender
  ) order by c.full_name), '[]'::jsonb)
  into v_family
  from public.citizens c
  where c.household_id = v_household_id and c.is_active;

  return jsonb_build_object('profile', v_profile, 'family', v_family);
end;
$$;

revoke all on function public.get_my_citizen_context() from public;
grant execute on function public.get_my_citizen_context() to authenticated;

create or replace function public.update_my_citizen_profile(
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_citizen_id uuid;
  v_name text := nullif(trim(p_full_name), '');
  v_phone text := nullif(trim(p_phone), '');
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'Nama tidak valid.';
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    raise exception using errcode = '22023', message = 'Nomor telepon tidak valid.';
  end if;

  select citizen_id into v_citizen_id from public.linked_accounts where user_id = auth.uid() limit 1;
  if v_citizen_id is null then
    raise exception using errcode = '42501', message = 'Profil warga belum terhubung.';
  end if;

  update public.citizens set full_name = v_name, phone = v_phone, updated_at = now()
  where citizen_id = v_citizen_id and is_active;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'update_limited_profile', 'citizen', v_citizen_id, jsonb_build_object('fields', jsonb_build_array('full_name', 'phone')));

  return jsonb_build_object('status', 'updated', 'citizen_id', v_citizen_id);
end;
$$;

revoke all on function public.update_my_citizen_profile(text, text) from public;
grant execute on function public.update_my_citizen_profile(text, text) to authenticated;
