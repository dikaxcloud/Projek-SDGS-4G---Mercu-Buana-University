# Supabase backend — Desa Sehat Kenanga

## Isi

- `supabase/migrations/202608230001_initial_schema.sql`: tabel, constraint, helper role, dan RLS awal.
- `supabase/migrations/202608240005_admin_queries.sql`: dashboard dan RPC manajemen admin.
- `supabase/migrations/202608240006_security_hardening.sql`: hardening policy/RLS dan revoke direct writes.
- `supabase/migrations/202608240007_citizen_queries.sql`: query profil/keluarga warga dan update profil terbatas dengan audit.
- `supabase/migrations/202608240008_notification_hardening.sql`: read-status notifikasi melalui RPC dan revoke direct update.
- `supabase/seed.sql`: data sintetis untuk 5 RT × 10 KK, nakes, artikel, dan kontak.

## Jalankan

Gunakan Supabase CLI dari folder project:

```bash
supabase start
supabase db reset
```

Atau jalankan migration lalu seed pada project Supabase demo sesuai workflow organisasi.

## Catatan keamanan

- Seed memakai NIK sintetis yang di-hash; jangan masukkan NIK nyata.
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk migration/seed administratif, bukan frontend.
- Registration, account linking, dan pencatatan pemeriksaan sebaiknya dipanggil melalui RPC security-definer setelah request verification dan rate limiting disiapkan.
- RLS adalah enforcement utama. Route guard frontend hanya untuk pengalaman pengguna.
