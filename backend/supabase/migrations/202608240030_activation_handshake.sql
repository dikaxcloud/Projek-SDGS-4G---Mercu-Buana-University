-- Migration: activation handshake — warga must scan admin's QR to unlock account.
-- Additive only.

alter table public.citizens add column if not exists activation_token_hash text;
alter table public.citizens add column if not exists activation_expires_at timestamptz;
alter table public.citizens add column if not exists activated_at timestamptz;

-- Grandfather accounts that were verified before this feature existed.
update public.citizens
set activated_at = now()
where verification_status = 'verified' and activated_at is null;

-- ============================================================
-- ADMIN: issue (or re-issue) an activation challenge QR token
-- ============================================================
create or replace function public.admin_issue_activation(p_citizen_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_raw bytea := extensions.gen_random_bytes(32);
  v_token text := replace(replace(replace(encode(v_raw, 'base64'), '+', ''), '/', ''), '=', '');
  v_ok boolean;
begin
  perform public.admin_guard();
  select verification_status = 'verified' into v_ok from public.citizens where citizen_id = p_citizen_id;
  if not coalesce(v_ok, false) then
    raise exception using errcode = '22023', message = 'Hanya warga terverifikasi yang dapat diberi QR aktivasi.';
  end if;

  update public.citizens
  set activation_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      activation_expires_at = now() + interval '30 minutes',
      activated_at = null,
      updated_at = now()
  where citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'issue_activation', 'citizen', p_citizen_id, jsonb_build_object('expires_in_minutes', 30));

  return jsonb_build_object('status', 'issued', 'token', v_token, 'expires_in_minutes', 30);
end;
$$;

-- ============================================================
-- WARGA: activate own account using the scanned token
-- ============================================================
create or replace function public.activate_my_account(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row public.citizens%rowtype;
  v_hash text := encode(extensions.digest(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'), 'sha256'), 'hex');
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.'; end if;

  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then return jsonb_build_object('status', 'no_citizen'); end if;

  select * into v_row from public.citizens c where c.citizen_id = v_citizen;
  if v_row.activated_at is not null then
    return jsonb_build_object('status', 'already_active');
  end if;
  if v_row.activation_token_hash is null or v_row.activation_token_hash <> v_hash then
    return jsonb_build_object('status', 'invalid_token');
  end if;
  if v_row.activation_expires_at is null or v_row.activation_expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  update public.citizens
  set activated_at = now(), activation_token_hash = null, activation_expires_at = null, updated_at = now()
  where citizen_id = v_citizen;

  insert into public.notifications (user_id, title, message, notification_type)
  values (v_uid, 'Akun berhasil diaktifkan ✅', 'Selamat! Akun kesehatan Anda kini aktif dan siap digunakan.', 'activation');

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_uid, 'activate', 'citizen', v_citizen, '{}');

  return jsonb_build_object('status', 'activated');
end;
$$;

-- ============================================================
-- Context exposes activation state for the frontend gate
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
    'phone', c.phone, 'verification_status', c.verification_status, 'verification_note', c.verification_note,
    'activated_at', c.activated_at
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

revoke all on function public.admin_issue_activation(uuid) from public;
revoke all on function public.activate_my_account(text) from public;
revoke all on function public.get_my_citizen_context() from public;
grant execute on function public.admin_issue_activation(uuid) to authenticated;
grant execute on function public.activate_my_account(text) to authenticated;
grant execute on function public.get_my_citizen_context() to authenticated;

notify pgrst, 'reload schema';
