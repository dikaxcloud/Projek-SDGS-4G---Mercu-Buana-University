-- Migration: promote E2E test users (e2e-warga-b*@testmail.local) to nakes role.
-- Test-only data operation. Cleanup happens in a later migration.
update public.profiles p
set role = 'nakes'
from auth.users u
where u.id = p.user_id and u.email like 'e2e-warga-b.%@testmail.local';

insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
select u.id, 'e2e_test_promote', 'profiles', u.id, jsonb_build_object('role', 'nakes')
from auth.users u where u.email like 'e2e-warga-b.%@testmail.local';
