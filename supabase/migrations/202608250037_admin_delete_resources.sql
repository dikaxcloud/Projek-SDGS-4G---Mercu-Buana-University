-- Admin delete features: citizens, households, RTs, health workers, user accounts.
-- All admin-only (admin_guard), audited. Citizens delete cascades health records,
-- linked accounts, QR codes, link tokens & AI analyses (FK ON DELETE CASCADE).
-- Households/RTs are guarded: cannot delete while members/KK still exist.

create or replace function public.admin_delete_citizen(p_citizen_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_records integer;
begin
  perform public.admin_guard();
  select full_name into v_name from public.citizens where citizen_id = p_citizen_id;
  if not found then raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.'; end if;
  select count(*) into v_records from public.health_records where citizen_id = p_citizen_id;
  delete from public.citizens where citizen_id = p_citizen_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'citizen', p_citizen_id, jsonb_build_object('full_name', v_name, 'health_records_deleted', v_records));
  return jsonb_build_object('status', 'deleted', 'health_records_deleted', v_records);
end; $$;

create or replace function public.admin_delete_household(p_household_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_number text; v_members integer;
begin
  perform public.admin_guard();
  select household_number into v_number from public.households where household_id = p_household_id;
  if not found then raise exception using errcode = '22023', message = 'Kartu keluarga tidak ditemukan.'; end if;
  select count(*) into v_members from public.citizens where household_id = p_household_id;
  if v_members > 0 then
    raise exception using errcode = '23503', message = 'KK ini masih memiliki ' || v_members || ' warga terdaftar. Pindahkan atau hapus warganya terlebih dahulu.';
  end if;
  delete from public.households where household_id = p_household_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'household', p_household_id, jsonb_build_object('household_number', v_number));
  return jsonb_build_object('status', 'deleted');
end; $$;

create or replace function public.admin_delete_rt(p_rt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_households integer;
begin
  perform public.admin_guard();
  select code into v_code from public.rts where rt_id = p_rt_id;
  if not found then raise exception using errcode = '22023', message = 'RT tidak ditemukan.'; end if;
  select count(*) into v_households from public.households where rt_id = p_rt_id;
  if v_households > 0 then
    raise exception using errcode = '23503', message = 'RT ini masih memiliki ' || v_households || ' Kartu Keluarga. Hapus KK-nya terlebih dahulu.';
  end if;
  delete from public.rts where rt_id = p_rt_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'rt', p_rt_id, jsonb_build_object('code', v_code));
  return jsonb_build_object('status', 'deleted');
end; $$;

create or replace function public.admin_delete_health_worker(p_health_worker_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform public.admin_guard();
  select full_name into v_name from public.health_workers where health_worker_id = p_health_worker_id;
  if not found then raise exception using errcode = '22023', message = 'Data nakes tidak ditemukan.'; end if;
  delete from public.health_workers where health_worker_id = p_health_worker_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'health_worker', p_health_worker_id, jsonb_build_object('full_name', v_name));
  return jsonb_build_object('status', 'deleted');
end; $$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text; v_role text;
begin
  perform public.admin_guard();
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Akun Anda sendiri tidak dapat dihapus.';
  end if;
  select u.email, p.role into v_email, v_role
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id;
  if not found then raise exception using errcode = '22023', message = 'Akun tidak ditemukan.'; end if;
  if coalesce(v_role, '') = 'admin' then
    raise exception using errcode = '42501', message = 'Akun admin hanya dapat dihapus melalui server.';
  end if;
  delete from auth.users where id = p_user_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'user', p_user_id, jsonb_build_object('email', v_email, 'role', coalesce(v_role, 'tanpa_role')));
  return jsonb_build_object('status', 'deleted');
end; $$;

revoke all on function public.admin_delete_citizen(uuid) from public;
revoke all on function public.admin_delete_household(uuid) from public;
revoke all on function public.admin_delete_rt(uuid) from public;
revoke all on function public.admin_delete_health_worker(uuid) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_citizen(uuid) to authenticated;
grant execute on function public.admin_delete_household(uuid) to authenticated;
grant execute on function public.admin_delete_rt(uuid) to authenticated;
grant execute on function public.admin_delete_health_worker(uuid) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
