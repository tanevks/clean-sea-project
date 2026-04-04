do $$
begin
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type approval_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

alter table public.profiles
add column if not exists approval_status approval_status not null default 'approved';

update public.profiles
set approval_status = 'approved'
where approval_status is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    avatar_url,
    phone,
    is_active,
    approval_status
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'phone',
    false,
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.notify_admins_about_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status <> 'pending' then
    return new;
  end if;

  insert into public.user_notifications (user_id, type, title, body, metadata)
  select
    admin_profile.id,
    'user_approval_required',
    'New user approval required',
    coalesce(new.display_name, 'A new user') || ' is waiting for approval.',
    jsonb_build_object(
      'userId', new.id,
      'displayName', new.display_name
    )
  from public.profiles admin_profile
  where admin_profile.role = 'admin'
    and coalesce(admin_profile.is_active, true) = true
    and coalesce(admin_profile.approval_status, 'approved') = 'approved';

  return new;
end;
$$;

drop trigger if exists trg_profiles_notify_admin_on_pending on public.profiles;
create trigger trg_profiles_notify_admin_on_pending
after insert on public.profiles
for each row
execute function public.notify_admins_about_new_user();

create index if not exists idx_profiles_approval_status
  on public.profiles(approval_status, created_at desc);
