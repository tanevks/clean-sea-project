create table if not exists public.initiative_comments (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.initiative_submissions(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  visibility visibility_type not null default 'public',
  message text not null check (char_length(message) between 1 and 1000),
  is_hidden boolean not null default false,
  hidden_at timestamptz,
  hidden_by_user_id uuid references auth.users(id) on delete set null,
  hidden_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_initiative_comments_initiative_id
  on public.initiative_comments(initiative_id, created_at desc);

create index if not exists idx_initiative_comments_visible
  on public.initiative_comments(initiative_id, visibility, is_hidden, created_at desc);
