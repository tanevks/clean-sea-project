import type { ReactNode } from "react";
import { AppProviders } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          paddingTop: 96,
          background: "#f7fafc",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
        }}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
