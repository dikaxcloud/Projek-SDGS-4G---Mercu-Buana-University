-- Migration: fix function overloads + ambiguous column refs.
-- 1) Remove legacy 13-arg register_citizen so PostgREST resolves cleanly.
drop function if exists public.register_citizen(text, text, text, text, text, date, text, text, text, text, text, text, text);

-- 2) Rebuild list_staff_citizens with fully qualified columns.
drop function if exists public.list_staff_citizens(text, text, text, integer, integer);
create function public.list_staff_citizens(
  p_query text default '', p_rt text default '', p_status text default '',
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  citizen_id uuid, full_name text, nik_last4 text, household_number text,
  rt_code text, phone text, gender text, blood_type text, birth_date date,
  family_relation text, is_active boolean, google_connected boolean,
  verification_status text, last_examined_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := left(trim(coalesce(p_query, '')), 60);
  v_rt text := left(trim(coalesce(p_rt, '')), 10);
  v_status text := lower(left(trim(coalesce(p_status, '')), 20));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  perform public.staff_guard();
  return query
  with latest_exam as (
    select hr.citizen_id as lx_cid, max(hr.examined_at) as lx_at
    from public.health_records hr group by hr.citizen_id
  )
  select c.citizen_id, c.full_name, c.nik_last4, h.household_number, r.code,
         c.phone, c.gender, c.blood_type, c.birth_date, c.family_relation, c.is_active,
         (la.linked_account_id is not null) as google_connected,
         c.verification_status::text as vs_text,
         le.lx_at as last_examined_at
  from public.citizens c
  join public.households h on h.household_id = c.household_id
  join public.rts r on r.rt_id = h.rt_id
  left join public.linked_accounts la on la.citizen_id = c.citizen_id
  left join latest_exam le on le.lx_cid = c.citizen_id
  where (v_query = '' or c.full_name ilike '%' || v_query || '%' or c.nik_last4 = right(regexp_replace(v_query, '[^0-9]', '', 'g'), 4) or h.household_number ilike '%' || v_query || '%')
    and (v_rt = '' or upper(r.code) = upper(v_rt))
    and (
      v_status = ''
      or (v_status = 'active' and c.is_active)
      or (v_status = 'inactive' and not c.is_active)
      or (v_status = 'connected' and la.linked_account_id is not null)
      or (v_status = 'pending' and la.linked_account_id is null)
      or (v_status = 'pending_verification' and c.verification_status = 'pending')
      or (v_status = 'verified' and c.verification_status = 'verified')
      or (v_status = 'rejected' and c.verification_status = 'rejected')
    )
  order by c.created_at desc nulls last, c.full_name
  limit v_limit offset v_offset;
end; $$;

revoke all on function public.list_staff_citizens(text, text, text, integer, integer) from public;
grant execute on function public.list_staff_citizens(text, text, text, integer, integer) to authenticated;

-- 3) Force PostgREST schema cache reload.
notify pgrst, 'reload schema';
