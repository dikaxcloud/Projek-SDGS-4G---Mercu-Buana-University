# Desa Sehat Kenanga

Portal kesehatan warga desa. Semua data yang digunakan pada demo ini adalah data dummy.

## Jalankan frontend

```bash
cd frontend
npm install
npm run dev
```

Salin `.env.example` menjadi `.env`. Landing page dan akun demo dapat dicoba tanpa Supabase. Google OAuth aktif setelah `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan provider Google dikonfigurasi.

## Status fase

Fase 1–14 telah memiliki implementasi demo. Fase 15 dapat diverifikasi dengan test/build lokal. Fase 16 memerlukan login Vercel dan environment variable milik deployment.

Alur demo:

- Demo Warga: `/login` → masuk sebagai warga → kesehatan, riwayat, profil, keluarga, notifikasi, bantuan.
- Demo Nakes: `/login` → masuk sebagai nakes → cari warga → catat pemeriksaan.
- Demo Admin: `/login` → masuk sebagai admin → ringkasan, manajemen data, audit log.

Mode demo memakai data sintetis lokal. Mode Supabase memakai RLS dan RPC database.

## Konfigurasi Supabase Auth

1. Buat project Supabase demo.
2. Jalankan migration berurutan, lalu seed:

```bash
supabase db reset
```

3. Pada Supabase: `Authentication → Providers → Google`, isi Google Client ID dan Client Secret.
4. Daftarkan callback Supabase yang ditampilkan pada halaman provider Google, lalu izinkan URL aplikasi (`http://localhost:5173/login` untuk dev) pada `Authentication → URL Configuration`.
5. Salin `.env.example` menjadi `.env` dan isi URL + anon key. Jangan masukkan service role key ke frontend.

Registrasi warga memerlukan akun Google yang sudah login. Admin dapat membuat token linking melalui RPC `create_account_link_token`; token diberikan lewat kanal terverifikasi, tidak ditaruh di URL.

## RPC utama

- `get_my_access()` — bootstrap role dan citizen link.
- `register_citizen(...)` — membuat satu citizen + link auth atomik; duplicate NIK tidak membuat citizen kedua.
- `link_account(...)` — memakai token admin sekali pakai dan identitas provider yang sudah terautentikasi.
- `create_health_record(...)` — hanya nakes/admin, validasi server, audit log, notifikasi, dan idempotency key.
- `get_my_citizen_context()` — profil masked dan anggota KK milik warga aktif.
- `update_my_citizen_profile(...)` — update nama/telepon allowlist dengan audit log.
- `mark_notification_read(...)` — menandai notifikasi milik sesi aktif melalui RPC.

Migration `202608240006` sampai `202608240008` wajib diterapkan pada project Supabase sebelum mode production dipakai.

Demo mode tetap tersedia tanpa Supabase dan tidak mewakili kontrol akses production.

Jangan memasukkan NIK atau data kesehatan nyata ke demo.

## Build dan deployment Vercel

```bash
npm install
npm run test
npm run check:security
npm run build
npm run dev -- --host 0.0.0.0
```

Untuk deployment publik, jalankan dari folder `frontend` setelah login Vercel:

```bash
npx vercel
npx vercel --prod
```

Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` pada environment Vercel bila memakai Supabase. Jangan masukkan service role key ke frontend.

PWA offline hanya menyimpan app shell dan antrean perubahan milik sesi aktif. Tanpa jaringan, aplikasi tidak mengklaim pesan terkirim ke petugas. Realtime memerlukan Supabase Realtime aktif; mode demo memakai data lokal/manual refresh.

Untuk seed remote, jalankan `supabase/seed.sql` melalui SQL Editor setelah migration selesai. Target minimal: 5 RT dan 50 KK.

Jangan memasukkan NIK atau data kesehatan nyata ke demo.
