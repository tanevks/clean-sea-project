create table if not exists public.initiative_submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid references auth.users(id) on delete set null,
  submitter_name text not null check (char_length(btrim(submitter_name)) between 2 and 120),
  submitter_email text not null check (char_length(btrim(submitter_email)) between 5 and 240),
  submitter_phone text,
  category text not null check (category in ('idea', 'initiative')),
  title text not null check (char_length(btrim(title)) between 5 and 180),
  description text not null check (char_length(btrim(description)) between 20 and 4000),
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'published')),
  review_note text,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_initiative_submissions_updated_at on public.initiative_submissions;
create trigger trg_initiative_submissions_updated_at
before update on public.initiative_submissions
for each row
execute function public.set_updated_at();

create index if not exists idx_initiative_submissions_status_created_at
  on public.initiative_submissions(status, created_at desc);

create index if not exists idx_initiative_submissions_published_at
  on public.initiative_submissions(published_at desc);
