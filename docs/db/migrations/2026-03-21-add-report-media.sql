create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_type') then
    create type media_type as enum ('image', 'video');
  end if;
end $$;

create table if not exists public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  media_type media_type not null,
  storage_key text not null unique,
  public_url text not null,
  thumbnail_url text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer,
  width_px integer,
  height_px integer,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_media_report_id
  on public.report_media(report_id);
