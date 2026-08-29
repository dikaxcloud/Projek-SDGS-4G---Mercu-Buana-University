-- Enable realtime for health_workers so /tim-kesehatan updates instantly when nakes toggles status
alter publication supabase_realtime add table public.health_workers;

-- Ensure RLS allows realtime to read active workers (already has policy, but ensure)
-- Add index for realtime performance
create index if not exists health_workers_user_id_idx on public.health_workers(user_id);
create index if not exists health_workers_is_siaga_idx on public.health_workers(is_siaga) where is_siaga = true;
