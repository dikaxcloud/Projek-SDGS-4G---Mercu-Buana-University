-- Role parity: NAKES and ADMIN become equal in access level.
-- - admin_guard now accepts both 'admin' and 'nakes' -> all management RPCs open to both.
-- - staff_guard already accepted both.
-- Sensitive operations stay ADMIN-only via admin_only_guard:
--   changing user roles, deleting Google accounts (admin_delete_user),
--   and deleting a citizen together with their Google account.
-- Owner-only rules are unchanged (grant admin, delete admin accounts).

create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() not in ('admin', 'nakes') then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
end;
$$;

create or replace function public.admin_only_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'Hanya admin yang dapat melakukan aksi ini.';
  end if;
end;
$$;

-- Sensitive: role management stays admin-only (granting 'admin' stays owner-only).
create or replace function public.admin_set_user_role(p_email text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_caller_is_owner boolean;
  v_target_is_owner boolean;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();
  if p_role not in ('admin', 'nakes', 'warga') then
    raise exception using errcode = '22023', message = 'Role hanya boleh admin, nakes, atau warga.';
  end if;
  v_caller_is_owner := exists (select 1 from public.app_owners o where o.user_id = auth.uid());
  if p_role = 'admin' and not v_caller_is_owner then
    raise exception using errcode = '42501', message = 'Hanya pemilik aplikasi (owner) yang dapat mengangkat admin.';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception using errcode = '22023', message = 'Akun Google dengan email tersebut belum pernah login.';
  end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = v_uid);
  if v_target_is_owner and p_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Role pemilik aplikasi (owner) tidak dapat diturunkan.';
  end if;
  update public.profiles set role = p_role::public.app_role, updated_at = now() where user_id = v_uid;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'set_role', 'profiles', v_uid, jsonb_build_object('role', p_role, 'email', lower(trim(p_email)), 'by_owner', v_caller_is_owner));
  return jsonb_build_object('status', 'updated', 'user_id', v_uid, 'role', p_role);
end;
$$;

-- Sensitive: deleting Google accounts stays admin-only (admin targets stay owner-only).
create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_role text;
  v_caller_is_owner boolean; v_target_is_owner boolean;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Akun Anda sendiri tidak dapat dihapus.';
  end if;
  v_caller_is_owner := exists (select 1 from public.app_owners o where o.user_id = auth.uid());
  select u.email, p.role into v_email, v_role
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id;
  if not found then raise exception using errcode = '22023', message = 'Akun tidak ditemukan.'; end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = p_user_id);
  if v_target_is_owner then
    raise exception using errcode = '42501', message = 'Akun owner tidak dapat dihapus.';
  end if;
  if coalesce(v_role, '') = 'admin' and not v_caller_is_owner then
    raise exception using errcode = '42501', message = 'Hanya pemilik aplikasi (owner) yang dapat menghapus akun admin.';
  end if;
  delete from auth.users where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'user', p_user_id, jsonb_build_object('email', v_email, 'role', coalesce(v_role, 'tanpa_role'), 'by_owner', v_caller_is_owner));
  return jsonb_build_object('status', 'deleted');
end;
$$;

-- Sensitive: deleting a citizen TOGETHER with their Google account stays admin-only.
drop function if exists public.admin_delete_citizen(uuid, boolean);
create or replace function public.admin_delete_citizen(p_citizen_id uuid, p_with_account boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_records integer; v_linked_user uuid; v_linked_role text; v_account_deleted boolean := false;
begin
  perform public.admin_guard();
  select full_name into v_name from public.citizens where citizen_id = p_citizen_id;
  if not found then raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.'; end if;
  select la.user_id into v_linked_user from public.linked_accounts la where la.citizen_id = p_citizen_id limit 1;
  select count(*) into v_records from public.health_records where citizen_id = p_citizen_id;

  if p_with_account and v_linked_user is not null then
    perform public.admin_only_guard();
    if exists (select 1 from public.app_owners o where o.user_id = v_linked_user) then
      raise exception using errcode = '42501', message = 'Akun Google warga ini adalah owner — hapus melalui Admin & Akses.';
    end if;
    select coalesce(p.role::text, '') into v_linked_role from auth.users u left join public.profiles p on p.user_id = u.id where u.id = v_linked_user;
    if v_linked_role = 'admin' and not exists (select 1 from public.app_owners o where o.user_id = auth.uid()) then
      raise exception using errcode = '42501', message = 'Akun Google warga ini adalah admin — hanya owner dapat menghapusnya.';
    end if;
    delete from auth.users where id = v_linked_user;
    v_account_deleted := true;
  end if;

  delete from public.citizens where citizen_id = p_citizen_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'citizen', p_citizen_id, jsonb_build_object('full_name', v_name, 'health_records_deleted', v_records, 'google_account_deleted', v_account_deleted));
  return jsonb_build_object('status', 'deleted', 'google_account_deleted', v_account_deleted);
end;
$$;

revoke all on function public.admin_guard() from public;
revoke all on function public.admin_only_guard() from public;
revoke all on function public.admin_set_user_role(text,text) from public;
revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.admin_delete_citizen(uuid, boolean) from public;
grant execute on function public.admin_guard() to authenticated;
grant execute on function public.admin_only_guard() to authenticated;
grant execute on function public.admin_set_user_role(text,text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_delete_citizen(uuid, boolean) to authenticated;
