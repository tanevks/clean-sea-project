# Report Create Slice (v1)

This slice implements:

- API: `POST /v1/reports` (authenticated)
- Mobile: `New Report` screen with current GPS + description + publish

## API Contract Used

Endpoint: `POST /v1/reports`

Request body:

```json
{
  "description": "Trash near the river bank",
  "location": {
    "latitude": 42.6951,
    "longitude": 23.325,
    "accuracyMeters": 8.5
  },
  "source": "mobile"
}
```

Auth:

- `Authorization: Bearer <supabase_access_token>`

## Mobile Runtime Requirements

- `EXPO_PUBLIC_API_BASE_URL` set in mobile env.
- Location permission granted by user.

## Current Scope Limits

- This document covers the first publish slice only.
- Media upload is now implemented separately in `docs/implementation/report-media-upload-slice.md`.
- Map pin rendering from `GET /v1/reports` is still the next map-focused step.
