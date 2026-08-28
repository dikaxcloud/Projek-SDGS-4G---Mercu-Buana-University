-- Migration: promote E2E admin test users (e2e-admin.*@testmail.local) to admin role.
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.user_id and u.email like 'e2e-admin.%@testmail.local';

insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
select u.id, 'e2e_test_promote', 'profiles', u.id, jsonb_build_object('role', 'admin')
from auth.users u where u.email like 'e2e-admin.%@testmail.local';
