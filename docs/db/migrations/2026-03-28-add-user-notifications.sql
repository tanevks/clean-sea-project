create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  report_id uuid references public.reports(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_id_created_at
  on public.user_notifications(user_id, created_at desc);

create index if not exists idx_user_notifications_user_id_is_read
  on public.user_notifications(user_id, is_read, created_at desc);
