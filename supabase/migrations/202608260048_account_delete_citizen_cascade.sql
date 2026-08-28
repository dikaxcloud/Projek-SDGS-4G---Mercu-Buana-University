-- Migration: hapus akun dari halaman Admin & Akses = bersihkan SEMUA data terhubung
-- Sebelumnya: hapus akun warga -> linked_accounts terhapus (cascade),
--             tapi data citizens + riwayat pemeriksaannya tetap ada
--             -> masih muncul di halaman Warga.
-- Sekarang: akun dihapus -> data warga terhubung + riwayat pemeriksaannya ikut terhapus.

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_role text; v_dir_deleted integer := 0;
  v_citizen_id uuid; v_citizen_name text; v_records integer := 0;
  v_caller_is_owner boolean; v_target_is_owner boolean;
begin
  perform public.admin_guard();
  perform public.admin_only_guard();
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Akun Anda sendiri tidak dapat dihapus.';
  end if;
  v_caller_is_owner := exists (select 1 from public.app_owners o where o.user_id = auth.uid());
  select u.email, p.role into v_email, v_role
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id;
  if not found then raise exception using errcode = '22023', message = 'Akun tidak ditemukan.'; end if;
  v_target_is_owner := exists (select 1 from public.app_owners o where o.user_id = p_user_id);
  if v_target_is_owner then
    raise exception using errcode = '42501', message = 'Akun owner tidak dapat dihapus.';
  end if;
  if coalesce(v_role, '') = 'admin' and not v_caller_is_owner then
    raise exception using errcode = '42501', message = 'Hanya pemilik aplikasi (owner) yang dapat menghapus akun admin.';
  end if;

  -- Identifikasi data warga yang terhubung (sebelum tautan hilang)
  select la.citizen_id, c.full_name into v_citizen_id, v_citizen_name
    from public.linked_accounts la
    join public.citizens c on c.citizen_id = la.citizen_id
    where la.user_id = p_user_id
    limit 1;
  if v_citizen_id is not null then
    select count(*) into v_records from public.health_records where citizen_id = v_citizen_id;
  end if;

  -- 1. Bersihkan direktori nakes (jika akunnya nakes)
  delete from public.health_workers where user_id = p_user_id;
  get diagnostics v_dir_deleted = row_count;

  -- 2. Hapus data warga terhubung (riwayat pemeriksaan ikut cascade otomatis)
  if v_citizen_id is not null then
    delete from public.citizens where citizen_id = v_citizen_id;
  end if;

  -- 3. Terakhir, hapus akunnya
  delete from auth.users where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'delete', 'user', p_user_id, jsonb_build_object(
      'email', v_email,
      'role', coalesce(v_role, 'tanpa_role'),
      'by_owner', v_caller_is_owner,
      'health_worker_rows_deleted', v_dir_deleted,
      'citizen_deleted', coalesce(v_citizen_name, ''),
      'health_records_deleted', v_records));
  return jsonb_build_object('status', 'deleted', 'health_worker_rows_deleted', v_dir_deleted, 'citizen_deleted', coalesce(v_citizen_name, ''));
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
