# Users/Auth Scaffold

This scaffold adds the two requested implementation steps:

- Mobile + web auth screens connected to Supabase
- API auth middleware + `/v1/auth/me` endpoints

## Folder Structure

```text
apps/
  mobile/
    src/App.tsx
    src/lib/supabase.ts
    src/lib/auth.ts
    src/screens/auth/*
  web/
    src/app/auth/login/page.tsx
    src/app/auth/sign-up/page.tsx
    src/app/auth/forgot-password/page.tsx
    src/app/auth/callback/page.tsx
    src/app/auth/reset-password/page.tsx
    src/lib/supabase.ts
  api/
    src/lib/env.ts
    src/lib/supabaseAdmin.ts
    src/middleware/authGuard.ts
    src/middleware/requireRole.ts
    src/routes/auth.ts
    src/server.ts
```

## Environment Files

- `apps/mobile/.env.example`
- `apps/web/.env.local.example`
- `apps/api/.env.example`

Use the same Supabase project for all three apps.

## Run (after installing dependencies)

```bash
npm install
npm run dev:api
npm run dev:web
npm run dev:mobile
```

## Notes

- Supabase Auth handles sign up, sign in, OAuth Google, and forgot/reset password.
- API validates bearer token via `supabaseAdmin.auth.getUser(accessToken)`.
- Role checks are ready via `requireRole(["moderator", "admin"])`.
