create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role user_role not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  report_id uuid references public.reports(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_audit_log_created_at
  on public.moderation_audit_log(created_at desc);

create index if not exists idx_moderation_audit_log_report_id
  on public.moderation_audit_log(report_id, created_at desc);
