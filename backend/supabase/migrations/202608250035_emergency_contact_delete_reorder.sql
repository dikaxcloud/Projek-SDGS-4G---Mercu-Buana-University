-- Emergency contacts: delete + reorder + auto WhatsApp URL from phone.
-- - admin_delete_emergency_contact: hard delete (admin only, audited).
-- - admin_move_emergency_contact: swap sort_order with the neighbour (up/down).
-- - emergency_contact_wa_url: derive https://wa.me/62xxx from 08xx/62xx/8xx numbers.
-- - create/update: whatsapp_url auto-derived when not supplied; create appends to the end.

create or replace function public.emergency_contact_wa_url(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when d = '' then null
    when left(d, 2) = '62' then 'https://wa.me/' || d
    when left(d, 1) = '0' then 'https://wa.me/62' || substr(d, 2)
    when left(d, 1) = '8' then 'https://wa.me/62' || d
    else null
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) digits;
$$;

create or replace function public.admin_create_emergency_contact(p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sort integer; v_wa text;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  v_wa := coalesce(nullif(trim(p_whatsapp_url), ''), public.emergency_contact_wa_url(p_phone));
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.emergency_contacts;
  insert into public.emergency_contacts(label, phone, whatsapp_url, sort_order) values (trim(p_label), trim(p_phone), v_wa, v_sort) returning emergency_contact_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'emergency_contact', v_id, '{}'::jsonb);
  return jsonb_build_object('status', 'created', 'emergency_contact_id', v_id);
end; $$;

create or replace function public.admin_update_emergency_contact(p_emergency_contact_id uuid, p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  update public.emergency_contacts
    set label = trim(p_label),
        phone = trim(p_phone),
        whatsapp_url = coalesce(nullif(trim(p_whatsapp_url), ''), public.emergency_contact_wa_url(p_phone)),
        sort_order = coalesce(p_sort_order, 0),
        is_active = coalesce(p_is_active, true)
    where emergency_contact_id = p_emergency_contact_id;
  if not found then raise exception using errcode = '22023', message = 'Kontak darurat tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'emergency_contact', p_emergency_contact_id, '{}'::jsonb);
  return jsonb_build_object('status', 'updated');
end; $$;

create or replace function public.admin_delete_emergency_contact(p_emergency_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  perform public.admin_guard();
  select label into v_label from public.emergency_contacts where emergency_contact_id = p_emergency_contact_id;
  if not found then raise exception using errcode = '22023', message = 'Kontak darurat tidak ditemukan.'; end if;
  delete from public.emergency_contacts where emergency_contact_id = p_emergency_contact_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'delete', 'emergency_contact', p_emergency_contact_id, jsonb_build_object('label', v_label));
  return jsonb_build_object('status', 'deleted');
end; $$;

create or replace function public.admin_move_emergency_contact(p_emergency_contact_id uuid, p_direction text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sort integer; v_target uuid; v_target_sort integer;
begin
  perform public.admin_guard();
  if p_direction not in ('up', 'down') then raise exception using errcode = '22023', message = 'Arah tidak valid.'; end if;
  select sort_order into v_sort from public.emergency_contacts where emergency_contact_id = p_emergency_contact_id;
  if not found then raise exception using errcode = '22023', message = 'Kontak darurat tidak ditemukan.'; end if;
  if p_direction = 'up' then
    select emergency_contact_id, sort_order into v_target, v_target_sort
      from public.emergency_contacts where sort_order < v_sort order by sort_order desc, label asc limit 1;
  else
    select emergency_contact_id, sort_order into v_target, v_target_sort
      from public.emergency_contacts where sort_order > v_sort order by sort_order asc, label asc limit 1;
  end if;
  if v_target is null then
    return jsonb_build_object('status', 'unchanged');
  end if;
  update public.emergency_contacts set sort_order = v_target_sort where emergency_contact_id = p_emergency_contact_id;
  update public.emergency_contacts set sort_order = v_sort where emergency_contact_id = v_target;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'move', 'emergency_contact', p_emergency_contact_id, jsonb_build_object('direction', p_direction));
  return jsonb_build_object('status', 'moved', 'direction', p_direction);
end; $$;

revoke all on function public.admin_delete_emergency_contact(uuid) from public;
revoke all on function public.admin_move_emergency_contact(uuid, text) from public;
grant execute on function public.admin_delete_emergency_contact(uuid) to authenticated;
grant execute on function public.admin_move_emergency_contact(uuid, text) to authenticated;
