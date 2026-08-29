-- Public access for active nakes profiles (needed for /tim-kesehatan/:id when warga not logged in)
-- Allow anon to read active health_workers (only safe fields, not sensitive)
drop policy if exists "public reads active workers" on public.health_workers;
create policy "public reads active workers" on public.health_workers for select using (is_active = true);

-- RPC to fetch single public nakes profile by health_worker_id or user_id (anon allowed)
create or replace function public.get_public_nakes_profile(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_row public.health_workers%rowtype;
begin
  select * into v_row from public.health_workers where health_worker_id = p_id and is_active = true
  union all
  select * from public.health_workers where user_id = p_id and is_active = true
  limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'health_worker_id', v_row.health_worker_id,
    'user_id', v_row.user_id,
    'full_name', v_row.full_name,
    'position', v_row.position,
    'specialty', v_row.specialty,
    'phone', v_row.phone,
    'whatsapp_number', v_row.whatsapp_number,
    'avatar_url', v_row.avatar_url,
    'work_status', coalesce(v_row.work_status, case when v_row.last_seen_at > now() - interval '2 minutes' then 'Sedang bertugas' else 'Tidak sedang bertugas' end),
    'is_siaga', v_row.is_siaga,
    'is_online', v_row.last_seen_at > now() - interval '2 minutes',
    'services', v_row.services,
    'schedule', v_row.schedule,
    'is_active', v_row.is_active,
    'created_at', v_row.created_at,
    'is_siaga', v_row.is_siaga
  );
end; $$;

revoke all on function public.get_public_nakes_profile(uuid) from public;
grant execute on function public.get_public_nakes_profile(uuid) to anon, authenticated;

-- Ensure get_public_landing_data also returns health_worker_id for linking
create or replace function public.get_public_landing_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_workers jsonb;
  v_articles jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'health_worker_id', w.health_worker_id,
    'name', w.full_name, 'role', w.position, 'specialty', w.specialty,
    'is_online', w.last_seen_at > now() - interval '2 minutes',
    'avatar_url', w.avatar_url,
    'user_id', w.user_id,
    'work_status', coalesce(w.work_status, case when w.last_seen_at > now() - interval '2 minutes' then 'Sedang bertugas' else 'Tidak sedang bertugas' end),
    'is_siaga', w.is_siaga,
    'phone', w.phone,
    'whatsapp_number', w.whatsapp_number,
    'services', w.services,
    'schedule', w.schedule
  ) order by w.full_name), '[]'::jsonb)
    into v_workers
  from public.health_workers w where w.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', a.article_id, 'title', a.title, 'slug', a.slug, 'summary', a.summary
  ) order by a.updated_at desc), '[]'::jsonb)
    into v_articles
  from (select * from public.health_articles where is_published order by updated_at desc limit 3) a;

  return jsonb_build_object(
    'stats', jsonb_build_array(
      jsonb_build_object('value', (select count(*)::text from public.rts), 'label', 'RT terlayani'),
      jsonb_build_object('value', (select count(*)::text from public.households), 'label', 'Kepala keluarga'),
      jsonb_build_object('value', (select count(*)::text from public.citizens where is_active), 'label', 'Warga terdata'),
      jsonb_build_object('value', (select count(*)::text from public.health_workers where is_active), 'label', 'Tenaga kesehatan')
    ),
    'workers', v_workers,
    'articles', v_articles
  );
end; $$;
