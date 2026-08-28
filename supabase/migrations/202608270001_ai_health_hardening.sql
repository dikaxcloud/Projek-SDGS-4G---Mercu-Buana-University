alter table public.ai_health_analyses
  drop constraint if exists ai_health_analyses_analysis_type_check;

alter table public.ai_health_analyses
  add constraint ai_health_analyses_analysis_type_check
  check (
    analysis_type in ('record_analysis', 'nakes_summary')
    or analysis_type ~ '^trend_analysis:(blood_pressure|sugar|weight|temperature|pulse)$'
  );

create index if not exists ai_health_analyses_trend_cache_idx
  on public.ai_health_analyses (citizen_id, analysis_type, created_at desc);

drop policy if exists "ai_analyses_staff_write" on public.ai_health_analyses;
revoke insert, update, delete on public.ai_health_analyses from anon, authenticated;
