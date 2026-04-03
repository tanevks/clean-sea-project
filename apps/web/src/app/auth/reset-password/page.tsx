"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function ResetPasswordPage() {
  const { t } = useWebI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (password !== confirmPassword) {
      setErrorMessage(t.auth.passwordsDoNotMatch);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(t.auth.passwordUpdated);
  }

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <h1>{t.auth.resetTitle}</h1>
      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
      {message ? <p style={{ color: "#166534" }}>{message}</p> : null}

      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder={t.auth.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <input
          type="password"
          placeholder={t.auth.confirmPassword}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <button type="submit" style={{ width: "100%", padding: 12 }}>
          {t.auth.updatePassword}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        <Link href="/auth/login">{t.auth.backToLogin}</Link>
      </p>
    </main>
  );
}
