create table if not exists public.cleanup_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  scheduled_at timestamptz not null,
  meeting_address text not null,
  meeting_latitude double precision,
  meeting_longitude double precision,
  instructions_text text not null,
  tools_note text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (meeting_latitude is null and meeting_longitude is null)
    or
    (meeting_latitude between -90 and 90 and meeting_longitude between -180 and 180)
  )
);

drop trigger if exists trg_cleanup_events_updated_at on public.cleanup_events;
create trigger trg_cleanup_events_updated_at
before update on public.cleanup_events
for each row
execute function public.set_updated_at();

create index if not exists idx_cleanup_events_scheduled_at
  on public.cleanup_events(scheduled_at asc);
