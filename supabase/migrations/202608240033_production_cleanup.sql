-- Migration: PRODUCTION HANDOVER CLEANUP
-- Removes every demo/dummy artifact + the two test Google accounts.
-- Keeps: schema, migrations config, RW/RT skeleton, articles, emergency contacts,
--        audit history, and admin role auto-restoration for the owner's email.

-- ============================================================
-- A. Admin auto-restoration safety net
-- ============================================================
create table if not exists public.bootstrap_admins (
  email text primary key
);
insert into public.bootstrap_admins (email) values ('andhikapratamaputra@gmail.com')
on conflict (email) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_is_admin boolean;
begin
  insert into public.profiles (user_id, role, display_name)
  values (
    new.id, 'warga',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (user_id) do nothing;

  select exists (select 1 from public.bootstrap_admins where lower(email) = lower(new.email))
    into v_is_admin;
  if v_is_admin then
    update public.profiles set role = 'admin', updated_at = now() where user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- B. Delete the two test Google accounts (with before-counts)
-- ============================================================
with del as (
  delete from auth.users
  where email in ('dikznetwork@gmail.com', 'putzimz09@gmail.com')
  returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'auth_users', jsonb_build_object('deleted', count(*)) from del;

-- ============================================================
-- C. Orphan demo citizens (no Google link) — includes seed heads
-- ============================================================
with del as (
  delete from public.citizens c
  where not exists (select 1 from public.linked_accounts la where la.citizen_id = c.citizen_id)
  returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'citizens_unlinked', jsonb_build_object('deleted', count(*)) from del;

-- ============================================================
-- D. Demo households (short-code KK artifacts) — real 16-digit KKs will be
--    registered fresh by warga/admin through the new flow.
-- ============================================================
with del as (
  delete from public.households returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'households', jsonb_build_object('deleted', count(*)) from del;

-- ============================================================
-- E. Dummy health workers (Siti/Dedi/Maya placeholders)
-- ============================================================
with del as (
  delete from public.health_workers returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'health_workers', jsonb_build_object('deleted', count(*)) from del;

-- ============================================================
-- F. Stale activation/link tokens & QR codes (fresh start)
-- ============================================================
with del as (
  delete from public.account_link_tokens returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'account_link_tokens', jsonb_build_object('deleted', count(*)) from del;

with del as (
  delete from public.citizen_qr_codes returning 1
)
insert into public.audit_logs (action, entity, metadata)
select 'cleanup_demo', 'citizen_qr_codes', jsonb_build_object('deleted', count(*)) from del;

-- Notifications belonging to removed users cascade automatically.
-- KEPT INTENTIONALLY: rws, rts, health_articles, emergency_contacts,
--                     audit_logs (history), profiles of remaining real users.
