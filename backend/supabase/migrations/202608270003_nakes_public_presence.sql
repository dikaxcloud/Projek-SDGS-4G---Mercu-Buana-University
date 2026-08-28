alter table public.health_workers add column if not exists last_seen_at timestamptz;

create or replace function public.touch_my_nakes_presence()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'nakes' then
    raise exception using errcode = '42501', message = 'Hanya nakes yang dapat memperbarui status kehadiran.';
  end if;

  update public.health_workers
  set last_seen_at = now(), is_online = true
  where user_id = auth.uid() and is_active;
end; $$;

create or replace function public.get_public_landing_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_workers jsonb;
  v_articles jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', w.full_name, 'role', w.position, 'specialty', w.specialty,
    'is_online', w.last_seen_at > now() - interval '2 minutes'
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

revoke all on function public.touch_my_nakes_presence() from public;
grant execute on function public.touch_my_nakes_presence() to authenticated;
