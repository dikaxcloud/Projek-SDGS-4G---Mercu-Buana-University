-- Security hardening. Run after admin RPC migration.

-- Client profile writes are intentionally disabled. Profile changes must use an audited server workflow.
revoke insert, update, delete on table public.profiles from anon, authenticated;

-- Every health detail table needs owner-or-staff read access. Writes remain staff-only.
drop policy if exists "sugar details staff" on public.blood_sugar_records;
create policy "sugar details owner or staff" on public.blood_sugar_records
for select using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'admin'))));
create policy "sugar details staff write" on public.blood_sugar_records
for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));

create policy "weight details owner or staff" on public.weight_records
for select using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'admin'))));
create policy "temperature details owner or staff" on public.temperature_records
for select using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'admin'))));
create policy "pulse details owner or staff" on public.pulse_records
for select using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'admin'))));

-- No direct client writes to audit logs, linked accounts, or identity tables.
revoke insert, update, delete on table public.audit_logs from anon, authenticated;
revoke insert, update, delete on table public.linked_accounts from anon, authenticated;
revoke insert, update, delete on table public.citizens from anon, authenticated;
revoke insert, update, delete on table public.health_records from anon, authenticated;
revoke insert, update, delete on table public.blood_pressure_records from anon, authenticated;
revoke insert, update, delete on table public.blood_sugar_records from anon, authenticated;
revoke insert, update, delete on table public.weight_records from anon, authenticated;
revoke insert, update, delete on table public.temperature_records from anon, authenticated;
revoke insert, update, delete on table public.pulse_records from anon, authenticated;
