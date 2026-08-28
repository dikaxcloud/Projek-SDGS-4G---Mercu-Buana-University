-- Migration: QR activation support — revocable tokens + status inspection.
-- Additive only.

alter table public.account_link_tokens add column if not exists revoked_at timestamptz;

-- ============================================================
-- Revoke all pending tokens for a citizen (staff)
-- ============================================================
create or replace function public.revoke_citizen_tokens(p_citizen_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  perform public.staff_guard();
  update public.account_link_tokens
  set revoked_at = now()
  where citizen_id = p_citizen_id
    and revoked_at is null
    and consumed_at is null
    and expires_at > now();
  get diagnostics v_count = row_count;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'revoke_link_token', 'citizen', p_citizen_id, jsonb_build_object('revoked', v_count));
  return jsonb_build_object('status', 'revoked', 'count', v_count);
end;
$$;

-- ============================================================
-- Latest activation token status for a citizen (staff)
-- state: none | active | expiring | expired | used | revoked
-- ============================================================
create or replace function public.get_activation_status(p_citizen_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_row record;
begin
  perform public.staff_guard();
  select * into v_row
  from public.account_link_tokens
  where citizen_id = p_citizen_id
  order by created_at desc
  limit 1;

  if v_row.link_token_id is null then
    return jsonb_build_object('state', 'none');
  end if;

  return jsonb_build_object(
    'state', case
      when v_row.revoked_at is not null then 'revoked'
      when v_row.consumed_at is not null then 'used'
      when v_row.expires_at <= now() then 'expired'
      when v_row.expires_at <= now() + interval '5 minutes' then 'expiring'
      else 'active'
    end,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at,
    'consumed_at', v_row.consumed_at,
    'revoked_at', v_row.revoked_at
  );
end;
$$;

revoke all on function public.revoke_citizen_tokens(uuid) from public;
revoke all on function public.get_activation_status(uuid) from public;
grant execute on function public.revoke_citizen_tokens(uuid) to authenticated;
grant execute on function public.get_activation_status(uuid) to authenticated;
