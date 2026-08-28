-- Scan/code UX fixes:
-- 1) admin_issue_activation: token becomes a TYPEABLE XXXX-XXXX code (8 chars,
--    31-char alphabet, expires 30 min, single use). Hash is stored DASH-STRIPPED.
-- 2) activate_my_account: normalize input (strip whitespace AND dashes) before
--    hashing, so "DXJG-HGHS" and "DXJGHGHS" both work.
-- 3) create_account_link_token: store hash of the dash-stripped code.
-- 4) link_account: normalize input the same way.

create or replace function public.admin_issue_activation(p_citizen_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_raw bytea := extensions.gen_random_bytes(8);
  v_chars text := '';
  v_code text;
  v_ok boolean;
  i integer;
begin
  perform public.admin_guard();
  select verification_status = 'verified' into v_ok from public.citizens where citizen_id = p_citizen_id;
  if not coalesce(v_ok, false) then
    raise exception using errcode = '22023', message = 'Hanya warga terverifikasi yang dapat diberi QR aktivasi.';
  end if;
  for i in 1..8 loop
    v_chars := v_chars || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(v_raw, i - 1) % 31) + 1, 1);
  end loop;
  v_code := substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);

  update public.citizens
  set activation_token_hash = encode(extensions.digest(regexp_replace(v_code, '-', '', 'g'), 'sha256'), 'hex'),
      activation_expires_at = now() + interval '30 minutes',
      activated_at = null,
      updated_at = now()
  where citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'issue_activation', 'citizen', p_citizen_id, jsonb_build_object('expires_in_minutes', 30));

  return jsonb_build_object('status', 'issued', 'token', v_code, 'code', v_code, 'expires_in_minutes', 30);
end;
$$;

create or replace function public.activate_my_account(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row public.citizens%rowtype;
  v_hash text := encode(extensions.digest(regexp_replace(coalesce(p_token, ''), '[\s-]', '', 'g'), 'sha256'), 'hex');
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
  values (p_citizen_id, encode(extensions.digest(regexp_replace(v_plain, '-', '', 'g'), 'sha256'), 'hex'), now() + make_interval(mins => greatest(5, least(coalesce(p_expires_in_minutes, 15), 60))), auth.uid());

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create_link_token', 'citizen', p_citizen_id, jsonb_build_object('expires_in_minutes', greatest(5, least(coalesce(p_expires_in_minutes, 15), 60))));

  return v_plain;
end;
$$;

create or replace function public.link_account(p_link_token text, p_provider text default 'google')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_token_hash text := encode(extensions.digest(regexp_replace(coalesce(p_link_token, ''), '[\s-]', '', 'g'), 'sha256'), 'hex');
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
