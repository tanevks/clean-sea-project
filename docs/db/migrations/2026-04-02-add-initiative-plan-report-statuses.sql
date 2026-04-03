alter table public.initiative_submissions
add column if not exists implementation_plan text,
add column if not exists implementation_report text,
add column if not exists plan_updated_at timestamptz,
add column if not exists report_updated_at timestamptz,
add column if not exists plan_updated_by_user_id uuid references auth.users(id) on delete set null,
add column if not exists report_updated_by_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'initiative_submissions_status_check'
  ) then
    alter table public.initiative_submissions
    drop constraint initiative_submissions_status_check;
  end if;
end $$;

alter table public.initiative_submissions
add constraint initiative_submissions_status_check
check (status in ('new', 'approved', 'rejected', 'published', 'executed', 'inactive'));
