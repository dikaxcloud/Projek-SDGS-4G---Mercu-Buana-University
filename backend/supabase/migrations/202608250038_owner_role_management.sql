-- Owner concept: the app owner (developer) can grant/revoke the ADMIN role
-- from the Admin & Akses page — no coding needed. Regular admins still cannot.
-- Owner list lives in app_owners (seeded with the bootstrap admin account).

create table if not exists public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.app_owners (user_id)
select id from auth.users where lower(email) = 'andhikapratamaputra@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.is_app_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_owners o where o.user_id = auth.uid());
$$;

create or replace function public.admin_set_user_role(p_email text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_caller_is_owner boolean;
  v_target_is_owner boolean;
begin
  perform public.admin_guard();
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

revoke all on function public.is_app_owner() from public;
revoke all on function public.admin_set_user_role(text,text) from public;
grant execute on function public.is_app_owner() to authenticated;
grant execute on function public.admin_set_user_role(text,text) to authenticated;
