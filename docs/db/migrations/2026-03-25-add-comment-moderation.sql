alter table public.report_comments
add column if not exists is_hidden boolean not null default false,
add column if not exists hidden_at timestamptz,
add column if not exists hidden_by_user_id uuid references auth.users(id) on delete set null,
add column if not exists hidden_reason text;

create index if not exists idx_report_comments_visible
  on public.report_comments(report_id, visibility, is_hidden, created_at desc);
