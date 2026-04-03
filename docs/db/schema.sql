-- Clean Sea Project - MVP DB schema (Supabase)
-- PostgreSQL 15+ with PostGIS enabled in Supabase
-- Auth users are managed by Supabase in auth.users.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('citizen', 'moderator', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
        CREATE TYPE report_status AS ENUM ('new', 'in_review', 'planned_cleanup', 'resolved', 'rejected');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_channel') THEN
        CREATE TYPE source_channel AS ENUM ('mobile', 'web', 'chat');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
        CREATE TYPE media_type AS ENUM ('image', 'video');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_type') THEN
        CREATE TYPE visibility_type AS ENUM ('public', 'internal');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_channel_type') THEN
        CREATE TYPE chat_channel_type AS ENUM ('telegram', 'viber', 'whatsapp', 'webchat');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'citizen',
    display_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, phone)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nickname',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS user_channel_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel chat_channel_type NOT NULL,
    external_user_id TEXT NOT NULL,
    external_username TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (channel, external_user_id)
);

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    source source_channel NOT NULL,
    status report_status NOT NULL DEFAULT 'new',
    title TEXT,
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 500),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    accuracy_meters NUMERIC(7,2),
    address_text TEXT,
    city TEXT,
    country_code CHAR(2),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS report_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    media_type media_type NOT NULL,
    media_context TEXT NOT NULL DEFAULT 'report' CHECK (media_context IN ('report', 'cleanup_evidence')),
    storage_key TEXT NOT NULL UNIQUE,
    public_url TEXT NOT NULL,
    thumbnail_url TEXT,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    duration_seconds INTEGER,
    width_px INTEGER,
    height_px INTEGER,
    captured_at TIMESTAMPTZ,
    uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_at TIMESTAMPTZ,
    hidden_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hidden_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    from_status report_status,
    to_status report_status NOT NULL,
    changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    visibility visibility_type NOT NULL DEFAULT 'public',
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_at TIMESTAMPTZ,
    hidden_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hidden_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_cleanup_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS cleanup_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    meeting_address TEXT NOT NULL,
    meeting_latitude DOUBLE PRECISION,
    meeting_longitude DOUBLE PRECISION,
    instructions_text TEXT NOT NULL,
    tools_note TEXT,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (meeting_latitude IS NULL AND meeting_longitude IS NULL)
        OR
        (meeting_latitude BETWEEN -90 AND 90 AND meeting_longitude BETWEEN -180 AND 180)
    )
);

DROP TRIGGER IF EXISTS trg_cleanup_events_updated_at ON public.cleanup_events;
CREATE TRIGGER trg_cleanup_events_updated_at
BEFORE UPDATE ON public.cleanup_events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel chat_channel_type NOT NULL,
    external_chat_id TEXT NOT NULL,
    external_message_id TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    user_identity_id UUID REFERENCES user_channel_identities(id) ON DELETE SET NULL,
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role user_role NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS initiative_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submitter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitter_name TEXT NOT NULL CHECK (char_length(btrim(submitter_name)) BETWEEN 2 AND 120),
    submitter_email TEXT NOT NULL CHECK (char_length(btrim(submitter_email)) BETWEEN 5 AND 240),
    submitter_phone TEXT,
    category TEXT NOT NULL CHECK (category IN ('idea', 'initiative')),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 180),
    description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 20 AND 4000),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected', 'published', 'executed', 'inactive')),
    review_note TEXT,
    reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    implementation_plan TEXT,
    implementation_report TEXT,
    plan_updated_at TIMESTAMPTZ,
    report_updated_at TIMESTAMPTZ,
    plan_updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    report_updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_initiative_submissions_updated_at ON public.initiative_submissions;
CREATE TRIGGER trg_initiative_submissions_updated_at
BEFORE UPDATE ON public.initiative_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS initiative_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id UUID NOT NULL REFERENCES public.initiative_submissions(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    visibility visibility_type NOT NULL DEFAULT 'public',
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_at TIMESTAMPTZ,
    hidden_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hidden_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_alert_reads (
    moderator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (moderator_user_id, entity_type, entity_id),
    CHECK (
        entity_type IN (
            'new_report',
            'new_initiative',
            'initiative_comment',
            'unscheduled_cleanup'
        )
    )
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 160),
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS report_campaigns (
    report_id UUID PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    assigned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 160),
    geojson JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_service_areas_updated_at ON public.service_areas;
CREATE TRIGGER trg_service_areas_updated_at
BEFORE UPDATE ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_location_gist ON reports USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_report_media_report_id ON report_media(report_id);
CREATE INDEX IF NOT EXISTS idx_report_media_report_id_context ON report_media(report_id, media_context, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_report_media_visible ON report_media(report_id, is_hidden, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_status_history_report_id ON report_status_history(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_comments_report_id ON report_comments(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_comments_visible ON report_comments(report_id, visibility, is_hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_cleanup_participants_report_id ON report_cleanup_participants(report_id, joined_at ASC);
CREATE INDEX IF NOT EXISTS idx_report_cleanup_participants_user_id ON report_cleanup_participants(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleanup_events_scheduled_at ON cleanup_events(scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id_created_at ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id_is_read ON user_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_chat ON chat_messages(channel, external_chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_log_created_at ON moderation_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_log_report_id ON moderation_audit_log(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_initiative_submissions_status_created_at ON initiative_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_initiative_submissions_published_at ON initiative_submissions(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_initiative_comments_initiative_id ON initiative_comments(initiative_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_initiative_comments_visible ON initiative_comments(initiative_id, visibility, is_hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_alert_reads_user_type ON moderation_alert_reads(moderator_user_id, entity_type, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates ON campaigns(status, starts_at ASC, ends_at ASC);
CREATE INDEX IF NOT EXISTS idx_report_campaigns_campaign_id ON report_campaigns(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_areas_is_active ON service_areas(is_active, name);

-- Example bbox filter for GET /reports:
-- SELECT *
-- FROM reports
-- WHERE ST_Intersects(
--   location::geometry,
--   ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
-- );
