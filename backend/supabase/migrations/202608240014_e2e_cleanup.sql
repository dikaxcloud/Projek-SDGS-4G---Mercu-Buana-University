-- Migration: cleanup E2E test artifacts (users, test citizens/households).
-- Test-only data operation. Safe to keep in history.
delete from public.citizens where full_name like 'E2E Tester%';
delete from public.households where household_number like 'KKE2E%';
delete from public.account_link_tokens where citizen_id not in (select citizen_id from public.citizens);
delete from public.linked_accounts where user_id in (select id from auth.users where email like 'e2e-warga-%@testmail.local');
delete from auth.users where email like 'e2e-warga-%@testmail.local';
