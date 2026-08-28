-- Migration: cleanup final E2E test artifacts.
delete from auth.users where email like 'e2e-fin-%@testmail.local';
delete from public.citizens where full_name like 'Final Citizen %';
delete from public.households where household_number like 'KKFIN%' or head_name like 'Final KK %';
