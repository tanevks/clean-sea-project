"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useWebI18n();

  useEffect(() => {
    const run = async () => {
      await supabase.auth.getSession();
      router.replace("/");
    };
    void run();
  }, [router]);

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <h1>{t.auth.callbackTitle}</h1>
      <p>{t.auth.callbackText}</p>
    </main>
  );
}
