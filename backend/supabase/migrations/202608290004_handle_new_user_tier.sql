-- Update handle_new_user to respect admin_tier from invite metadata (tier 2 for Senior Admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_meta_role text;
  v_tier smallint;
  v_meta_tier text;
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'warga', nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (user_id) do nothing;

  v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  v_meta_tier := new.raw_user_meta_data ->> 'admin_tier';
  if v_meta_role in ('nakes', 'admin', 'warga') then
    if v_meta_role = 'admin' then
      select exists (select 1 from public.app_owners where user_id = new.id) into v_is_owner;
      if not v_is_owner then
        select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email)) into v_is_owner;
      end if;
      if v_is_owner then
        v_tier := 1;
      elsif v_meta_tier in ('2','tier2') then
        v_tier := 2;
      else
        v_tier := 3;
      end if;
      update public.profiles set role = 'admin'::public.app_role, admin_tier = v_tier, updated_at = now() where user_id = new.id and role = 'warga';
      if v_is_owner then insert into public.app_owners (user_id) values (new.id) on conflict do nothing; end if;
    else
      update public.profiles set role = v_meta_role::public.app_role, admin_tier = null, updated_at = now() where user_id = new.id and role = 'warga';
    end if;
  end if;

  select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email)) into v_is_owner;
  if v_is_owner then
    update public.profiles set role = 'admin', admin_tier = 1, updated_at = now() where user_id = new.id;
    insert into public.app_owners (user_id) values (new.id) on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Allow Senior (tier2) to set Junior tier via admin_set_admin_tier (previously only Owner)
create or replace function public.admin_set_admin_tier(p_user_id uuid, p_tier smallint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller_tier smallint; v_target_tier smallint;
begin
  perform public.admin_guard();
  if p_tier not in (2,3) then raise exception using errcode='22023', message='Tier admin hanya 2 (senior) atau 3 (junior).'; end if;
  v_caller_tier := public.current_admin_tier();
  -- Owner can set 2/3, Senior can set 3 only (demote/promote junior)
  if v_caller_tier = 1 then
    -- owner can set any
    null;
  elsif v_caller_tier = 2 and p_tier = 3 then
    -- senior can set junior
    null;
  else
    raise exception using errcode='42501', message='Hanya Owner yang dapat mengatur Tier 2, dan Owner/Senior dapat mengatur Tier 3.';
  end if;
  v_target_tier := public.target_admin_tier(p_user_id);
  if v_target_tier is null or v_target_tier <> coalesce((select admin_tier from public.profiles where user_id=p_user_id), 3) then
    if (select role from public.profiles where user_id=p_user_id) <> 'admin' then
      raise exception using errcode='22023', message='Target bukan admin.';
    end if;
  end if;
  if p_user_id = auth.uid() then raise exception using errcode='22023', message='Tidak dapat mengubah tier sendiri.'; end if;
  -- Prevent senior from modifying senior or owner
  if v_caller_tier >= v_target_tier then
    raise exception using errcode='42501', message='Tidak berwenang mengubah tier level sama atau lebih tinggi.';
  end if;
  update public.profiles set admin_tier = p_tier, updated_at = now() where user_id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'set_admin_tier', 'profiles', p_user_id, jsonb_build_object('tier', p_tier, 'caller_tier', v_caller_tier));
  return jsonb_build_object('status', 'updated', 'tier', p_tier);
end;
$$;

-- Also update admin_set_user_role to allow Senior to promote to nakes/warga and Junior admin (tier3) via invite flow already handled, but for role changes via table:
-- Already handled in previous migration, but ensure Senior can set nakes/warga and also admin tier3 via role change
-- No extra change needed, as admin_set_user_role already allows Senior to set nakes/warga (since isOwner check only for admin role)
-- But we need to allow Senior to set admin tier3 via that function when p_role=admin and caller is Senior tier2
-- So update admin_set_user_role to allow Senior for tier3
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
  -- Tier-aware: Owner can set any, Senior can set Junior/Nakes/Warga, Junior can set Nakes/Warga
  if p_role = 'admin' and v_caller_tier > 2 then
    raise exception using errcode = '42501', message = 'Hanya Owner dan Senior Admin yang dapat mengangkat Junior Admin.';
  end if;
  if p_role = 'admin' and v_caller_tier = 2 then
    -- Senior inviting Junior admin is allowed, will be set to tier 3 via handle
    null;
  end if;
  if p_role in ('nakes','warga') and v_caller_tier > 3 then
    raise exception using errcode = '42501', message = 'Hanya Admin yang dapat mengubah role Nakes/Warga.';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception using errcode = '22023', message = 'Akun Google dengan email tersebut belum pernah login.';
  end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = v_uid);
  if v_target_is_owner and p_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Role pemilik aplikasi (owner) tidak dapat diturunkan.';
  end if;
  v_target_tier := public.target_admin_tier(v_uid);
  if v_target_tier is not null and v_caller_tier >= v_target_tier and v_uid <> auth.uid() then
    raise exception using errcode = '42501', message = 'Tidak berwenang mengubah role level sama atau lebih tinggi.';
  end if;
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
