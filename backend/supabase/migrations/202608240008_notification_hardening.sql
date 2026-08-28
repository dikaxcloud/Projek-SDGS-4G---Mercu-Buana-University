-- Restrict notification mutations to audited read-status workflow.

drop policy if exists "notifications own update" on public.notifications;
revoke update on table public.notifications from anon, authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesi masuk diperlukan.';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where notification_id = p_notification_id and user_id = auth.uid()
  returning notification_id into v_updated;

  if v_updated is null then
    raise exception using errcode = '22023', message = 'Notifikasi tidak ditemukan.';
  end if;

  return jsonb_build_object('status', 'read', 'notification_id', v_updated);
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
