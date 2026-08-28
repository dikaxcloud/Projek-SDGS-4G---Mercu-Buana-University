-- Migration: remove diagnostic signup from registration debugging.
delete from auth.users where email like 'e2e-reg.%@testmail.local';
