"use client";

import { type ReactNode } from "react";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { WebLanguageProvider } from "../lib/i18n";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WebLanguageProvider>
      <LanguageSwitcher />
      {children}
    </WebLanguageProvider>
  );
}
