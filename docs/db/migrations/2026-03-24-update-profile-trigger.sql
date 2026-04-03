create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

update public.profiles p
set
  display_name = coalesce(
    nullif(p.display_name, ''),
    u.raw_user_meta_data->>'nickname',
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1)
  ),
  phone = coalesce(
    nullif(p.phone, ''),
    u.raw_user_meta_data->>'phone'
  )
from auth.users u
where u.id = p.id;
