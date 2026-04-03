alter table public.report_media
add column if not exists media_context text not null default 'report',
add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null;

update public.report_media
set media_context = 'report'
where media_context is null or btrim(media_context) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_media_media_context_check'
  ) then
    alter table public.report_media
    add constraint report_media_media_context_check
    check (media_context in ('report', 'cleanup_evidence'));
  end if;
end $$;

create index if not exists idx_report_media_report_id_context
  on public.report_media(report_id, media_context, created_at asc);
