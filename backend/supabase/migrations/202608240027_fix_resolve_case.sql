-- Migration: fix resolve_citizen_qr — preserve token case when hashing.
create or replace function public.resolve_citizen_qr(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_clean text := regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g');
  v_hash text := encode(extensions.digest(v_clean, 'sha256'), 'hex');
  v_result jsonb;
begin
  perform public.staff_guard();
  select jsonb_build_object(
    'citizen_id', c.citizen_id,
    'full_name', c.full_name,
    'nik_last4', c.nik_last4,
    'rt_code', r.code,
    'household_number', h.household_number,
    'blood_type', c.blood_type,
    'gender', c.gender,
    'birth_date', c.birth_date,
    'verification_status', c.verification_status,
    'qr_state', q.status
  )
  into v_result
  from public.citizen_qr_codes q
  join public.citizens c on c.citizen_id = q.citizen_id
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  where q.token_hash = v_hash and q.status = 'ACTIVE';

  if v_result is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'citizen', v_result);
end;
$$;

revoke all on function public.resolve_citizen_qr(text) from public;
grant execute on function public.resolve_citizen_qr(text) to authenticated;

notify pgrst, 'reload schema';
