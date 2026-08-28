-- Migration: invite role + name sync
-- 1) handle_new_user: apply invited role from raw_user_meta_data->>'role'
-- 2) display_name from metadata full_name/name (sudah ada)
-- 3) backfill: sinkron nama & role untuk user yang sudah terlanjur dibuat via invite

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_meta_role text;
begin
  insert into public.profiles (user_id, role, display_name)
  values (
    new.id, 'warga',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (user_id) do nothing;

  -- Role dari undangan (invite-user edge function menyimpan metadata.role)
  v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  if v_meta_role in ('nakes', 'admin', 'warga') then
    update public.profiles set role = v_meta_role::public.app_role, updated_at = now()
    where user_id = new.id and role = 'warga';
  end if;

  -- Safety net: email owner selalu admin
  select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email))
    into v_is_admin;
  if v_is_admin then
    update public.profiles set role = 'admin', updated_at = now() where user_id = new.id;
  end if;

  return new;
end;
$$;

-- Backfill: isi nama dari metadata untuk profil yang masih kosong
update public.profiles p
set display_name = nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
where p.user_id = u.id
  and (p.display_name is null or btrim(p.display_name) = '')
  and nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '') is not null;

-- Backfill: terapkan role undangan untuk user lama yang masih 'warga'
update public.profiles p
set role = (u.raw_user_meta_data ->> 'role')::public.app_role, updated_at = now()
from auth.users u
where p.user_id = u.id
  and p.role = 'warga'
  and lower(coalesce(u.raw_user_meta_data ->> 'role', '')) in ('nakes', 'admin');
