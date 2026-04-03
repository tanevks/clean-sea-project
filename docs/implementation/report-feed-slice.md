# Report Feed Slice (v2)

This slice adds:

- API: `GET /v1/reports`
- Mobile: reports feed screen with refresh and external map link
- DB: explicit `latitude` and `longitude` columns in `reports`

## Required DB Step

Run the migration before testing:

`docs/db/migrations/2026-03-20-add-report-lat-lng.sql`

## Mobile Behavior

- `Reports` tab loads the latest 50 reports.
- Pull-to-refresh reloads data from API.
- Each report can be opened in external OpenStreetMap.
- After creating a report, app switches back to `Reports` and refreshes.
