create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 160),
  geojson jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_areas_updated_at on public.service_areas;
create trigger trg_service_areas_updated_at
before update on public.service_areas
for each row
execute function public.set_updated_at();

create index if not exists idx_service_areas_is_active
  on public.service_areas(is_active, name);
