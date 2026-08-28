-- Emergency contacts: add officer_name (nama petugas) to contacts, list, create & update RPCs.

alter table public.emergency_contacts add column if not exists officer_name text;

drop function if exists public.list_admin_emergency_contacts();
create or replace function public.list_admin_emergency_contacts()
returns table (emergency_contact_id uuid, officer_name text, label text, phone text, whatsapp_url text, sort_order integer, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query select e.emergency_contact_id, e.officer_name, e.label, e.phone, e.whatsapp_url, e.sort_order, e.is_active from public.emergency_contacts e order by e.sort_order, e.label;
end; $$;

drop function if exists public.admin_create_emergency_contact(text, text, text, integer);
create or replace function public.admin_create_emergency_contact(p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0, p_officer_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sort integer; v_wa text; v_officer text;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  if length(trim(coalesce(p_officer_name, ''))) > 120 then raise exception using errcode = '22023', message = 'Nama petugas tidak valid.'; end if;
  v_officer := nullif(trim(coalesce(p_officer_name, '')), '');
  v_wa := coalesce(nullif(trim(p_whatsapp_url), ''), public.emergency_contact_wa_url(p_phone));
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.emergency_contacts;
  insert into public.emergency_contacts(label, phone, whatsapp_url, sort_order, officer_name) values (trim(p_label), trim(p_phone), v_wa, v_sort, v_officer) returning emergency_contact_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'emergency_contact', v_id, '{}'::jsonb);
  return jsonb_build_object('status', 'created', 'emergency_contact_id', v_id);
end; $$;

drop function if exists public.admin_update_emergency_contact(uuid, text, text, text, integer, boolean);
create or replace function public.admin_update_emergency_contact(p_emergency_contact_id uuid, p_label text, p_phone text, p_whatsapp_url text default null, p_sort_order integer default 0, p_is_active boolean default true, p_officer_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_officer text;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_label, ''))) not between 1 and 120 or length(trim(coalesce(p_phone, ''))) not between 5 and 30 then raise exception using errcode = '22023', message = 'Kontak darurat tidak valid.'; end if;
  if p_whatsapp_url is not null and p_whatsapp_url !~ '^https://(wa\.me|api\.whatsapp\.com)/' then raise exception using errcode = '22023', message = 'URL WhatsApp tidak valid.'; end if;
  if length(trim(coalesce(p_officer_name, ''))) > 120 then raise exception using errcode = '22023', message = 'Nama petugas tidak valid.'; end if;
  v_officer := nullif(trim(coalesce(p_officer_name, '')), '');
  update public.emergency_contacts
    set label = trim(p_label),
        phone = trim(p_phone),
        whatsapp_url = coalesce(nullif(trim(p_whatsapp_url), ''), public.emergency_contact_wa_url(p_phone)),
        sort_order = coalesce(p_sort_order, 0),
        is_active = coalesce(p_is_active, true),
        officer_name = v_officer
    where emergency_contact_id = p_emergency_contact_id;
  if not found then raise exception using errcode = '22023', message = 'Kontak darurat tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'emergency_contact', p_emergency_contact_id, '{}'::jsonb);
  return jsonb_build_object('status', 'updated');
end; $$;

revoke all on function public.list_admin_emergency_contacts() from public;
revoke all on function public.admin_create_emergency_contact(text, text, text, integer, text) from public;
revoke all on function public.admin_update_emergency_contact(uuid, text, text, text, integer, boolean, text) from public;
grant execute on function public.list_admin_emergency_contacts() to authenticated;
grant execute on function public.admin_create_emergency_contact(text, text, text, integer, text) to authenticated;
grant execute on function public.admin_update_emergency_contact(uuid, text, text, text, integer, boolean, text) to authenticated;
