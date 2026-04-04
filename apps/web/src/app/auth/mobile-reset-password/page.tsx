"use client";

import { MobileRedirectPage } from "../mobile-bridge";

export default function MobileResetPasswordPage() {
  return (
    <MobileRedirectPage
      appPathname="auth/reset-password"
      title="Open Clean Sea Mobile"
      text="If the app did not open automatically, use the button below to continue the password reset in the app."
      buttonText="Open the app"
    />
  );
}
