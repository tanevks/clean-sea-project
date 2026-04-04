"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useWebI18n();

  useEffect(() => {
    const run = async () => {
      await supabase.auth.getSession();

      try {
        await fetchMe();
        router.replace("/");
      } catch (error) {
        const message =
          error instanceof Error && error.message.includes("Account approval is pending.")
            ? "Профилът ви очаква одобрение от администратор."
            : error instanceof Error && error.message.includes("Account access was rejected.")
              ? "Достъпът до профила ви не е одобрен."
              : error instanceof Error && error.message.includes("Account is inactive.")
                ? "Профилът е деактивиран."
                : "Входът не можа да бъде завършен.";

        await supabase.auth.signOut();
        router.replace(`/auth/login?notice=${encodeURIComponent(message)}`);
      }
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
