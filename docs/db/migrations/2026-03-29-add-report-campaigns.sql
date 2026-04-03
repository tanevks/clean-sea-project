create table if not exists public.report_campaigns (
  report_id uuid primary key references public.reports(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_campaigns_campaign_id
  on public.report_campaigns(campaign_id, created_at desc);
