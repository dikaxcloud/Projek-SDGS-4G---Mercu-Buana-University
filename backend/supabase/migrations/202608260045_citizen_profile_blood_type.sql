-- Warga dapat memperbarui golongan darah sendiri dari halaman Profil Saya.
-- Menambahkan p_blood_type pada update_my_citizen_profile dan menghapus
-- overload lama (text, text) supaya tidak ambigu.

create or replace function public.update_my_citizen_profile(
  p_full_name text default null,
  p_phone text default null,
  p_blood_type text default null
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
  v_blood text := nullif(trim(p_blood_type), '');
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
  if v_blood is not null and v_blood !~ '^(A|B|AB|O)[+-]$' then
    raise exception using errcode = '22023', message = 'Golongan darah tidak valid.';
  end if;

  select citizen_id into v_citizen_id from public.linked_accounts where user_id = auth.uid() limit 1;
  if v_citizen_id is null then
    raise exception using errcode = '42501', message = 'Profil warga belum terhubung.';
  end if;

  update public.citizens set full_name = v_name, phone = v_phone, blood_type = v_blood, updated_at = now()
  where citizen_id = v_citizen_id and is_active;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'update_limited_profile', 'citizen', v_citizen_id, jsonb_build_object('fields', jsonb_build_array('full_name', 'phone', 'blood_type')));

  return jsonb_build_object('status', 'updated', 'citizen_id', v_citizen_id);
end;
$$;

drop function if exists public.update_my_citizen_profile(text, text);

revoke all on function public.update_my_citizen_profile(text, text, text) from public;
grant execute on function public.update_my_citizen_profile(text, text, text) to authenticated;
