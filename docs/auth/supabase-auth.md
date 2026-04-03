# Supabase Auth (Users)

This project uses Supabase Auth for:
- Sign up with email + password
- Login with email + password
- Login with Google OAuth
- Forgot password (email reset link)

## 1) Supabase Dashboard Setup

1. Authentication -> Providers -> Email: enable.
2. Authentication -> Providers -> Google: enable and set Google Client ID/Secret.
3. Authentication -> URL Configuration:
   - Site URL:
     - Web: `https://app.cleansea.example.com`
   - Redirect URLs:
     - Web callback: `https://app.cleansea.example.com/auth/callback`
     - Mobile deep link callback: `cleansea://auth/callback`
     - Mobile reset password callback: `cleansea://auth/reset-password`
4. Authentication -> Email Templates:
   - Configure "Confirm signup" and "Reset password".
5. Authentication -> Policies:
   - Keep "Enable email confirmations" based on product choice (recommended: enabled).

## 2) Required Environment Variables

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

For web/mobile clients use only `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
Never ship `SUPABASE_SERVICE_ROLE_KEY` to client apps.

## 3) Client SDK Flows (`@supabase/supabase-js`)

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

### 3.1 Sign up (email + password)

```ts
const { data, error } = await supabase.auth.signUp({
  email: "user@example.com",
  password: "StrongPassword123!",
  options: {
    data: {
      full_name: "Ivan Petrov"
    },
    emailRedirectTo: "cleansea://auth/callback"
  }
});
```

### 3.2 Login (email + password)

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "StrongPassword123!"
});
```

### 3.3 Login with Google

Web:

```ts
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: "https://app.cleansea.example.com/auth/callback"
  }
});
```

Mobile:

```ts
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: "cleansea://auth/callback",
    skipBrowserRedirect: true
  }
});
```

### 3.4 Forgot password

```ts
const { data, error } = await supabase.auth.resetPasswordForEmail(
  "user@example.com",
  {
    redirectTo: "cleansea://auth/reset-password"
  }
);
```

### 3.5 Set new password after reset link

```ts
const { data, error } = await supabase.auth.updateUser({
  password: "NewStrongPassword123!"
});
```

### 3.6 Logout

```ts
const { error } = await supabase.auth.signOut();
```

## 4) Server/API Integration

- Incoming Bearer token is Supabase access token (JWT).
- Backend validates JWT and uses `auth.uid()` for ownership/RLS.
- User profile data is stored in `public.profiles` (see `docs/db/schema.sql`).
- Signup inserts into `auth.users`; DB trigger auto-creates `public.profiles` row.

## 5) Minimal Auth Screens

- `Sign Up`: email, password, confirm password, continue with Google.
- `Login`: email, password, continue with Google, forgot password link.
- `Forgot Password`: email input + confirmation message.
- `Reset Password`: new password + confirm.
