-- Perbaikan login Google yang muter di loading:
-- Migrasi 202609220001 (OTP) mendefinisikan ulang get_my_access() dengan
-- kolom p.admin_tier, padahal kolom itu sudah di-drop pada restrukturisasi
-- role 20260901 (app_role baru: developer/rt_rw/nakes/warga, tanpa tier).
-- Akibatnya RPC get_my_access() error saat runtime -> frontend tidak pernah
-- mendapat role -> user sudah login Google tapi nyangkut di halaman login.
--
-- Migrasi ini mendefinisikan ulang get_my_access() sesuai skema saat ini:
-- tanpa admin_tier, dengan email_verified.

drop function if exists public.get_my_access();

create or replace function public.get_my_access()
returns table (
  user_id uuid,
  role public.app_role,
  display_name text,
  citizen_id uuid,
  nik_last4 text,
  email_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.role, p.display_name, la.citizen_id, c.nik_last4, coalesce(p.email_verified, false)
  from public.profiles p
  left join public.linked_accounts la on la.user_id = p.user_id
  left join public.citizens c on c.citizen_id = la.citizen_id
  where p.user_id = auth.uid() and p.is_active = true
  limit 1;
$$;

revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

notify pgrst, 'reload schema';
