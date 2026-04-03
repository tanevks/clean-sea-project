"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useWebI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    router.push("/");
  }

  async function onGoogleLogin() {
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) {
      setErrorMessage(error.message);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>
      <h1>{t.auth.loginTitle}</h1>
      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}

      <form onSubmit={onLogin}>
        <input
          type="email"
          placeholder={t.auth.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <input
          type="password"
          placeholder={t.auth.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <button type="submit" style={{ width: "100%", padding: 12 }}>
          {t.auth.login}
        </button>
      </form>

      <button
        onClick={onGoogleLogin}
        style={{ width: "100%", marginTop: 12, padding: 12 }}
      >
        {t.auth.google}
      </button>

      <p style={{ marginTop: 12 }}>
        <Link href="/auth/forgot-password">{t.auth.forgotPassword}</Link>
      </p>
      <p>
        <Link href="/auth/sign-up">{t.auth.createAccount}</Link>
      </p>
    </main>
  );
}
