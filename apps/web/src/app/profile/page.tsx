"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { fetchMe, updateMe } from "../../lib/api";
import { useWebI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

const copy = {
  bg: {
    title: "Моят профил",
    subtitle: "Редактирай прякор и координати за връзка.",
    nickname: "Прякор",
    phone: "Телефон за връзка",
    email: "Имейл",
    role: "Роля",
    save: "Запази",
    saving: "Запазване...",
    saved: "Профилът е обновен.",
    unknown: "Няма данни",
    citizen: "Потребител",
    moderator: "Модератор",
    admin: "Админ",
    nicknameRequired: "Прякорът е задължителен.",
    loginCta: "Към вход"
  },
  en: {
    title: "My Profile",
    subtitle: "Edit nickname and contact details.",
    nickname: "Nickname",
    phone: "Contact phone",
    email: "Email",
    role: "Role",
    save: "Save",
    saving: "Saving...",
    saved: "Profile updated.",
    unknown: "No data",
    citizen: "Citizen",
    moderator: "Moderator",
    admin: "Admin",
    nicknameRequired: "Nickname is required.",
    loginCta: "Go to login"
  }
} as const;

export default function ProfilePage() {
  const { language, t } = useWebI18n();
  const text = copy[language];
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [accessState, setAccessState] = useState<"unknown" | "anonymous" | "allowed">(
    "unknown"
  );
  const [role, setRole] = useState<"citizen" | "moderator" | "admin">("citizen");
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setAccessState("anonymous");
        setIsBooting(false);
        return;
      }

      try {
        const me = await fetchMe();
        setRole(me.role);
        setEmail(me.email ?? null);
        setNickname(me.nickname ?? me.displayName ?? "");
        setPhone(me.contactPhone ?? me.phone ?? "");
        setAccessState("allowed");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load profile."
        );
      } finally {
        setIsBooting(false);
      }
    }

    void bootstrap();
  }, []);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!nickname.trim()) {
      setErrorMessage(text.nicknameRequired);
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateMe({
        nickname: nickname.trim(),
        contactPhone: phone.trim() || ""
      });
      setNickname(updated.nickname ?? updated.displayName ?? "");
      setPhone(updated.contactPhone ?? updated.phone ?? "");
      setSuccessMessage(text.saved);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isBooting) {
    return <main style={styles.centered}>{t.common.loading}</main>;
  }

  if (accessState === "anonymous") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.muted}>{t.common.loginRequired}</p>
        <Link href="/auth/login" style={styles.linkButton}>
          {text.loginCta}
        </Link>
      </main>
    );
  }

  const roleLabel = text[role];

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{text.title}</h1>
          <p style={styles.muted}>{text.subtitle}</p>
        </div>
        <div style={styles.headerActions}>
          <Link href="/" style={styles.secondaryLink}>
            {t.common.home}
          </Link>
        </div>
      </header>

      <section style={styles.panel}>
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        {successMessage ? <p style={styles.success}>{successMessage}</p> : null}

        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>{text.email}</div>
            <div style={styles.infoValue}>{email || text.unknown}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>{text.role}</div>
            <div style={styles.infoValue}>{roleLabel}</div>
          </div>
        </div>

        <form onSubmit={onSave} style={styles.form}>
          <label style={styles.field}>
            <span style={styles.label}>{text.nickname}</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              style={styles.input}
              placeholder={text.nickname}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>{text.phone}</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              style={styles.input}
              placeholder={text.phone}
            />
          </label>

          <button type="submit" style={styles.primaryButton} disabled={isSaving}>
            {isSaving ? text.saving : text.save}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "calc(100vh - 64px)",
    background: "linear-gradient(180deg, #e8f2f5 0%, #f7fafc 100%)",
    padding: "20px 20px 16px",
    boxSizing: "border-box"
  },
  centered: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    background: "#f7fafc"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 14
  },
  headerActions: {
    display: "flex",
    gap: 12,
    alignItems: "center"
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 34,
    lineHeight: 1.1
  },
  muted: {
    color: "#475569",
    margin: "8px 0 0"
  },
  panel: {
    maxWidth: 760,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid #d7dbe0",
    borderRadius: 24,
    padding: 16,
    backdropFilter: "blur(10px)"
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 14
  },
  infoCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #d7dbe0",
    borderRadius: 18,
    padding: 14
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 8
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.4
  },
  form: {
    display: "grid",
    gap: 12
  },
  field: {
    display: "grid",
    gap: 6
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155"
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
    font: "inherit"
  },
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 12,
    border: 0,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    width: 180
  },
  linkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 16px",
    borderRadius: 12,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 700
  },
  secondaryLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    textDecoration: "none",
    border: "1px solid #d7dbe0"
  },
  error: {
    color: "#b91c1c",
    margin: "0 0 12px"
  },
  success: {
    color: "#166534",
    margin: "0 0 12px"
  }
};
