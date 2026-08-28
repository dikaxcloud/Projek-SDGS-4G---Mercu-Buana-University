-- Migration: promote final-verification E2E users (rerun for newly created batch).
update public.profiles p set role = 'admin'
from auth.users u where u.id = p.user_id and u.email like 'e2e-fin-admin.%@testmail.local';

update public.profiles p set role = 'nakes'
from auth.users u where u.id = p.user_id and u.email like 'e2e-fin-nakes.%@testmail.local';
