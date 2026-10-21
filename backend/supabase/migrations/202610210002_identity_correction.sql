-- Koreksi identitas warga (NIK/KK) oleh admin RT/RW atau Developer.
-- NIK lengkap hanya disimpan untuk data yang dikoreksi petugas; data lama
-- tetap hanya memiliki hash + 4 digit terakhir dan harus dikumpulkan ulang.

create table if not exists public.citizen_identity_private (
  citizen_id uuid primary key references public.citizens(citizen_id) on delete cascade,
  nik_full text not null check (nik_full ~ '^[0-9]{16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.citizen_identity_private is
  'Penyimpanan NIK lengkap khusus RPC koreksi identitas. Tidak memiliki policy akses langsung.';

alter table public.citizen_identity_private enable row level security;

revoke all on table public.citizen_identity_private from public;
revoke all on table public.citizen_identity_private from anon;
revoke all on table public.citizen_identity_private from authenticated;

-- Jalur lama admin_update_citizen_registration tidak boleh mengubah NIK/KK
-- tanpa menyimpan NIK lengkap. Hanya RPC koreksi di bawah yang boleh.
create or replace function public.guard_identity_column_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(new)->>'nik_hash') is not distinct from (to_jsonb(old)->>'nik_hash')
     and (to_jsonb(new)->>'household_number') is not distinct from (to_jsonb(old)->>'household_number') then
    return new;
  end if;
  if coalesce(current_setting('app.identity_correction', true), '') <> 'on' then
    raise exception using errcode = '42501',
      message = 'NIK dan nomor KK hanya dapat diubah melalui koreksi identitas petugas.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_citizen_identity on public.citizens;
create trigger trg_guard_citizen_identity
before update of nik_hash on public.citizens
for each row execute function public.guard_identity_column_changes();

drop trigger if exists trg_guard_household_number on public.households;
create trigger trg_guard_household_number
before update of household_number on public.households
for each row execute function public.guard_identity_column_changes();

create or replace function public.get_staff_citizen_identity(p_citizen_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_citizen public.citizens%rowtype;
  v_household public.households%rowtype;
  v_rt_code text;
  v_nik_full text;
  v_identity_updated_at timestamptz;
begin
  perform public.verification_guard();

  select * into v_citizen
  from public.citizens
  where citizen_id = p_citizen_id;

  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  select * into v_household
  from public.households
  where household_id = v_citizen.household_id;

  select code into v_rt_code
  from public.rts
  where rt_id = v_household.rt_id;

  select nik_full, updated_at
    into v_nik_full, v_identity_updated_at
  from public.citizen_identity_private
  where citizen_id = p_citizen_id;

  return jsonb_build_object(
    'citizen_id', v_citizen.citizen_id,
    'full_name', v_citizen.full_name,
    'nik_full', v_nik_full,
    'nik_available', v_nik_full is not null,
    'nik_last4', v_citizen.nik_last4,
    'household_id', v_citizen.household_id,
    'household_number', v_household.household_number,
    'rt_code', v_rt_code,
    'verification_status', v_citizen.verification_status,
    'updated_at', v_citizen.updated_at,
    'identity_updated_at', v_identity_updated_at
  );
end;
$$;

revoke all on function public.get_staff_citizen_identity(uuid) from public;
revoke all on function public.get_staff_citizen_identity(uuid) from anon;
grant execute on function public.get_staff_citizen_identity(uuid) to authenticated;

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
