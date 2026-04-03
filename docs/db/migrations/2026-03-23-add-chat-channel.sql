DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_channel_type') THEN
    CREATE TYPE chat_channel_type AS ENUM ('telegram', 'viber', 'whatsapp', 'webchat');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel chat_channel_type NOT NULL,
  external_user_id TEXT NOT NULL,
  external_username TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, external_user_id)
);

ALTER TABLE public.user_channel_identities
ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel chat_channel_type NOT NULL,
  external_chat_id TEXT NOT NULL,
  external_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  user_identity_id UUID REFERENCES public.user_channel_identities(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_chat
ON public.chat_messages(channel, external_chat_id, created_at DESC);
