create table if not exists public.moderation_alert_reads (
  moderator_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (moderator_user_id, entity_type, entity_id),
  check (
    entity_type in (
      'new_report',
      'new_initiative',
      'initiative_comment',
      'unscheduled_cleanup'
    )
  )
);

create index if not exists idx_moderation_alert_reads_user_type
  on public.moderation_alert_reads(moderator_user_id, entity_type, read_at desc);
