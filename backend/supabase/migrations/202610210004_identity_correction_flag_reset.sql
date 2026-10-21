-- Reset penanda transaksi setelah koreksi identitas selesai.
-- Mencegah jalur lama mengubah NIK/KK dalam transaksi yang sama.

create or replace function public.admin_correct_citizen_nik(
  p_citizen_id uuid,
  p_nik text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nik text := btrim(coalesce(p_nik, ''));
  v_hash text;
  v_citizen public.citizens%rowtype;
  v_previous_full text;
  v_changed boolean;
begin
  perform public.verification_guard();

  if v_nik !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'NIK harus terdiri dari tepat 16 digit angka.';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Muat ulang data warga sebelum menyimpan perubahan.';
  end if;

  perform set_config('app.identity_correction', 'on', true);

  select * into v_citizen
  from public.citizens
  where citizen_id = p_citizen_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if date_trunc('milliseconds', p_expected_updated_at)
     is distinct from date_trunc('milliseconds', v_citizen.updated_at) then
    raise exception using errcode = '40001', message = 'Data warga telah berubah. Muat ulang lalu periksa kembali.';
  end if;

  if exists (
    select 1 from public.citizens
    where nik_hash = encode(extensions.digest(v_nik, 'sha256'), 'hex')
      and citizen_id <> p_citizen_id
  ) then
    raise exception using errcode = '23505', message = 'NIK sudah terdaftar pada warga lain.';
  end if;

  select nik_full into v_previous_full
  from public.citizen_identity_private
  where citizen_id = p_citizen_id;

  v_hash := encode(extensions.digest(v_nik, 'sha256'), 'hex');
  v_changed := v_citizen.nik_hash is distinct from v_hash or v_previous_full is distinct from v_nik;

  begin
    update public.citizens
    set nik_hash = v_hash,
        nik_last4 = substr(v_nik, 13, 4),
        updated_at = now()
    where citizen_id = p_citizen_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'NIK sudah terdaftar pada warga lain.';
  end;

  insert into public.citizen_identity_private (citizen_id, nik_full, updated_at)
  values (p_citizen_id, v_nik, now())
  on conflict (citizen_id) do update
  set nik_full = excluded.nik_full,
      updated_at = now();

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'correct_identity_nik',
    'citizen',
    p_citizen_id,
    jsonb_build_object(
      'field', 'nik',
      'previous_nik_last4', v_citizen.nik_last4,
      'nik_last4', substr(v_nik, 13, 4),
      'nik_was_available', v_previous_full is not null,
      'changed', v_changed,
      'verification_status_unchanged', true
    )
  );

  perform set_config('app.identity_correction', 'off', true);

  return jsonb_build_object(
    'status', 'saved',
    'nik_last4', substr(v_nik, 13, 4),
    'nik_available', true,
    'changed', v_changed,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.admin_correct_citizen_nik(uuid, text, timestamptz) from public;
revoke all on function public.admin_correct_citizen_nik(uuid, text, timestamptz) from anon;
grant execute on function public.admin_correct_citizen_nik(uuid, text, timestamptz) to authenticated;

create or replace function public.admin_correct_household_number(
  p_citizen_id uuid,
  p_household_number text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_number text := btrim(coalesce(p_household_number, ''));
  v_citizen public.citizens%rowtype;
  v_household public.households%rowtype;
  v_changed boolean;
begin
  perform public.verification_guard();

  if v_household_number !~ '^[0-9]{16}$' then
    raise exception using errcode = '22023', message = 'Nomor KK harus terdiri dari tepat 16 digit angka.';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Muat ulang data warga sebelum menyimpan perubahan.';
  end if;

  perform set_config('app.identity_correction', 'on', true);

  select * into v_citizen
  from public.citizens
  where citizen_id = p_citizen_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if date_trunc('milliseconds', p_expected_updated_at)
     is distinct from date_trunc('milliseconds', v_citizen.updated_at) then
    raise exception using errcode = '40001', message = 'Data warga telah berubah. Muat ulang lalu periksa kembali.';
  end if;

  select * into v_household
  from public.households
  where household_id = v_citizen.household_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Data kartu keluarga tidak ditemukan.';
  end if;

  if exists (
    select 1 from public.households
    where rt_id = v_household.rt_id
      and household_number = v_household_number
      and household_id <> v_household.household_id
  ) then
    raise exception using errcode = '23505', message = 'Nomor KK sudah digunakan pada RT yang sama.';
  end if;

  v_changed := v_household.household_number is distinct from v_household_number;

  if v_changed then
    begin
      update public.households
      set household_number = v_household_number
      where household_id = v_household.household_id;
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'Nomor KK sudah digunakan pada RT yang sama.';
    end;

    update public.citizens
    set updated_at = now()
    where citizen_id = p_citizen_id;

    insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (
      auth.uid(),
      'correct_identity_kk',
      'citizen',
      p_citizen_id,
      jsonb_build_object(
        'field', 'household_number',
        'household_id', v_household.household_id,
        'previous_kk_last4', substr(v_household.household_number, 13, 4),
        'kk_last4', substr(v_household_number, 13, 4),
        'changed', true,
        'verification_status_unchanged', true
      )
    );
  end if;

  perform set_config('app.identity_correction', 'off', true);

  return jsonb_build_object(
    'status', 'saved',
    'household_id', v_household.household_id,
    'kk_last4', substr(v_household_number, 13, 4),
    'changed', v_changed,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.admin_correct_household_number(uuid, text, timestamptz) from public;
revoke all on function public.admin_correct_household_number(uuid, text, timestamptz) from anon;
grant execute on function public.admin_correct_household_number(uuid, text, timestamptz) to authenticated;
