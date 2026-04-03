alter table public.report_media
add column if not exists is_hidden boolean not null default false,
add column if not exists hidden_at timestamptz,
add column if not exists hidden_by_user_id uuid references auth.users(id) on delete set null,
add column if not exists hidden_reason text;

create index if not exists idx_report_media_visible
  on public.report_media(report_id, is_hidden, created_at asc);
