-- Trigger internal tidak perlu dapat dipanggil langsung oleh role API.
revoke all on function public.guard_identity_column_changes() from public;
revoke all on function public.guard_identity_column_changes() from anon;
revoke all on function public.guard_identity_column_changes() from authenticated;
