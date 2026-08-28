-- Hierarchy 5-tier: 1=Owner/Developer, 2=Senior Admin, 3=Junior Admin, 4=Nakes, 5=Warga
-- Admin tier only for role='admin', nakes/warga implicit

-- 1. Add column
alter table public.profiles add column if not exists admin_tier smallint;

-- 2. Seed tier for existing data
update public.profiles set admin_tier = 1 where user_id in (select user_id from public.app_owners) and (admin_tier is null or admin_tier <> 1);
update public.profiles set admin_tier = 2 where role = 'admin' and admin_tier is null;
-- nakes/warga keep null

-- 3. Constraint
do $$ begin
  alter table public.profiles add constraint admin_tier_valid check (admin_tier is null or admin_tier between 1 and 3);
exception when duplicate_object then null; end $$;

-- 4. Helper: current caller tier (1..5)
create or replace function public.current_admin_tier()
returns smallint language sql stable security definer set search_path = public as $$
  select case
    when p.role = 'admin' then coalesce(p.admin_tier, 3)
    when p.role = 'nakes' then 4
    when p.role = 'warga' then 5
    else 5 end
  from public.profiles p where p.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.target_admin_tier(p_user_id uuid)
returns smallint language sql stable security definer set search_path = public as $$
  select case
    when p.role = 'admin' then coalesce(p.admin_tier, 3)
    when p.role = 'nakes' then 4
    when p.role = 'warga' then 5
    else 5 end
  from public.profiles p where p.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.current_admin_tier() from public;
revoke all on function public.target_admin_tier(uuid) from public;
grant execute on function public.current_admin_tier() to authenticated;
grant execute on function public.target_admin_tier(uuid) to authenticated;

-- 4b. Update handle_new_user to set admin_tier for invited admins (tier 3 default, tier 1 for owner)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_meta_role text;
  v_tier smallint;
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'warga', nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (user_id) do nothing;

  v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  if v_meta_role in ('nakes', 'admin', 'warga') then
    if v_meta_role = 'admin' then
      -- Check if this new user is owner via bootstrap_admins
      select exists (select 1 from public.app_owners where user_id = new.id) into v_is_owner;
      -- Also check bootstrap list for owner email
      if not v_is_owner then
        select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email)) into v_is_owner;
      end if;
      v_tier := case when v_is_owner then 1 else 3 end;
      update public.profiles set role = 'admin'::public.app_role, admin_tier = v_tier, updated_at = now() where user_id = new.id and role = 'warga';
      -- If owner, also ensure in app_owners
      if v_is_owner then insert into public.app_owners (user_id) values (new.id) on conflict do nothing; end if;
    else
      update public.profiles set role = v_meta_role::public.app_role, admin_tier = null, updated_at = now() where user_id = new.id and role = 'warga';
    end if;
  end if;

  -- Safety net: email owner selalu admin tier 1
  select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email)) into v_is_owner;
  if v_is_owner then
    update public.profiles set role = 'admin', admin_tier = 1, updated_at = now() where user_id = new.id;
    insert into public.app_owners (user_id) values (new.id) on conflict do nothing;
  end if;

  return new;
end;
$$;

-- 5. Extend get_my_access to include admin_tier
drop function if exists public.get_my_access();
create function public.get_my_access()
returns table (
  user_id uuid,
  role public.app_role,
  admin_tier smallint,
  display_name text,
  citizen_id uuid,
  nik_last4 text
)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.role, p.admin_tier, p.display_name, la.citizen_id, c.nik_last4
  from public.profiles p
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where p.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;
revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

-- 6. Tier-aware admin_delete_user (replaces 202608260048)
create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_role text; v_dir_deleted integer := 0;
  v_citizen_id uuid; v_citizen_name text; v_records integer := 0;
  v_caller_tier smallint; v_target_tier smallint; v_target_is_owner boolean;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Akun Anda sendiri tidak dapat dihapus.';
  end if;

  v_caller_tier := public.current_admin_tier();
  v_target_tier := public.target_admin_tier(p_user_id);

  -- Tier check: caller must be strictly higher privilege (lower number)
  if v_caller_tier is null then
    raise exception using errcode = '42501', message = 'Tidak berwenang.';
  end if;
  if v_target_tier is null then
    -- fallback: try to fetch role directly
    select p.role into v_role from public.profiles p where p.user_id = p_user_id;
    v_target_tier := case when v_role='admin' then 3 when v_role='nakes' then 4 else 5 end;
  end if;
  if v_caller_tier >= v_target_tier then
    raise exception using errcode = '42501', message = 'Tidak berwenang menghapus akun level sama atau lebih tinggi.';
  end if;

  select u.email, p.role into v_email, v_role
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id;
  if not found then raise exception using errcode = '22023', message = 'Akun tidak ditemukan.'; end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = p_user_id);
  if v_target_is_owner then
    raise exception using errcode = '42501', message = 'Akun owner/developer tidak dapat dihapus.';
  end if;
  -- Extra guard: Tier 1 owner is already blocked above, but keep explicit

  select la.citizen_id, c.full_name into v_citizen_id, v_citizen_name
    from public.linked_accounts la join public.citizens c on c.citizen_id = la.citizen_id
    where la.user_id = p_user_id limit 1;
  if v_citizen_id is not null then
    select count(*) into v_records from public.health_records where citizen_id = v_citizen_id;
  end if;

  delete from public.health_workers where user_id = p_user_id;
  get diagnostics v_dir_deleted = row_count;

  if v_citizen_id is not null then
    delete from public.citizens where citizen_id = v_citizen_id;
  end if;

  delete from auth.users where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'user', p_user_id, jsonb_build_object(
      'email', v_email, 'role', coalesce(v_role, 'tanpa_role'), 'caller_tier', v_caller_tier, 'target_tier', v_target_tier,
      'health_worker_rows_deleted', v_dir_deleted, 'citizen_deleted', coalesce(v_citizen_name, ''), 'health_records_deleted', v_records));
  return jsonb_build_object('status', 'deleted', 'health_worker_rows_deleted', v_dir_deleted, 'citizen_deleted', coalesce(v_citizen_name, ''));
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 7. Tier-aware admin_set_user_role (promote/demote)
create or replace function public.admin_set_user_role(p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_caller_tier smallint;
  v_target_tier smallint;
  v_caller_is_owner boolean;
  v_target_is_owner boolean;
begin
  perform public.admin_guard();
  if p_role not in ('admin', 'nakes', 'warga') then
    raise exception using errcode = '22023', message = 'Role hanya boleh admin, nakes, atau warga.';
  end if;
  v_caller_tier := public.current_admin_tier();
  v_caller_is_owner := exists (select 1 from public.app_owners o where o.user_id = auth.uid());
  -- Only Tier 1 (owner) can promote to admin
  if p_role = 'admin' and v_caller_tier > 1 then
    raise exception using errcode = '42501', message = 'Hanya owner/developer yang dapat mengangkat admin.';
  end if;
  -- Tier 2 and 3 can set nakes/warga as long as target tier > caller tier will be enforced below? For promote, we check target current tier
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception using errcode = '22023', message = 'Akun Google dengan email tersebut belum pernah login.';
  end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = v_uid);
  if v_target_is_owner and p_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Role pemilik aplikasi (owner) tidak dapat diturunkan.';
  end if;
  v_target_tier := public.target_admin_tier(v_uid);
  -- Prevent modifying same or higher tier
  if v_target_tier is not null and v_caller_tier >= v_target_tier and v_uid <> auth.uid() then
    -- Allow if p_role is lower tier than caller? Actually if caller 2 and target is 3 (junior admin), caller 2 < 3 so allowed.
    -- If caller 3 and target 2, caller 3 >=2 so blocked.
    raise exception using errcode = '42501', message = 'Tidak berwenang mengubah role level sama atau lebih tinggi.';
  end if;
  -- If promoting to admin, set tier 3 (junior) by default; owner can later promote to tier 2 via direct update
  if p_role = 'admin' then
    update public.profiles set role = p_role::public.app_role, admin_tier = 3, updated_at = now() where user_id = v_uid;
  else
    update public.profiles set role = p_role::public.app_role, admin_tier = null, updated_at = now() where user_id = v_uid;
  end if;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'set_role', 'profiles', v_uid, jsonb_build_object('role', p_role, 'email', lower(trim(p_email)), 'caller_tier', v_caller_tier, 'target_tier', v_target_tier));
  return jsonb_build_object('status', 'updated', 'user_id', v_uid, 'role', p_role);
end;
$$;
revoke all on function public.admin_set_user_role(text,text) from public;
grant execute on function public.admin_set_user_role(text,text) to authenticated;

-- 8. Helper to set admin tier (only owner/senior can)
create or replace function public.admin_set_admin_tier(p_user_id uuid, p_tier smallint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller_tier smallint; v_target_tier smallint;
begin
  perform public.admin_guard();
  if p_tier not in (2,3) then raise exception using errcode='22023', message='Tier admin hanya 2 (senior) atau 3 (junior).'; end if;
  v_caller_tier := public.current_admin_tier();
  if v_caller_tier <> 1 then raise exception using errcode='42501', message='Hanya owner yang dapat mengatur tier admin.'; end if;
  v_target_tier := public.target_admin_tier(p_user_id);
  if v_target_tier is null or v_target_tier <> coalesce((select admin_tier from public.profiles where user_id=p_user_id), 3) then
    -- ensure target is admin
    if (select role from public.profiles where user_id=p_user_id) <> 'admin' then
      raise exception using errcode='22023', message='Target bukan admin.';
    end if;
  end if;
  if p_user_id = auth.uid() then raise exception using errcode='22023', message='Tidak dapat mengubah tier sendiri.'; end if;
  update public.profiles set admin_tier = p_tier, updated_at = now() where user_id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'set_admin_tier', 'profiles', p_user_id, jsonb_build_object('tier', p_tier));
  return jsonb_build_object('status', 'updated', 'tier', p_tier);
end;
$$;
revoke all on function public.admin_set_admin_tier(uuid,smallint) from public;
grant execute on function public.admin_set_admin_tier(uuid,smallint) to authenticated;
