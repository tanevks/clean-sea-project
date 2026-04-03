"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function ForgotPasswordPage() {
  const { t } = useWebI18n();
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(t.auth.resetEmailSent);
  }

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <h1>{t.auth.forgotTitle}</h1>
      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
      {message ? <p style={{ color: "#166534" }}>{message}</p> : null}

      <form onSubmit={onSubmit}>
        <input
          type="email"
          placeholder={t.auth.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <button type="submit" style={{ width: "100%", padding: 12 }}>
          {t.auth.sendResetLink}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        <Link href="/auth/login">{t.auth.backToLogin}</Link>
      </p>
    </main>
  );
}
