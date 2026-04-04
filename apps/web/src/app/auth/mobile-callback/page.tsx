"use client";

import { MobileRedirectPage } from "../mobile-bridge";

export default function MobileCallbackPage() {
  return (
    <MobileRedirectPage
      appPathname="auth/callback"
      title="Open Clean Sea Mobile"
      text="If the app did not open automatically, use the button below."
      buttonText="Open the app"
    />
  );
}
