# Telegram chat slice

This slice adds a Telegram bot webhook directly in the API app.

## Flow

1. User sends `/newreport`
2. Bot asks for location
   - reply keyboard includes `Изпрати локация` and `Отказ`
3. User sends:
   - Telegram location pin, or
   - coordinates, or
   - Google Maps link with coordinates
4. Bot asks for media or description
   - reply keyboard includes `Пропусни медия` and `Отказ`
5. User can send:
   - photo
   - video
   - description directly
   - `/skip` to continue without media
6. API creates `reports` row with `source=chat`
7. Uploaded Telegram media is copied into Supabase Storage and stored in `report_media`
8. When moderators change report status, Telegram users receive an automatic status update message

## Required env

In `apps/api/.env`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
GEOCODING_USER_AGENT=clean-sea-project/0.1
```

## Required DB migration

Run:

- `docs/db/migrations/2026-03-23-add-chat-channel.sql`

## Webhook endpoint

```text
POST /v1/chat/webhook/telegram
```

## Status notifications

- automatic on `PATCH /v1/reports/:id/status` for `source=chat`
- optional manual trigger:

```text
POST /v1/chat/reports/:id/notify
```

Recommended secret header:

```text
x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>
```

## Notes

- `user_channel_identities.user_id` must be nullable for anonymous chat users
- inbound message idempotency is enforced through `chat_messages`
- address-only text and place links are resolved through Nominatim geocoding
