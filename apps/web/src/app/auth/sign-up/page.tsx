"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function SignUpPage() {
  const { t } = useWebI18n();
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  async function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!nickname.trim() || !email.trim() || !password) {
      setErrorMessage("Nickname, email, and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t.auth.passwordsDoNotMatch);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: nickname.trim(),
          nickname: nickname.trim(),
          phone: phone.trim() || undefined
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(t.auth.accountCreated);
  }

  async function onGoogleSignUp() {
    setMessage("");
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
      <h1>{t.auth.signUpTitle}</h1>
      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
      {message ? <p style={{ color: "#166534" }}>{message}</p> : null}

      <form onSubmit={onSignUp}>
        <input
          type="text"
          placeholder={t.auth.fullName}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <input
          type="tel"
          placeholder={t.auth.phone}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
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
        <input
          type="password"
          placeholder={t.auth.confirmPassword}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <button type="submit" style={{ width: "100%", padding: 12 }}>
          {t.auth.signUp}
        </button>
      </form>

      <button
        onClick={onGoogleSignUp}
        style={{ width: "100%", marginTop: 12, padding: 12 }}
      >
        {t.auth.google}
      </button>

      <p style={{ marginTop: 12 }}>
        <Link href="/auth/login">{t.auth.backToLogin}</Link>
      </p>
    </main>
  );
}
