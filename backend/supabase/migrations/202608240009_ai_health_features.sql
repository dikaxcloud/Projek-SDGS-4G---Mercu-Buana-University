-- Migration: Add AI Health Features tables & policies
-- Non-destructive additive migration

create table if not exists public.ai_health_analyses (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.citizens(citizen_id) on delete cascade,
  health_record_id uuid references public.health_records(health_record_id) on delete cascade,
  analysis_type text not null check (analysis_type in ('record_analysis', 'trend_analysis', 'nakes_summary')),
  status text not null check (status in ('normal', 'perlu_dipantau', 'perlu_konsultasi')),
  summary text not null,
  observations jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  disclaimer text not null default 'Analisis AI ini bersifat edukatif dan bukan diagnosis medis. Jika Anda memiliki keluhan atau kondisi khusus, konsultasikan dengan tenaga kesehatan.',
  model text not null default 'gemini-1.5-flash',
  prompt_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_analyses_citizen_idx on public.ai_health_analyses(citizen_id, created_at desc);
create index if not exists ai_analyses_record_idx on public.ai_health_analyses(health_record_id);

alter table public.ai_health_analyses enable row level security;

drop policy if exists "ai_analyses_own_or_staff_read" on public.ai_health_analyses;
create policy "ai_analyses_own_or_staff_read" on public.ai_health_analyses
  for select using (
    citizen_id in (select citizen_id from public.linked_accounts where user_id = auth.uid())
    or public.current_app_role() in ('nakes', 'admin')
  );

drop policy if exists "ai_analyses_staff_write" on public.ai_health_analyses;
create policy "ai_analyses_staff_write" on public.ai_health_analyses
  for all using (public.current_app_role() in ('nakes', 'admin'))
  with check (public.current_app_role() in ('nakes', 'admin'));
