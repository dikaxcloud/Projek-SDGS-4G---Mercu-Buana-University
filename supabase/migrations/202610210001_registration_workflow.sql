-- Alur registrasi warga: pending -> pemeriksaan admin -> perbaikan -> verifikasi -> aktivasi.
-- Additive dan idempotent. Tidak menghapus data warga.

-- ============================================================
-- 1. Status verifikasi: tambah needs_correction
-- ============================================================
alter table public.citizens drop constraint if exists citizens_verification_status_check;
alter table public.citizens
  add constraint citizens_verification_status_check
  check (verification_status in ('pending', 'needs_correction', 'verified', 'rejected'));

create index if not exists citizens_verification_status_idx
  on public.citizens(verification_status);

-- Warga yang dibuat petugas/seed (tanpa akun terhubung) bukan pendaftar mandiri.
-- Tandai terverifikasi agar tidak muncul sebagai pendaftaran yang menunggu.
update public.citizens c
set verification_status = 'verified',
    verified_at = coalesce(c.verified_at, c.created_at),
    activated_at = coalesce(c.activated_at, c.created_at),
    updated_at = now()
where c.verification_status = 'pending'
  and not exists (
    select 1 from public.linked_accounts la where la.citizen_id = c.citizen_id
  );

-- ============================================================
-- 2. Guard khusus verifikasi (developer / rt_rw, bukan nakes)
-- ============================================================
create or replace function public.verification_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('developer', 'rt_rw') then
    raise exception using errcode = '42501', message = 'Hanya admin RT/RW atau Developer yang dapat melakukan aksi ini.';
  end if;
end;
$$;

revoke all on function public.verification_guard() from public;
grant execute on function public.verification_guard() to authenticated;

-- Akses warga hanya setelah terverifikasi DAN aktivasi selesai.
create or replace function public.citizen_access_ok(p_citizen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.linked_accounts la
    join public.citizens c on c.citizen_id = la.citizen_id
    where la.user_id = auth.uid()
      and la.citizen_id = p_citizen_id
      and c.verification_status = 'verified'
      and c.activated_at is not null
      and c.is_active
  );
$$;

revoke all on function public.citizen_access_ok(uuid) from public;
grant execute on function public.citizen_access_ok(uuid) to authenticated;

-- Warga yang dibuat petugas langsung dianggap terverifikasi dan aktif,
-- sehingga tidak masuk antrean pendaftaran mandiri.
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

  v_hash := encode(extensions.digest(v_digits, 'sha256'), 'hex');
  select c.citizen_id into v_existing from public.citizens c where c.nik_hash = v_hash limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'citizen_id', v_existing);
  end if;

  begin
    insert into public.citizens (
      household_id, nik_hash, nik_last4, full_name, phone, birth_date,
      gender, blood_type, family_relation,
      verification_status, verified_at, verified_by, activated_at
    ) values (
      p_household_id, v_hash, right(v_digits, 4), trim(p_full_name), nullif(trim(p_phone), ''),
      p_birth_date, p_gender, p_blood_type, nullif(trim(p_family_relation), ''),
      'verified', now(), auth.uid(), now()
    ) returning citizen_id into v_citizen_id;
  exception when unique_violation then
    select c.citizen_id into v_existing from public.citizens c where c.nik_hash = v_hash limit 1;
    return jsonb_build_object('status', 'duplicate', 'citizen_id', v_existing);
  end;

  perform public._issue_citizen_qr(v_citizen_id);

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'create', 'citizen', v_citizen_id, jsonb_build_object('source', 'staff_dashboard'));

  return jsonb_build_object('status', 'created', 'citizen_id', v_citizen_id);
end;
$$;

-- ============================================================
-- 3. Minta perbaikan data
-- ============================================================
create or replace function public.admin_request_correction(
  p_citizen_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row public.citizens%rowtype;
begin
  perform public.verification_guard();

  if v_note is null then
    raise exception using errcode = '22023', message = 'Catatan perbaikan wajib diisi.';
  end if;
  if length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'Catatan perbaikan maksimal 500 karakter.';
  end if;

  select * into v_row from public.citizens where citizen_id = p_citizen_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if v_row.verification_status not in ('pending', 'needs_correction', 'rejected') then
    raise exception using errcode = '22023', message = 'Status pendaftaran tidak dapat diminta perbaikan.';
  end if;

  update public.citizens
  set verification_status = 'needs_correction',
      verification_note = v_note,
      verified_at = null,
      verified_by = null,
      activated_at = null,
      activation_token_hash = null,
      activation_code_hash = null,
      activation_expires_at = null,
      pairing_method = null,
      updated_at = now()
  where citizen_id = p_citizen_id;

  update public.citizen_qr_codes
  set status = 'REVOKED', revoked_at = now(), updated_at = now()
  where citizen_id = p_citizen_id and status = 'ACTIVE';

  insert into public.notifications (user_id, title, message, notification_type)
  select la.user_id, 'Perbaikan data diperlukan',
         'Data pendaftaran Anda perlu diperbaiki. Catatan petugas: ' || v_note || ' Silakan perbaiki melalui halaman status pendaftaran.',
         'verification'
  from public.linked_accounts la where la.citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'request_correction', 'citizen', p_citizen_id,
          jsonb_build_object('note_length', length(v_note)));

  return jsonb_build_object('status', 'needs_correction');
end;
$$;

revoke all on function public.admin_request_correction(uuid, text) from public;
grant execute on function public.admin_request_correction(uuid, text) to authenticated;

-- ============================================================
-- 4. Detail pemeriksaan lengkap (admin)
-- ============================================================
create or replace function public.get_citizen_registration_detail(p_citizen_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_user_id uuid;
  v_email text;
  v_activated timestamptz;
begin
  perform public.verification_guard();

  select c.activated_at into v_activated from public.citizens c where c.citizen_id = p_citizen_id;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'birth_place', c.birth_place,
    'birth_date', c.birth_date,
    'gender', c.gender,
    'blood_type', c.blood_type,
    'family_relation', c.family_relation,
    'phone', c.phone,
    'address', c.address,
    'is_active', c.is_active,
    'verification_status', c.verification_status,
    'verification_note', c.verification_note,
    'verified_at', c.verified_at,
    'activated_at', c.activated_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'activation_state', case
      when c.verification_status <> 'verified' then 'not_verified'
      when c.activated_at is not null then 'activated'
      when c.activation_expires_at is not null and c.activation_expires_at > now()
           and (c.activation_token_hash is not null or c.activation_code_hash is not null) then 'code_issued'
      else 'pending_activation'
    end,
    'household', jsonb_build_object(
      'household_id', h.household_id,
      'household_number', h.household_number,
      'head_name', h.head_name,
      'address', h.address,
      'rt_code', r.code
    )
  )
  into v_result
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = p_citizen_id;

  select la.user_id into v_user_id
  from public.linked_accounts la
  where la.citizen_id = p_citizen_id
  limit 1;

  if v_user_id is not null then
    select u.email into v_email from auth.users u where u.id = v_user_id limit 1;
  end if;

  return v_result || jsonb_build_object(
    'google', jsonb_build_object('connected', v_user_id is not null, 'email', v_email),
    'has_pending_activation', v_activated is null
      and coalesce((v_result ->> 'activation_state') = 'code_issued', false)
  );
end;
$$;

revoke all on function public.get_citizen_registration_detail(uuid) from public;
grant execute on function public.get_citizen_registration_detail(uuid) to authenticated;

-- ============================================================
-- 5. Admin memperbaiki data pendaftaran (tanpa menyetujui)
-- ============================================================
create or replace function public.admin_update_citizen_registration(
  p_citizen_id uuid,
  p_full_name text,
  p_nik text default null,
  p_birth_place text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_blood_type text default null,
  p_family_relation text default null,
  p_phone text default null,
  p_address text default null,
  p_household_id uuid default null,
  p_household_number text default null,
  p_household_head_name text default null,
  p_household_address text default null,
  p_is_active boolean default true,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.citizens%rowtype;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_digits text;
  v_hash text;
  v_blood text := nullif(trim(coalesce(p_blood_type, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_gender text := nullif(lower(trim(coalesce(p_gender, ''))), '');
  v_kk text;
  v_household_id uuid;
  v_target_household uuid;
  v_changed text[] := array[]::text[];
  v_new_updated timestamptz;
begin
  perform public.verification_guard();

  if v_name is null or length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'Nama lengkap tidak valid.';
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    raise exception using errcode = '22023', message = 'Nomor telepon tidak valid.';
  end if;
  if v_blood is not null and v_blood !~ '^(A|B|AB|O)[+-]$' then
    raise exception using errcode = '22023', message = 'Golongan darah tidak valid.';
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    raise exception using errcode = '22023', message = 'Tanggal lahir tidak valid.';
  end if;
  if v_gender is not null and v_gender not in ('laki-laki', 'perempuan', 'lainnya') then
    raise exception using errcode = '22023', message = 'Jenis kelamin tidak valid.';
  end if;

  select * into v_row from public.citizens where citizen_id = p_citizen_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v_row.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception using errcode = '40001',
      message = 'Data telah berubah sejak terakhir dimuat. Muat ulang data sebelum menyimpan.';
  end if;

  if p_nik is not null and nullif(trim(p_nik), '') is not null then
    v_digits := regexp_replace(p_nik, '[^0-9]', '', 'g');
    if v_digits !~ '^[0-9]{16}$' then
      raise exception using errcode = '22023', message = 'NIK harus terdiri dari 16 digit angka.';
    end if;
    v_hash := encode(extensions.digest(v_digits, 'sha256'), 'hex');
    if exists (select 1 from public.citizens where nik_hash = v_hash and citizen_id <> p_citizen_id) then
      raise exception using errcode = '23505', message = 'NIK tersebut sudah terdaftar pada warga lain.';
    end if;
    if v_hash is distinct from v_row.nik_hash then
      v_changed := array_append(v_changed, 'nik');
    end if;
  end if;

  v_household_id := v_row.household_id;

  if p_household_id is not null then
    select household_id into v_target_household
    from public.households where household_id = p_household_id;
    if v_target_household is null then
      raise exception using errcode = '22023', message = 'Kartu keluarga tidak ditemukan.';
    end if;
    v_household_id := v_target_household;
  end if;

  if p_household_number is not null and nullif(trim(p_household_number), '') is not null then
    v_kk := upper(regexp_replace(trim(p_household_number), '[\s-]', '', 'g'));
    if length(v_kk) < 3 or length(v_kk) > 30 then
      raise exception using errcode = '22023', message = 'Nomor KK tidak valid (3-30 karakter).';
    end if;

    select h.household_id into v_target_household
    from public.households h
    where h.rt_id = (select hh.rt_id from public.households hh where hh.household_id = v_household_id)
      and upper(regexp_replace(h.household_number, '[\s-]', '', 'g')) = v_kk
    limit 1;

    if v_target_household is not null then
      v_household_id := v_target_household;
    else
      update public.households
      set household_number = v_kk
      where household_id = v_household_id;
      v_changed := array_append(v_changed, 'household_number');
    end if;
  end if;

  if p_household_head_name is not null and nullif(trim(p_household_head_name), '') is not null then
    if length(trim(p_household_head_name)) > 120 then
      raise exception using errcode = '22023', message = 'Nama kepala keluarga tidak valid.';
    end if;
    update public.households set head_name = trim(p_household_head_name)
    where household_id = v_household_id;
    v_changed := array_append(v_changed, 'head_name');
  end if;

  if p_household_address is not null then
    update public.households set address = nullif(trim(p_household_address), '')
    where household_id = v_household_id;
    v_changed := array_append(v_changed, 'household_address');
  end if;

  if v_row.full_name is distinct from v_name then v_changed := array_append(v_changed, 'full_name'); end if;
  if v_row.birth_place is distinct from nullif(trim(coalesce(p_birth_place, '')), '') then v_changed := array_append(v_changed, 'birth_place'); end if;
  if v_row.birth_date is distinct from p_birth_date then v_changed := array_append(v_changed, 'birth_date'); end if;
  if v_row.gender is distinct from v_gender then v_changed := array_append(v_changed, 'gender'); end if;
  if v_row.blood_type is distinct from v_blood then v_changed := array_append(v_changed, 'blood_type'); end if;
  if v_row.family_relation is distinct from nullif(trim(coalesce(p_family_relation, '')), '') then v_changed := array_append(v_changed, 'family_relation'); end if;
  if v_row.phone is distinct from v_phone then v_changed := array_append(v_changed, 'phone'); end if;
  if v_row.address is distinct from nullif(trim(coalesce(p_address, '')), '') then v_changed := array_append(v_changed, 'address'); end if;
  if v_row.is_active is distinct from coalesce(p_is_active, v_row.is_active) then v_changed := array_append(v_changed, 'is_active'); end if;

  update public.citizens
  set full_name = v_name,
      nik_hash = coalesce(v_hash, nik_hash),
      nik_last4 = case when v_hash is not null then right(v_digits, 4) else nik_last4 end,
      birth_place = nullif(trim(coalesce(p_birth_place, '')), ''),
      birth_date = p_birth_date,
      gender = v_gender,
      blood_type = v_blood,
      family_relation = nullif(trim(coalesce(p_family_relation, '')), ''),
      phone = v_phone,
      address = nullif(trim(coalesce(p_address, '')), ''),
      household_id = v_household_id,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where citizen_id = p_citizen_id
  returning updated_at into v_new_updated;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'update_registration', 'citizen', p_citizen_id,
          jsonb_build_object('fields', to_jsonb(v_changed)));

  return jsonb_build_object('status', 'updated', 'citizen_id', p_citizen_id, 'updated_at', v_new_updated);
end;
$$;

revoke all on function public.admin_update_citizen_registration(uuid, text, text, text, date, text, text, text, text, text, uuid, text, text, text, boolean, timestamptz) from public;
grant execute on function public.admin_update_citizen_registration(uuid, text, text, text, date, text, text, text, text, text, uuid, text, text, text, boolean, timestamptz) to authenticated;

-- ============================================================
-- 6. Warga memperbaiki data miliknya sendiri
-- ============================================================
create or replace function public.update_my_registration(
  p_full_name text,
  p_birth_place text default null,
  p_birth_date date default null,
  p_gender text default null,
  p_blood_type text default null,
  p_family_relation text default null,
  p_phone text default null,
  p_address text default null,
  p_household_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row public.citizens%rowtype;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_blood text := nullif(trim(coalesce(p_blood_type, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_gender text := nullif(lower(trim(coalesce(p_gender, ''))), '');
  v_recent integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'Nama lengkap tidak valid.';
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    raise exception using errcode = '22023', message = 'Nomor telepon tidak valid.';
  end if;
  if v_blood is not null and v_blood !~ '^(A|B|AB|O)[+-]$' then
    raise exception using errcode = '22023', message = 'Golongan darah tidak valid.';
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    raise exception using errcode = '22023', message = 'Tanggal lahir tidak valid.';
  end if;
  if v_gender is not null and v_gender not in ('laki-laki', 'perempuan', 'lainnya') then
    raise exception using errcode = '22023', message = 'Jenis kelamin tidak valid.';
  end if;

  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then
    raise exception using errcode = '42501', message = 'Profil warga belum terhubung.';
  end if;

  select count(*) into v_recent from public.audit_logs
  where actor_user_id = v_uid and action = 'update_own_registration' and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception using errcode = '54000', message = 'Terlalu banyak percobaan. Coba lagi nanti.';
  end if;

  select * into v_row from public.citizens where citizen_id = v_citizen for update;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if v_row.verification_status not in ('pending', 'needs_correction', 'rejected') then
    raise exception using errcode = '22023', message = 'Data Anda sudah diverifikasi. Hubungi petugas untuk perubahan.';
  end if;

  if p_household_id is not null and not exists (
    select 1 from public.households where household_id = p_household_id
  ) then
    raise exception using errcode = '22023', message = 'Kartu keluarga tidak ditemukan.';
  end if;

  update public.citizens
  set full_name = v_name,
      birth_place = nullif(trim(coalesce(p_birth_place, '')), ''),
      birth_date = p_birth_date,
      gender = v_gender,
      blood_type = v_blood,
      family_relation = nullif(trim(coalesce(p_family_relation, '')), ''),
      phone = v_phone,
      address = nullif(trim(coalesce(p_address, '')), ''),
      household_id = coalesce(p_household_id, household_id),
      verification_status = 'pending',
      verification_note = null,
      verified_at = null,
      verified_by = null,
      activated_at = null,
      activation_token_hash = null,
      activation_code_hash = null,
      activation_expires_at = null,
      pairing_method = null,
      updated_at = now()
  where citizen_id = v_citizen;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_uid, 'update_own_registration', 'citizen', v_citizen,
          jsonb_build_object('fields', jsonb_build_array(
            'full_name', 'birth_place', 'birth_date', 'gender', 'blood_type',
            'family_relation', 'phone', 'address'
          )));

  return jsonb_build_object('status', 'submitted', 'citizen_id', v_citizen);
end;
$$;

revoke all on function public.update_my_registration(text, text, date, text, text, text, text, text, uuid) from public;
grant execute on function public.update_my_registration(text, text, date, text, text, text, text, text, uuid) to authenticated;

-- ============================================================
-- 7. Verifikasi: hanya admin, tanpa menerbitkan QR aktivasi
-- ============================================================
create or replace function public.admin_verify_citizen(
  p_citizen_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.citizens%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.verification_guard();

  if p_approve is null then
    raise exception using errcode = '22023', message = 'Keputusan verifikasi tidak valid.';
  end if;
  if not p_approve and v_reason is null then
    raise exception using errcode = '22023', message = 'Alasan penolakan wajib diisi.';
  end if;

  select * into v_row from public.citizens where citizen_id = p_citizen_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;

  if p_approve then
    if v_row.verification_status = 'verified' then
      return jsonb_build_object('status', 'already_verified');
    end if;
    if v_row.verification_status not in ('pending', 'needs_correction') then
      raise exception using errcode = '22023', message = 'Pendaftaran berstatus ditolak. Minta warga memperbaiki data terlebih dahulu.';
    end if;

    update public.citizens
    set verification_status = 'verified',
        verification_note = null,
        verified_at = now(),
        verified_by = auth.uid(),
        activated_at = null,
        activation_token_hash = null,
        activation_code_hash = null,
        activation_expires_at = null,
        pairing_method = null,
        updated_at = now()
    where citizen_id = p_citizen_id;

    perform public._issue_citizen_qr(p_citizen_id);

    insert into public.notifications (user_id, title, message, notification_type)
    select la.user_id, 'Pendaftaran disetujui',
           'Data Anda telah diverifikasi petugas. Tunggu QR aktivasi dari petugas untuk membuka akun.',
           'verification'
    from public.linked_accounts la where la.citizen_id = p_citizen_id;

    insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'verify', 'citizen', p_citizen_id,
            jsonb_build_object('previous_status', v_row.verification_status));

    return jsonb_build_object('status', 'verified');
  end if;

  if v_row.verification_status not in ('pending', 'needs_correction') then
    raise exception using errcode = '22023', message = 'Pendaftaran ini tidak dapat ditolak pada status saat ini.';
  end if;

  update public.citizens
  set verification_status = 'rejected',
      verification_note = v_reason,
      verified_at = null,
      verified_by = null,
      activated_at = null,
      activation_token_hash = null,
      activation_code_hash = null,
      activation_expires_at = null,
      pairing_method = null,
      updated_at = now()
  where citizen_id = p_citizen_id;

  update public.citizen_qr_codes
  set status = 'REVOKED', revoked_at = now(), updated_at = now()
  where citizen_id = p_citizen_id and status = 'ACTIVE';

  insert into public.notifications (user_id, title, message, notification_type)
  select la.user_id, 'Pendaftaran ditolak',
         'Data pendaftaran Anda ditolak. Alasan: ' || v_reason || ' Silakan hubungi petugas desa.',
         'verification'
  from public.linked_accounts la where la.citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'reject', 'citizen', p_citizen_id,
          jsonb_build_object('reason_length', length(v_reason)));

  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.admin_verify_citizen(uuid, boolean, text) from public;
grant execute on function public.admin_verify_citizen(uuid, boolean, text) to authenticated;

-- ============================================================
-- 8. Penerbitan QR aktivasi hanya setelah verified
-- ============================================================
create or replace function public.admin_issue_activation(p_citizen_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw bytea := extensions.gen_random_bytes(32);
  v_token text := replace(replace(replace(encode(v_raw, 'base64'), '+', ''), '/', ''), '=', '');
  v_code text := public._generate_pairing_code();
  v_code_hash text := encode(extensions.digest(replace(v_code, '-', ''), 'sha256'), 'hex');
  v_row public.citizens%rowtype;
begin
  perform public.verification_guard();

  select * into v_row from public.citizens where citizen_id = p_citizen_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.';
  end if;
  if v_row.verification_status <> 'verified' then
    raise exception using errcode = '22023', message = 'Hanya warga terverifikasi yang dapat diberi QR aktivasi.';
  end if;
  if v_row.activated_at is not null then
    raise exception using errcode = '22023', message = 'Akun warga sudah aktif.';
  end if;

  update public.citizens
  set activation_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      activation_code_hash = v_code_hash,
      activation_expires_at = now() + interval '30 minutes',
      activated_at = null,
      pairing_method = null,
      updated_at = now()
  where citizen_id = p_citizen_id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'issue_activation', 'citizen', p_citizen_id,
          jsonb_build_object('expires_in_minutes', 30, 'has_pairing_code', true));

  return jsonb_build_object('status', 'issued', 'token', v_token, 'code', v_code, 'expires_in_minutes', 30);
end;
$$;

revoke all on function public.admin_issue_activation(uuid) from public;
grant execute on function public.admin_issue_activation(uuid) to authenticated;

-- ============================================================
-- 9. Aktivasi memeriksa status verified
-- ============================================================
create or replace function public.activate_my_account(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row public.citizens%rowtype;
  v_clean text := upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text := encode(extensions.digest(v_clean, 'sha256'), 'hex');
  v_matched boolean := false;
  v_method text;
  v_hash_whitespace text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then return jsonb_build_object('status', 'no_citizen'); end if;

  select * into v_row from public.citizens where citizen_id = v_citizen for update;
  if not found or not v_row.is_active then
    return jsonb_build_object('status', 'inactive');
  end if;
  if v_row.verification_status <> 'verified' then
    return jsonb_build_object('status', 'not_verified');
  end if;
  if v_row.activated_at is not null then
    return jsonb_build_object('status', 'already_active');
  end if;

  if v_row.activation_token_hash is not null then
    v_hash_whitespace := encode(extensions.digest(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'), 'sha256'), 'hex');
    if v_row.activation_token_hash = v_hash
       or v_row.activation_token_hash = v_hash_whitespace
       or v_row.activation_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
      v_matched := true;
      v_method := 'qr';
    end if;
  end if;

  if not v_matched and v_row.activation_code_hash is not null and v_row.activation_code_hash = v_hash then
    v_matched := true;
    v_method := 'pairing_code';
  end if;

  if not v_matched then return jsonb_build_object('status', 'invalid_token'); end if;
  if v_row.activation_expires_at is null or v_row.activation_expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  update public.citizens
  set activated_at = now(),
      activation_token_hash = null,
      activation_code_hash = null,
      activation_expires_at = null,
      pairing_method = v_method,
      updated_at = now()
  where citizen_id = v_citizen;

  insert into public.notifications (user_id, title, message, notification_type)
  values (v_uid, 'Akun berhasil diaktifkan',
          'Selamat! Akun kesehatan Anda kini aktif dan siap digunakan.', 'activation');

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_uid, 'activate', 'citizen', v_citizen, jsonb_build_object('method', v_method));

  return jsonb_build_object('status', 'activated', 'method', v_method);
end;
$$;

revoke all on function public.activate_my_account(text) from public;
grant execute on function public.activate_my_account(text) to authenticated;

-- ============================================================
-- 10. Konteks warga: status + data perbaikan
-- ============================================================
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
  v_family jsonb := '[]'::jsonb;
  v_email_verified boolean;
  v_can_edit boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  select la.citizen_id into v_citizen_id
  from public.linked_accounts la
  where la.user_id = auth.uid()
  limit 1;

  select coalesce(email_verified, false) into v_email_verified
  from public.profiles where user_id = auth.uid();

  if v_citizen_id is null then
    return jsonb_build_object('profile', null, 'family', '[]'::jsonb, 'email_verified', coalesce(v_email_verified, false));
  end if;

  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'household_number', h.household_number,
    'household_head_name', h.head_name,
    'household_address', h.address,
    'rt_code', r.code,
    'birth_place', c.birth_place,
    'birth_date', c.birth_date,
    'gender', c.gender,
    'blood_type', c.blood_type,
    'family_relation', c.family_relation,
    'phone', c.phone,
    'address', c.address,
    'is_active', c.is_active,
    'verification_status', c.verification_status,
    'verification_note', c.verification_note,
    'verified_at', c.verified_at,
    'activated_at', c.activated_at,
    'pairing_method', c.pairing_method,
    'created_at', c.created_at,
    'email_verified', coalesce(v_email_verified, false)
  ), c.household_id
  into v_profile, v_household_id
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = v_citizen_id;

  if v_profile is null then
    return jsonb_build_object('profile', null, 'family', '[]'::jsonb, 'email_verified', coalesce(v_email_verified, false));
  end if;

  v_can_edit := (v_profile ->> 'verification_status') in ('pending', 'needs_correction', 'rejected');

  if (v_profile ->> 'verification_status') = 'verified'
     and (v_profile ->> 'activated_at') is not null
     and coalesce((v_profile ->> 'is_active')::boolean, false) then
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
  end if;

  return jsonb_build_object(
    'profile', v_profile,
    'family', v_family,
    'email_verified', coalesce(v_email_verified, false),
    'can_edit', v_can_edit
  );
end;
$$;

revoke all on function public.get_my_citizen_context() from public;
grant execute on function public.get_my_citizen_context() to authenticated;

-- ============================================================
-- 11. Daftar warga: kolom + filter status baru
-- ============================================================
drop function if exists public.list_staff_citizens(text, text, text, integer, integer);

create function public.list_staff_citizens(
  p_query text default '',
  p_rt text default '',
  p_status text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  citizen_id uuid,
  full_name text,
  nik_last4 text,
  household_number text,
  rt_code text,
  phone text,
  gender text,
  blood_type text,
  birth_date date,
  family_relation text,
  is_active boolean,
  google_connected boolean,
  verification_status text,
  verification_note text,
  created_at timestamptz,
  activated_at timestamptz,
  activation_status text,
  last_examined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_rt text := left(trim(coalesce(p_rt, '')), 10);
  v_status text := lower(left(trim(coalesce(p_status, '')), 24));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.staff_guard();
  return query
  with latest_exam as (
    select hr.citizen_id, max(hr.examined_at) as last_at
    from public.health_records hr
    group by hr.citizen_id
  )
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code,
         c.phone, c.gender, c.blood_type, c.birth_date, c.family_relation, c.is_active,
         (la.linked_account_id is not null) as google_connected,
         c.verification_status::text,
         c.verification_note,
         c.created_at,
         c.activated_at,
         case
           when c.verification_status <> 'verified' then c.verification_status::text
           when c.activated_at is not null then 'activated'
           else 'pending_activation'
         end as activation_status,
         le.last_at
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  left join public.linked_accounts la on la.citizen_id = c.citizen_id
  left join latest_exam le on le.citizen_id = c.citizen_id
  where (
      v_query = ''
      or c.full_name ilike '%' || v_query || '%'
      or c.nik_last4 = right(regexp_replace(v_query, '[^0-9]', '', 'g'), 4)
      or h.household_number ilike '%' || v_query || '%'
    )
    and (v_rt = '' or upper(r.code) = upper(v_rt))
    and (
      v_status = ''
      or (v_status = 'active' and c.is_active)
      or (v_status = 'inactive' and not c.is_active)
      or (v_status = 'connected' and la.linked_account_id is not null)
      or (v_status = 'pending' and la.linked_account_id is null)
      or (v_status = 'pending_verification' and c.verification_status = 'pending')
      or (v_status = 'needs_correction' and c.verification_status = 'needs_correction')
      or (v_status = 'pending_all' and c.verification_status in ('pending', 'needs_correction'))
      or (v_status = 'verified' and c.verification_status = 'verified')
      or (v_status = 'rejected' and c.verification_status = 'rejected')
      or (v_status = 'pending_activation' and c.verification_status = 'verified' and c.activated_at is null and c.is_active)
      or (v_status = 'active_citizen' and c.verification_status = 'verified' and c.activated_at is not null and c.is_active)
    )
  order by c.created_at desc, c.full_name
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_staff_citizens(text, text, text, integer, integer) from public;
grant execute on function public.list_staff_citizens(text, text, text, integer, integer) to authenticated;

-- ============================================================
-- 12. Detail warga untuk petugas: field verifikasi lengkap
-- ============================================================
create or replace function public.get_staff_citizen_detail(p_citizen_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    'birth_place', c.birth_place,
    'birth_date', c.birth_date,
    'gender', c.gender,
    'blood_type', c.blood_type,
    'family_relation', c.family_relation,
    'address', c.address,
    'is_active', c.is_active,
    'verification_status', c.verification_status,
    'verification_note', c.verification_note,
    'verified_at', c.verified_at,
    'activated_at', c.activated_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'activation_state', case
      when c.verification_status <> 'verified' then 'not_verified'
      when c.activated_at is not null then 'activated'
      when c.activation_expires_at is not null and c.activation_expires_at > now()
           and (c.activation_token_hash is not null or c.activation_code_hash is not null) then 'code_issued'
      else 'pending_activation'
    end,
    'household', jsonb_build_object(
      'household_id', h.household_id,
      'household_number', h.household_number,
      'head_name', h.head_name,
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
  if v_user_id is not null then
    select u.email into v_email from auth.users u where u.id = v_user_id limit 1;
  end if;

  v_result := jsonb_set(v_result, '{google}', jsonb_build_object('connected', v_user_id is not null, 'email', v_email));
  return v_result;
end;
$$;

revoke all on function public.get_staff_citizen_detail(uuid) from public;
grant execute on function public.get_staff_citizen_detail(uuid) to authenticated;

-- ============================================================
-- 13. Ringkasan admin: warga aktif = verified + activated
-- ============================================================
create or replace function public.get_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now());
  v_week_ago timestamptz := date_trunc('day', now()) - interval '6 days';
  v_rts jsonb;
  v_recent jsonb;
  v_active integer;
begin
  perform public.admin_guard();

  select count(*)::integer into v_active
  from public.citizens c
  where c.is_active
    and c.verification_status = 'verified'
    and c.activated_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object('label', r.code, 'total', coalesce(x.total, 0)) order by r.code), '[]'::jsonb)
    into v_rts
  from public.rts r
  left join (
    select h.rt_id, count(*)::integer as total
    from public.households h
    group by h.rt_id
  ) x on x.rt_id = r.rt_id;

  select coalesce(jsonb_agg(row order by (row->>'examined_at') desc), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
      'health_record_id', hr.health_record_id,
      'citizen_name', c.full_name,
      'summary', coalesce(
        nullif(concat_ws(' - ',
          case when bp.systolic is not null then bp.systolic || '/' || bp.diastolic || ' mmHg' end,
          case when bs.value_mg_dl is not null then bs.value_mg_dl || ' mg/dL' end,
          case when w.weight_kg is not null then w.weight_kg || ' kg' end), ''), 'Pemeriksaan umum'),
      'examined_at', hr.examined_at,
      'examiner', coalesce(hw.full_name, p.display_name, 'Nakes')
    ) row
    from public.health_records hr
    join public.citizens c on c.citizen_id = hr.citizen_id
    left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
    left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
    left join public.weight_records w on w.health_record_id = hr.health_record_id
    left join public.profiles p on p.user_id = hr.examiner_user_id
    left join public.health_workers hw on hw.user_id = hr.examiner_user_id and hw.is_active
    order by hr.examined_at desc
    limit 6
  ) recent_rows;

  return jsonb_build_object(
    'totalCitizens', v_active,
    'totalHouseholds', (select count(*)::integer from public.households),
    'totalRts', (select count(*)::integer from public.rts),
    'totalHealthWorkers', (select count(*)::integer from public.health_workers where is_active),
    'todayExaminations', (select count(*)::integer from public.health_records where examined_at >= v_today),
    'weekExaminations', (select count(*)::integer from public.health_records where examined_at >= v_week_ago),
    'neverExaminedCitizens', (
      select count(*)::integer from public.citizens c
      where c.is_active and c.verification_status = 'verified' and c.activated_at is not null
        and not exists (select 1 from public.health_records hr where hr.citizen_id = c.citizen_id)
    ),
    'newCitizensThisWeek', (
      select count(*)::integer from public.citizens c
      where c.is_active and c.verification_status = 'verified' and c.activated_at is not null
        and c.created_at >= v_week_ago
    ),
    'pendingVerifications', (
      select count(*)::integer from public.citizens
      where verification_status in ('pending', 'needs_correction')
    ),
    'needsCorrection', (
      select count(*)::integer from public.citizens
      where verification_status = 'needs_correction'
    ),
    'rejectedRegistrations', (
      select count(*)::integer from public.citizens
      where verification_status = 'rejected'
    ),
    'verifiedNotActivated', (
      select count(*)::integer from public.citizens
      where verification_status = 'verified' and activated_at is null and is_active
    ),
    'rtDistribution', v_rts,
    'recentExaminations', v_recent
  );
end;
$$;

revoke all on function public.get_admin_summary() from public;
grant execute on function public.get_admin_summary() to authenticated;

-- ============================================================
-- 14. RLS: data privat hanya untuk warga yang sudah aktif
-- ============================================================
drop policy if exists "citizen own or staff read" on public.citizens;
create policy "citizen own or staff read" on public.citizens for select using (
  public.citizen_access_ok(citizen_id)
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

drop policy if exists "health own or staff read" on public.health_records;
create policy "health own or staff read" on public.health_records for select using (
  public.citizen_access_ok(citizen_id)
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

drop policy if exists "health details own or staff read" on public.blood_pressure_records;
create policy "health details own or staff read" on public.blood_pressure_records for select
  using (exists (
    select 1 from public.health_records r
    where r.health_record_id = health_record_id
      and (public.citizen_access_ok(r.citizen_id) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  ));

drop policy if exists "sugar details owner or staff" on public.blood_sugar_records;
create policy "sugar details owner or staff" on public.blood_sugar_records for select
  using (exists (
    select 1 from public.health_records r
    where r.health_record_id = health_record_id
      and (public.citizen_access_ok(r.citizen_id) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  ));

drop policy if exists "weight details owner or staff" on public.weight_records;
create policy "weight details owner or staff" on public.weight_records for select
  using (exists (
    select 1 from public.health_records r
    where r.health_record_id = health_record_id
      and (public.citizen_access_ok(r.citizen_id) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  ));

drop policy if exists "temperature details owner or staff" on public.temperature_records;
create policy "temperature details owner or staff" on public.temperature_records for select
  using (exists (
    select 1 from public.health_records r
    where r.health_record_id = health_record_id
      and (public.citizen_access_ok(r.citizen_id) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  ));

drop policy if exists "pulse details owner or staff" on public.pulse_records;
create policy "pulse details owner or staff" on public.pulse_records for select
  using (exists (
    select 1 from public.health_records r
    where r.health_record_id = health_record_id
      and (public.citizen_access_ok(r.citizen_id) or public.current_app_role() in ('nakes', 'developer', 'rt_rw'))
  ));

drop policy if exists "ai_analyses_own_or_staff_read" on public.ai_health_analyses;
create policy "ai_analyses_own_or_staff_read" on public.ai_health_analyses for select using (
  public.citizen_access_ok(citizen_id)
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

drop policy if exists "citizen qr own or staff read" on public.citizen_qr_codes;
create policy "citizen qr own or staff read" on public.citizen_qr_codes for select using (
  public.citizen_access_ok(citizen_id)
  or public.current_app_role() in ('nakes', 'developer', 'rt_rw')
);

-- ============================================================
-- 15. RPC warga: pemeriksaan akses di server
-- ============================================================
create or replace function public.list_my_health_history(p_limit integer default 20, p_offset integer default 0)
returns table (
  health_record_id uuid, examined_at timestamptz, complaint text,
  systolic integer, diastolic integer, sugar numeric, sugar_context text,
  weight_kg numeric, height_cm numeric, temperature_c numeric, pulse_bpm integer,
  examiner_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;
  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then return; end if;
  if not public.citizen_access_ok(v_citizen) then
    raise exception using errcode = '42501', message = 'Akun warga belum aktif.';
  end if;

  return query
  select hr.health_record_id, hr.examined_at, hr.complaint,
         bp.systolic, bp.diastolic, bs.value_mg_dl, bs.context::text,
         w.weight_kg, w.height_cm, t.temperature_c, pu.pulse_bpm,
         coalesce(hw.full_name, p.display_name, 'Nakes Desa')
  from public.health_records hr
  left join public.blood_pressure_records bp on bp.health_record_id = hr.health_record_id
  left join public.blood_sugar_records bs on bs.health_record_id = hr.health_record_id
  left join public.weight_records w on w.health_record_id = hr.health_record_id
  left join public.temperature_records t on t.health_record_id = hr.health_record_id
  left join public.pulse_records pu on pu.health_record_id = hr.health_record_id
  left join public.profiles p on p.user_id = hr.examiner_user_id
  left join public.health_workers hw on hw.user_id = hr.examiner_user_id and hw.is_active
  where hr.citizen_id = v_citizen
  order by hr.examined_at desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_my_health_history(integer, integer) from public;
grant execute on function public.list_my_health_history(integer, integer) to authenticated;

create or replace function public.get_my_citizen_qr()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_citizen uuid;
  v_row record;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.'; end if;
  select la.citizen_id into v_citizen from public.linked_accounts la where la.user_id = v_uid limit 1;
  if v_citizen is null then return jsonb_build_object('state', 'no_citizen'); end if;
  if not public.citizen_access_ok(v_citizen) then
    raise exception using errcode = '42501', message = 'Akun warga belum aktif.';
  end if;

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

revoke all on function public.get_my_citizen_qr() from public;
grant execute on function public.get_my_citizen_qr() to authenticated;

-- ============================================================
-- 16. Perbaikan guard role lama pada RPC pencarian petugas
-- ============================================================
create or replace function public.search_citizens(p_query text default '', p_limit integer default 20)
returns table (
  citizen_id uuid,
  full_name text,
  nik_last4 text,
  household_number text,
  rt_code text,
  gender text,
  birth_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  perform public.staff_guard();
  return query
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code, c.gender, c.birth_date
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.is_active
    and (v_query = '' or c.full_name ilike '%' || v_query || '%' or h.household_number ilike '%' || v_query || '%' or r.code ilike '%' || v_query || '%')
  order by c.full_name
  limit v_limit;
end;
$$;

revoke all on function public.search_citizens(text, integer) from public;
grant execute on function public.search_citizens(text, integer) to authenticated;

create or replace function public.get_citizen_by_id(p_citizen_id uuid)
returns table (
  citizen_id uuid,
  full_name text,
  nik_last4 text,
  household_number text,
  rt_code text,
  gender text,
  birth_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.staff_guard();
  return query
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code, c.gender, c.birth_date
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where c.citizen_id = p_citizen_id and c.is_active;
end;
$$;

revoke all on function public.get_citizen_by_id(uuid) from public;
grant execute on function public.get_citizen_by_id(uuid) to authenticated;
