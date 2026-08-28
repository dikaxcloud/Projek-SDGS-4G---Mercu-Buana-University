-- Auto-sync the public health-team directory (health_workers) with nakes accounts.
-- - Promote to nakes  -> directory row auto-created (adopts an existing manual row
--   with the same name to avoid duplicates) and visible on the landing page.
-- - Demote from nakes -> directory row deactivated (hidden from public list).
-- Admin can still freely edit position/specialty/phone of the auto-created row.

create or replace function public.sync_nakes_directory()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.role = 'nakes' then
    -- Adopt an existing manual directory entry with the same name (if this user has none yet).
    update public.health_workers w
       set user_id = NEW.user_id, is_active = true
     where w.user_id is null
       and lower(btrim(w.full_name)) = lower(btrim(coalesce(NEW.display_name, '')))
       and not exists (select 1 from public.health_workers x where x.user_id = NEW.user_id);
    -- Ensure a directory row exists for this user.
    insert into public.health_workers (user_id, full_name, position, is_active)
    select NEW.user_id, coalesce(nullif(btrim(NEW.display_name), ''), 'Tenaga Kesehatan'), 'Tenaga Kesehatan Desa', true
    where not exists (select 1 from public.health_workers where user_id = NEW.user_id);
  elsif OLD.role = 'nakes' and NEW.role <> 'nakes' then
    update public.health_workers set is_active = false where user_id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_profiles_role_change on public.profiles;
create trigger on_profiles_role_change
after insert or update of role on public.profiles
for each row execute function public.sync_nakes_directory();
