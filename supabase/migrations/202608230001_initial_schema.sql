-- Desa Sehat Kenanga — demo schema
-- All seeded identity/health data must remain synthetic.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('warga', 'nakes', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.blood_sugar_context as enum ('puasa', 'sewaktu', 'setelah_makan');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'warga',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rws (
  rw_id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rts (
  rt_id uuid primary key default gen_random_uuid(),
  rw_id uuid not null references public.rws(rw_id),
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (rw_id, code)
);

create table if not exists public.households (
  household_id uuid primary key default gen_random_uuid(),
  rt_id uuid not null references public.rts(rt_id),
  household_number text not null,
  head_name text not null,
  address text not null,
  created_at timestamptz not null default now(),
  unique (rt_id, household_number)
);

create table if not exists public.citizens (
  citizen_id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(household_id),
  nik_hash text not null unique,
  nik_last4 text not null check (nik_last4 ~ '^[0-9]{4}$'),
  full_name text not null,
  phone text,
  birth_date date,
  gender text check (gender in ('perempuan', 'laki-laki', 'lainnya')),
  blood_type text check (blood_type ~ '^(A|B|AB|O)[+-]$'),
  marital_status text,
  emergency_contact_name text,
  emergency_contact_phone text,
  family_relation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linked_accounts (
  linked_account_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  citizen_id uuid not null references public.citizens(citizen_id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (user_id, citizen_id)
);

create unique index if not exists one_citizen_per_auth_user on public.linked_accounts(user_id);

create table if not exists public.health_workers (
  health_worker_id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(user_id) on delete set null,
  full_name text not null,
  position text not null,
  specialty text,
  phone text,
  is_online boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.health_records (
  health_record_id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.citizens(citizen_id) on delete cascade,
  examiner_user_id uuid references auth.users(id) on delete set null,
  examined_at timestamptz not null default now(),
  complaint text,
  notes text,
  needs_follow_up boolean not null default false,
  reference_note text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create table if not exists public.blood_pressure_records (
  health_record_id uuid primary key references public.health_records(health_record_id) on delete cascade,
  systolic integer not null check (systolic between 40 and 300),
  diastolic integer not null check (diastolic between 20 and 200),
  pulse_bpm integer check (pulse_bpm between 20 and 250)
);

create table if not exists public.blood_sugar_records (
  health_record_id uuid primary key references public.health_records(health_record_id) on delete cascade,
  value_mg_dl numeric(7,2) not null check (value_mg_dl between 1 and 2000),
  context public.blood_sugar_context not null
);

create table if not exists public.weight_records (
  health_record_id uuid primary key references public.health_records(health_record_id) on delete cascade,
  weight_kg numeric(6,2) not null check (weight_kg between 1 and 500),
  height_cm numeric(6,2) check (height_cm between 30 and 250)
);

create table if not exists public.temperature_records (
  health_record_id uuid primary key references public.health_records(health_record_id) on delete cascade,
  temperature_c numeric(4,1) not null check (temperature_c between 25 and 45)
);

create table if not exists public.pulse_records (
  health_record_id uuid primary key references public.health_records(health_record_id) on delete cascade,
  pulse_bpm integer not null check (pulse_bpm between 20 and 250)
);

create table if not exists public.health_articles (
  article_id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null,
  content text not null,
  is_published boolean not null default false,
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emergency_contacts (
  emergency_contact_id uuid primary key default gen_random_uuid(),
  label text not null,
  phone text not null,
  whatsapp_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  audit_log_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists citizens_household_idx on public.citizens(household_id);
create index if not exists health_records_citizen_date_idx on public.health_records(citizen_id, examined_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid() and is_active = true limit 1
$$;

alter table public.profiles enable row level security;
alter table public.rws enable row level security;
alter table public.rts enable row level security;
alter table public.households enable row level security;
alter table public.citizens enable row level security;
alter table public.linked_accounts enable row level security;
alter table public.health_workers enable row level security;
alter table public.health_records enable row level security;
alter table public.blood_pressure_records enable row level security;
alter table public.blood_sugar_records enable row level security;
alter table public.weight_records enable row level security;
alter table public.temperature_records enable row level security;
alter table public.pulse_records enable row level security;
alter table public.health_articles enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles own or staff read" on public.profiles for select using (user_id = auth.uid() or public.current_app_role() in ('nakes', 'admin'));
create policy "profiles own update" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "public reads published articles" on public.health_articles for select using (is_published = true or public.current_app_role() = 'admin');
create policy "public reads active contacts" on public.emergency_contacts for select using (is_active = true);
create policy "authenticated reads region" on public.rws for select to authenticated using (true);
create policy "authenticated reads rt" on public.rts for select to authenticated using (true);
create policy "authenticated reads household" on public.households for select to authenticated using (true);
create policy "staff reads workers" on public.health_workers for select to authenticated using (is_active = true or public.current_app_role() = 'admin');

create policy "citizen own or staff read" on public.citizens for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'admin')
);
create policy "citizen own limited update" on public.citizens for update using (citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())) with check (citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()));

create policy "linked account own read" on public.linked_accounts for select using (user_id = auth.uid() or public.current_app_role() = 'admin');
create policy "health own or staff read" on public.health_records for select using (
  citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
  or public.current_app_role() in ('nakes', 'admin')
);
create policy "health staff insert" on public.health_records for insert to authenticated with check (public.current_app_role() in ('nakes', 'admin') and examiner_user_id = auth.uid());
create policy "health staff update" on public.health_records for update using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));

create policy "health details own or staff read" on public.blood_pressure_records for select using (exists (select 1 from public.health_records r where r.health_record_id = health_record_id and (r.citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid()) or public.current_app_role() in ('nakes', 'admin'))));
create policy "health details staff write" on public.blood_pressure_records for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));
create policy "sugar details staff" on public.blood_sugar_records for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));
create policy "weight details staff" on public.weight_records for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));
create policy "temperature details staff" on public.temperature_records for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));
create policy "pulse details staff" on public.pulse_records for all using (public.current_app_role() in ('nakes', 'admin')) with check (public.current_app_role() in ('nakes', 'admin'));

create policy "notifications own" on public.notifications for select using (user_id = auth.uid());
create policy "notifications own update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit admin read" on public.audit_logs for select using (public.current_app_role() = 'admin');

-- Registration/linking and health writes should be exposed through security-definer RPCs
-- after request verification and rate limiting are configured.
