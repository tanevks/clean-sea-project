create table if not exists public.report_cleanup_participants (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (report_id, user_id)
);

create index if not exists idx_report_cleanup_participants_report_id
  on public.report_cleanup_participants(report_id, joined_at asc);

create index if not exists idx_report_cleanup_participants_user_id
  on public.report_cleanup_participants(user_id, joined_at desc);
