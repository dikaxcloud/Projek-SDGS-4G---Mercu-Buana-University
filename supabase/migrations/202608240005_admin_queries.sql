-- Admin dashboard and management RPCs. Synthetic demo data only.

create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'Izin tidak cukup.';
  end if;
end;
$$;

create or replace function public.get_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now());
  v_rts jsonb;
begin
  perform public.admin_guard();
  select coalesce(jsonb_agg(jsonb_build_object('label', r.code, 'total', coalesce(x.total, 0)) order by r.code), '[]'::jsonb)
    into v_rts
  from public.rts r
  left join (
    select h.rt_id, count(*)::integer as total
    from public.households h
    group by h.rt_id
  ) x on x.rt_id = r.rt_id;
  return jsonb_build_object(
    'totalCitizens', (select count(*)::integer from public.citizens where is_active),
    'totalHouseholds', (select count(*)::integer from public.households),
    'totalRts', (select count(*)::integer from public.rts),
    'totalHealthWorkers', (select count(*)::integer from public.health_workers where is_active),
    'todayExaminations', (select count(*)::integer from public.health_records where examined_at >= v_today),
    'rtDistribution', v_rts
  );
end;
$$;

create or replace function public.list_admin_citizens(p_query text default '', p_limit integer default 50, p_offset integer default 0)
returns table (citizen_id uuid, full_name text, nik_last4 text, household_number text, rt_code text, phone text, birth_date date, gender text, blood_type text, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_query text := left(trim(coalesce(p_query, '')), 60); v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100)); v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.admin_guard();
  return query select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code, c.phone, c.birth_date, c.gender, c.blood_type, c.is_active
  from public.citizens c join public.households h on h.household_id = c.household_id join public.rts r on r.rt_id = h.rt_id
  where v_query = '' or c.full_name ilike '%' || v_query || '%' or h.household_number ilike '%' || v_query || '%' or r.code ilike '%' || v_query || '%'
  order by c.full_name limit v_limit offset v_offset;
end; $$;

create or replace function public.list_admin_households(p_query text default '', p_limit integer default 50, p_offset integer default 0)
returns table (household_id uuid, household_number text, head_name text, address text, rt_code text, citizen_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_query text := left(trim(coalesce(p_query, '')), 60); v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100)); v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.admin_guard();
  return query select h.household_id, h.household_number, h.head_name, h.address, r.code, count(c.citizen_id)
  from public.households h join public.rts r on r.rt_id = h.rt_id left join public.citizens c on c.household_id = h.household_id and c.is_active
  where v_query = '' or h.household_number ilike '%' || v_query || '%' or h.head_name ilike '%' || v_query || '%' or r.code ilike '%' || v_query || '%'
  group by h.household_id, r.code order by r.code, h.household_number limit v_limit offset v_offset;
end; $$;

create or replace function public.list_admin_rts()
returns table (rt_id uuid, code text, name text, household_count bigint, citizen_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query select r.rt_id, r.code, r.name, count(distinct h.household_id), count(c.citizen_id)
  from public.rts r left join public.households h on h.rt_id = r.rt_id left join public.citizens c on c.household_id = h.household_id and c.is_active
  group by r.rt_id order by r.code;
end; $$;

create or replace function public.list_admin_health_workers(p_query text default '')
returns table (health_worker_id uuid, user_id uuid, full_name text, "position" text, specialty text, phone text, is_online boolean, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_query text := left(trim(coalesce(p_query, '')), 60);
begin
  perform public.admin_guard();
  return query select w.health_worker_id, w.user_id, w.full_name, w.position, w.specialty, w.phone, w.is_online, w.is_active
  from public.health_workers w where v_query = '' or w.full_name ilike '%' || v_query || '%' or w.position ilike '%' || v_query || '%'
  order by w.full_name;
end; $$;

create or replace function public.list_admin_profiles()
returns table (user_id uuid, role public.app_role, display_name text, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query select p.user_id, p.role, p.display_name, p.is_active, p.created_at, p.updated_at from public.profiles p order by p.created_at desc;
end; $$;

create or replace function public.list_admin_articles(p_query text default '')
returns table (article_id uuid, title text, slug text, summary text, content text, is_published boolean, author_user_id uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_query text := left(trim(coalesce(p_query, '')), 60);
begin
  perform public.admin_guard();
  return query select a.article_id, a.title, a.slug, a.summary, a.content, a.is_published, a.author_user_id, a.created_at, a.updated_at
  from public.health_articles a where v_query = '' or a.title ilike '%' || v_query || '%' order by a.updated_at desc;
end; $$;

create or replace function public.list_admin_emergency_contacts()
returns table (emergency_contact_id uuid, label text, phone text, whatsapp_url text, sort_order integer, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query select e.emergency_contact_id, e.label, e.phone, e.whatsapp_url, e.sort_order, e.is_active from public.emergency_contacts e order by e.sort_order, e.label;
end; $$;

create or replace function public.list_admin_audit_logs(p_limit integer default 50, p_offset integer default 0)
returns table (audit_log_id uuid, actor_user_id uuid, action text, entity text, entity_id uuid, metadata jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100)); v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.admin_guard();
  return query select l.audit_log_id, l.actor_user_id, l.action, l.entity, l.entity_id, l.metadata, l.created_at from public.audit_logs l order by l.created_at desc limit v_limit offset v_offset;
end; $$;

create or replace function public.admin_update_citizen(p_citizen_id uuid, p_full_name text, p_phone text default null, p_birth_date date default null, p_gender text default null, p_blood_type text default null, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 then raise exception using errcode = '22023', message = 'Nama warga tidak valid.'; end if;
  if p_gender is not null and p_gender not in ('perempuan', 'laki-laki', 'lainnya') then raise exception using errcode = '22023', message = 'Jenis kelamin tidak valid.'; end if;
  if p_blood_type is not null and p_blood_type !~ '^(A|B|AB|O)[+-]$' then raise exception using errcode = '22023', message = 'Golongan darah tidak valid.'; end if;
  update public.citizens set full_name = trim(p_full_name), phone = nullif(trim(p_phone), ''), birth_date = p_birth_date, gender = p_gender, blood_type = p_blood_type, is_active = coalesce(p_is_active, true), updated_at = now() where citizen_id = p_citizen_id;
  if not found then raise exception using errcode = '22023', message = 'Data warga tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'citizen', p_citizen_id, jsonb_build_object('fields', jsonb_build_array('full_name', 'phone', 'birth_date', 'gender', 'blood_type', 'is_active')));
  return jsonb_build_object('status', 'updated');
end; $$;

create or replace function public.admin_create_health_worker(p_full_name text, p_position text, p_specialty text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.admin_guard();
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 or nullif(trim(coalesce(p_position, '')), '') is null then raise exception using errcode = '22023', message = 'Data nakes tidak valid.'; end if;
  insert into public.health_workers(full_name, position, specialty, phone) values (trim(p_full_name), trim(p_position), nullif(trim(p_specialty), ''), nullif(trim(p_phone), '')) returning health_worker_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'health_worker', v_id, '{}'::jsonb);
  return jsonb_build_object('status', 'created', 'health_worker_id', v_id);
end; $$;

create or replace function public.admin_update_health_worker(p_health_worker_id uuid, p_full_name text, p_position text, p_specialty text default null, p_phone text default null, p_is_online boolean default false, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) > 120 or nullif(trim(coalesce(p_position, '')), '') is null then raise exception using errcode = '22023', message = 'Data nakes tidak valid.'; end if;
  update public.health_workers set full_name = trim(p_full_name), position = trim(p_position), specialty = nullif(trim(p_specialty), ''), phone = nullif(trim(p_phone), ''), is_online = coalesce(p_is_online, false), is_active = coalesce(p_is_active, true) where health_worker_id = p_health_worker_id;
  if not found then raise exception using errcode = '22023', message = 'Data nakes tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'health_worker', p_health_worker_id, '{}'::jsonb);
  return jsonb_build_object('status', 'updated');
end; $$;

create or replace function public.admin_create_article(p_title text, p_slug text, p_summary text, p_content text, p_is_published boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_summary, ''))) not between 1 and 300 or length(trim(coalesce(p_content, ''))) not between 1 and 10000 then raise exception using errcode = '22023', message = 'Data informasi kesehatan tidak valid.'; end if;
  insert into public.health_articles(title, slug, summary, content, is_published, author_user_id) values (trim(p_title), lower(trim(p_slug)), trim(p_summary), trim(p_content), coalesce(p_is_published, false), auth.uid()) returning article_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'health_article', v_id, jsonb_build_object('is_published', coalesce(p_is_published, false)));
  return jsonb_build_object('status', 'created', 'article_id', v_id);
exception when unique_violation then raise exception using errcode = '23505', message = 'Slug sudah digunakan.';
end; $$;

create or replace function public.admin_update_article(p_article_id uuid, p_title text, p_slug text, p_summary text, p_content text, p_is_published boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_summary, ''))) not between 1 and 300 or length(trim(coalesce(p_content, ''))) not between 1 and 10000 then raise exception using errcode = '22023', message = 'Data informasi kesehatan tidak valid.'; end if;
  update public.health_articles set title = trim(p_title), slug = lower(trim(p_slug)), summary = trim(p_summary), content = trim(p_content), is_published = coalesce(p_is_published, false), updated_at = now() where article_id = p_article_id;
  if not found then raise exception using errcode = '22023', message = 'Informasi kesehatan tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'health_article', p_article_id, jsonb_build_object('is_published', coalesce(p_is_published, false)));
  return jsonb_build_object('status', 'updated');
exception when unique_violation then raise exception using errcode = '23505', message = 'Slug sudah digunakan.';
end; $$;

create or replace function public.admin_create_emergency_contact(p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  insert into public.emergency_contacts(label, phone, whatsapp_url, sort_order) values (trim(p_label), trim(p_phone), nullif(trim(p_whatsapp_url), ''), coalesce(p_sort_order, 0)) returning emergency_contact_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'emergency_contact', v_id, '{}'::jsonb);
  return jsonb_build_object('status', 'created', 'emergency_contact_id', v_id);
end; $$;

create or replace function public.admin_update_emergency_contact(p_emergency_contact_id uuid, p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  update public.emergency_contacts set label = trim(p_label), phone = trim(p_phone), whatsapp_url = nullif(trim(p_whatsapp_url), ''), sort_order = coalesce(p_sort_order, 0), is_active = coalesce(p_is_active, true) where emergency_contact_id = p_emergency_contact_id;
  if not found then raise exception using errcode = '22023', message = 'Kontak darurat tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'emergency_contact', p_emergency_contact_id, '{}'::jsonb);
  return jsonb_build_object('status', 'updated');
end; $$;

revoke all on function public.admin_guard() from public;
revoke all on function public.get_admin_summary() from public;
revoke all on function public.list_admin_citizens(text, integer, integer) from public;
revoke all on function public.list_admin_households(text, integer, integer) from public;
revoke all on function public.list_admin_rts() from public;
revoke all on function public.list_admin_health_workers(text) from public;
revoke all on function public.list_admin_profiles() from public;
revoke all on function public.list_admin_articles(text) from public;
revoke all on function public.list_admin_emergency_contacts() from public;
revoke all on function public.list_admin_audit_logs(integer, integer) from public;
revoke all on function public.admin_update_citizen(uuid, text, text, date, text, text, boolean) from public;
revoke all on function public.admin_create_health_worker(text, text, text, text) from public;
revoke all on function public.admin_update_health_worker(uuid, text, text, text, text, boolean, boolean) from public;
revoke all on function public.admin_create_article(text, text, text, text, boolean) from public;
revoke all on function public.admin_update_article(uuid, text, text, text, text, boolean) from public;
revoke all on function public.admin_create_emergency_contact(text, text, text, integer) from public;
revoke all on function public.admin_update_emergency_contact(uuid, text, text, text, integer, boolean) from public;

grant execute on function public.get_admin_summary() to authenticated;
grant execute on function public.list_admin_citizens(text, integer, integer) to authenticated;
grant execute on function public.list_admin_households(text, integer, integer) to authenticated;
grant execute on function public.list_admin_rts() to authenticated;
grant execute on function public.list_admin_health_workers(text) to authenticated;
grant execute on function public.list_admin_profiles() to authenticated;
grant execute on function public.list_admin_articles(text) to authenticated;
grant execute on function public.list_admin_emergency_contacts() to authenticated;
grant execute on function public.list_admin_audit_logs(integer, integer) to authenticated;
grant execute on function public.admin_update_citizen(uuid, text, text, date, text, text, boolean) to authenticated;
grant execute on function public.admin_create_health_worker(text, text, text, text) to authenticated;
grant execute on function public.admin_update_health_worker(uuid, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.admin_create_article(text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_update_article(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_create_emergency_contact(text, text, text, integer) to authenticated;
grant execute on function public.admin_update_emergency_contact(uuid, text, text, text, integer, boolean) to authenticated;
