-- Migration: cleanup admin E2E test artifacts.
delete from public.health_articles where slug like 'e2e-artikel-%';
delete from public.citizens where full_name like 'E2E Admin Citizen%';
delete from public.households where head_name = 'E2E Admin KK' or household_number like 'KKADM%';
delete from public.rts where name like 'RT Uji %' or name like 'Debug %';
delete from auth.users where email like 'e2e-admin.%@testmail.local';
