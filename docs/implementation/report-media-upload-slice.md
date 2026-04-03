# Report Media Upload Slice

This slice completes the mobile report flow with:

- media selection from camera or gallery
- signed upload to Supabase Storage
- `report_media` insert during `POST /v1/reports`
- media returned in `GET /v1/reports`

## Storage flow

1. Mobile calls `POST /v1/uploads/presign`
2. API ensures the `report-media` bucket exists
3. API returns `bucket`, `storageKey`, `uploadUrl`, `uploadToken`
4. Mobile uploads the selected file with `uploadToSignedUrl`
5. Mobile calls `POST /v1/reports` with the uploaded media metadata
6. API inserts rows into `public.report_media`

## Required DB migration

Run:

- `docs/db/migrations/2026-03-21-add-report-media.sql`

Without this table, reports can still be created without media, but attaching files will fail.

## Runtime config

API:

- `REPORT_MEDIA_BUCKET=report-media`

The bucket is created automatically by the API on first upload if the service role key is valid.
