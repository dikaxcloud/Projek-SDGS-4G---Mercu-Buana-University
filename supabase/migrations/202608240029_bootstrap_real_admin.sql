-- Migration: bootstrap the FIRST real platform admin.
-- Requires the Google account to have logged in at least once.
do $$
declare
  v_uid uuid;
begin
  select u.id into v_uid from auth.users u where lower(u.email) = 'andhikapratamaputra@gmail.com';
  if v_uid is null then
    raise exception using errcode = '22023', message = 'EMAIL_BELUM_LOGIN';
  end if;

  insert into public.profiles (user_id, role, display_name)
  values (v_uid, 'admin', nullif(split_part('andhikapratamaputra@gmail.com', '@', 1), ''))
  on conflict (user_id) do update set role = 'admin', updated_at = now();

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (v_uid, 'bootstrap_admin', 'profiles', v_uid, jsonb_build_object('email', 'andhikapratamaputra@gmail.com'));
end $$;
