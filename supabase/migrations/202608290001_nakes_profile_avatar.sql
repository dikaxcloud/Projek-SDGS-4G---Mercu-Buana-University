-- Nakes profile extended fields + avatar + work status + siaga
-- Required for: profil saya (nakes self-edit) + tim-kesehatan siaga + landing photo

alter table public.health_workers
  add column if not exists avatar_url text,
  add column if not exists whatsapp_number text,
  add column if not exists work_status text check (work_status in ('Sedang bertugas','Sedang menangani warga','Tidak sedang bertugas','Tidak tersedia')),
  add column if not exists is_siaga boolean not null default false,
  add column if not exists services text,
  add column if not exists schedule text;

-- Update public landing RPC to include new fields
create or replace function public.get_public_landing_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_workers jsonb;
  v_articles jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
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

-- Nakes self-update RPC (security definer, checks nakes role, only own row)
create or replace function public.update_my_nakes_profile(
  p_full_name text default null,
  p_position text default null,
  p_specialty text default null,
  p_phone text default null,
  p_avatar_url text default null,
  p_whatsapp_number text default null,
  p_work_status text default null,
  p_is_siaga boolean default null,
  p_services text default null,
  p_schedule text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using errcode='42501', message='Belum login'; end if;
  if public.current_app_role() not in ('nakes','admin') then raise exception using errcode='42501', message='Hanya nakes/admin'; end if;
  if p_work_status is not null and p_work_status not in ('Sedang bertugas','Sedang menangani warga','Tidak sedang bertugas','Tidak tersedia') then raise exception using errcode='22023', message='Status tidak valid'; end if;
  update public.health_workers set
    full_name = coalesce(nullif(trim(p_full_name),''), full_name),
    position = coalesce(nullif(trim(p_position),''), position),
    specialty = coalesce(nullif(trim(p_specialty),''), specialty),
    phone = coalesce(nullif(trim(p_phone),''), phone),
    avatar_url = coalesce(nullif(trim(p_avatar_url),''), avatar_url),
    whatsapp_number = coalesce(nullif(trim(p_whatsapp_number),''), whatsapp_number),
    work_status = coalesce(p_work_status, work_status),
    is_siaga = coalesce(p_is_siaga, is_siaga),
    services = coalesce(nullif(trim(p_services),''), services),
    schedule = coalesce(nullif(trim(p_schedule),''), schedule)
  where user_id = v_user;
  if not found then raise exception using errcode='22023', message='Profil nakes tidak ditemukan. Hubungi admin.'; end if;
  return jsonb_build_object('status','updated');
end; $$;

revoke all on function public.update_my_nakes_profile(text,text,text,text,text,text,text,boolean,text,text) from public;
grant execute on function public.update_my_nakes_profile(text,text,text,text,text,text,text,boolean,text,text) to authenticated;

-- Extend admin RPCs to handle new fields
create or replace function public.admin_update_health_worker(p_health_worker_id uuid, p_full_name text, p_position text, p_specialty text default null, p_phone text default null, p_is_online boolean default false, p_is_active boolean default true, p_avatar_url text default null, p_whatsapp_number text default null, p_work_status text default null, p_is_siaga boolean default null, p_services text default null, p_schedule text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 or nullif(trim(coalesce(p_position, '')), '') is null then raise exception using errcode = '22023', message = 'Data nakes tidak valid.'; end if;
  if p_work_status is not null and p_work_status not in ('Sedang bertugas','Sedang menangani warga','Tidak sedang bertugas','Tidak tersedia') then raise exception using errcode='22023', message='Status tidak valid'; end if;
  update public.health_workers set full_name = trim(p_full_name), position = trim(p_position), specialty = nullif(trim(p_specialty), ''), phone = nullif(trim(p_phone), ''), is_online = coalesce(p_is_online, false), is_active = coalesce(p_is_active, true), avatar_url = coalesce(nullif(trim(p_avatar_url),''), avatar_url), whatsapp_number = coalesce(nullif(trim(p_whatsapp_number),''), whatsapp_number), work_status = coalesce(p_work_status, work_status), is_siaga = coalesce(p_is_siaga, is_siaga), services = coalesce(nullif(trim(p_services),''), services), schedule = coalesce(nullif(trim(p_schedule),''), schedule) where health_worker_id = p_health_worker_id;
  if not found then raise exception using errcode = '22023', message = 'Data nakes tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'health_worker', p_health_worker_id, '{}'::jsonb);
  return jsonb_build_object('status', 'updated');
end; $$;

-- Allow nakes to update own row via RLS (alternative to RPC)
drop policy if exists "nakes own update" on public.health_workers;
create policy "nakes own update" on public.health_workers for update to authenticated using (user_id = auth.uid() and public.current_app_role() in ('nakes','admin')) with check (user_id = auth.uid());

-- Storage bucket for avatars (if not exists, created via dashboard; fallback to base64 if missing)
-- Note: create bucket via supabase storage API if needed: avatars
