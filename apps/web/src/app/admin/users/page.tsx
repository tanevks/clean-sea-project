"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchAdminAudit,
  fetchAdminUsers,
  fetchMe,
  updateAdminUserActiveState,
  updateAdminUserRole,
  type AdminUserItem,
  type AuditLogItem
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

type AccessState = "unknown" | "anonymous" | "forbidden" | "allowed";
type UserRole = AdminUserItem["role"];

const copy = {
  bg: {
    title: "Управление на потребители",
    subtitle:
      "Само admin може да управлява роли и активност. Тук се вижда и одит логът.",
    users: "Потребители",
    role: "Роля",
    nickname: "Прякор",
    phone: "Телефон",
    email: "Имейл",
    created: "Създаден",
    lastSignIn: "Последен вход",
    active: "Активен",
    inactive: "Неактивен",
    deactivate: "Деактивирай",
    activate: "Активирай",
    self: "Текущ профил",
    noUsers: "Няма намерени потребители.",
    save: "Запази",
    saving: "Запазване...",
    admin: "Админ",
    moderator: "Модератор",
    citizen: "Потребител",
    adminRequired: "Само admin може да отваря тази секция.",
    loginCta: "Към вход",
    unknown: "Няма данни",
    auditTitle: "Одит лог",
    noAudit: "Все още няма действия за показване.",
    actorFallback: "Системно действие"
  },
  en: {
    title: "User Management",
    subtitle:
      "Only the admin can manage roles and account activity. The audit log is shown here as well.",
    users: "Users",
    role: "Role",
    nickname: "Nickname",
    phone: "Phone",
    email: "Email",
    created: "Created",
    lastSignIn: "Last sign-in",
    active: "Active",
    inactive: "Inactive",
    deactivate: "Deactivate",
    activate: "Activate",
    self: "Current profile",
    noUsers: "No users found.",
    save: "Save",
    saving: "Saving...",
    admin: "Admin",
    moderator: "Moderator",
    citizen: "Citizen",
    adminRequired: "Only the admin can access this section.",
    loginCta: "Go to login",
    unknown: "No data",
    auditTitle: "Audit log",
    noAudit: "No actions to show yet.",
    actorFallback: "System action"
  }
} as const;

export default function AdminUsersPage() {
  const { language, t } = useWebI18n();
  const text = copy[language];
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [currentUserId, setCurrentUserId] = useState("");
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [auditItems, setAuditItems] = useState<AuditLogItem[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState("");
  const [togglingUserId, setTogglingUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const roleLabels: Record<UserRole, string> = useMemo(
    () => ({
      citizen: text.citizen,
      moderator: text.moderator,
      admin: text.admin
    }),
    [text]
  );

  async function loadData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    try {
      const [nextUsers, nextAudit] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminAudit()
      ]);

      setUsers(nextUsers);
      setAuditItems(nextAudit);
      setDraftRoles(
        Object.fromEntries(nextUsers.map((item) => [item.id, item.role])) as Record<
          string,
          UserRole
        >
      );
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load admin data."
        );
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setAccessState("anonymous");
        setIsLoading(false);
        return;
      }

      try {
        const me = await fetchMe();
        setCurrentUserId(me.id);

        if (me.role !== "admin") {
          setAccessState("forbidden");
          setIsLoading(false);
          return;
        }

        setAccessState("allowed");
        await loadData();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to bootstrap admin panel."
        );
        setIsLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (accessState !== "allowed") {
      return;
    }

    const refreshSilently = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadData({ silent: true });
    };

    const interval = window.setInterval(refreshSilently, 15000);
    const onFocus = () => refreshSilently();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [accessState]);

  async function onSaveRole(userId: string) {
    const nextRole = draftRoles[userId];
    const current = users.find((item) => item.id === userId);

    if (!nextRole || !current || nextRole === current.role) {
      return;
    }

    setSavingUserId(userId);
    setErrorMessage("");

    try {
      const updated = await updateAdminUserRole(userId, nextRole);
      setUsers((currentUsers) =>
        currentUsers.map((item) =>
          item.id === userId ? { ...item, role: updated.role } : item
        )
      );
      await loadData({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update user role."
      );
    } finally {
      setSavingUserId("");
    }
  }

  async function onToggleActive(userId: string, isActive: boolean) {
    setTogglingUserId(userId);
    setErrorMessage("");

    try {
      const updated = await updateAdminUserActiveState(userId, isActive);
      setUsers((currentUsers) =>
        currentUsers.map((item) =>
          item.id === userId ? { ...item, isActive: updated.isActive } : item
        )
      );
      await loadData({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update active state."
      );
    } finally {
      setTogglingUserId("");
    }
  }

  function formatAction(item: AuditLogItem) {
    if (language === "bg") {
      switch (item.action) {
        case "user_role_changed":
          return "Смяна на роля";
        case "user_activated":
          return "Активиране на профил";
        case "user_deactivated":
          return "Деактивиране на профил";
        case "report_status_changed":
          return "Смяна на статус на сигнал";
        case "comment_hidden":
          return "Скриване на коментар";
        case "comment_unhidden":
          return "Показване на коментар";
        case "media_hidden":
          return "Скриване на файл";
        case "media_unhidden":
          return "Показване на файл";
        default:
          return item.action;
      }
    }

    switch (item.action) {
      case "user_role_changed":
        return "Role changed";
      case "user_activated":
        return "User activated";
      case "user_deactivated":
        return "User deactivated";
      case "report_status_changed":
        return "Report status changed";
      case "comment_hidden":
        return "Comment hidden";
      case "comment_unhidden":
        return "Comment restored";
      case "media_hidden":
        return "Media hidden";
      case "media_unhidden":
        return "Media restored";
      default:
        return item.action;
    }
  }

  if (accessState === "unknown" || (accessState === "allowed" && isLoading)) {
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

  if (accessState === "forbidden") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.muted}>{text.adminRequired}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{text.title}</h1>
          <p style={styles.muted}>{text.subtitle}</p>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.countPill}>{users.length}</span>
          <Link href="/admin/service-areas" style={styles.secondaryLink}>
            Райони
          </Link>
          <Link href="/moderation" style={styles.secondaryLink}>
            {t.home.moderation}
          </Link>
          <Link href="/" style={styles.secondaryLink}>
            {t.common.home}
          </Link>
        </div>
      </header>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <strong>{text.users}</strong>
        </div>

        {users.length === 0 ? (
          <p style={styles.muted}>{text.noUsers}</p>
        ) : (
          <div style={styles.list}>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const hasChanges = draftRoles[user.id] !== undefined && draftRoles[user.id] !== user.role;

              return (
                <div key={user.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.nameRow}>
                        <strong style={styles.nameText}>
                          {user.displayName || text.unknown}
                        </strong>
                        {isSelf ? <span style={styles.selfPill}>{text.self}</span> : null}
                      </div>
                      <div style={styles.metaText}>
                        {text.email}: {user.email || text.unknown}
                      </div>
                    </div>
                    <span style={user.isActive ? styles.activePill : styles.inactivePill}>
                      {user.isActive ? text.active : text.inactive}
                    </span>
                  </div>

                  <div style={styles.infoGrid}>
                    <div>
                      <div style={styles.infoLabel}>{text.nickname}</div>
                      <div style={styles.infoValue}>{user.displayName || text.unknown}</div>
                    </div>
                    <div>
                      <div style={styles.infoLabel}>{text.phone}</div>
                      <div style={styles.infoValue}>{user.phone || text.unknown}</div>
                    </div>
                    <div>
                      <div style={styles.infoLabel}>{text.created}</div>
                      <div style={styles.infoValue}>
                        {user.createdAt ? new Date(user.createdAt).toLocaleString() : text.unknown}
                      </div>
                    </div>
                    <div>
                      <div style={styles.infoLabel}>{text.lastSignIn}</div>
                      <div style={styles.infoValue}>
                        {user.lastSignInAt
                          ? new Date(user.lastSignInAt).toLocaleString()
                          : text.unknown}
                      </div>
                    </div>
                  </div>

                  <div style={styles.roleRow}>
                    <div style={styles.roleField}>
                      <div style={styles.infoLabel}>{text.role}</div>
                      <select
                        value={draftRoles[user.id] ?? user.role}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [user.id]: event.target.value as UserRole
                          }))
                        }
                        style={styles.select}
                        disabled={isSelf}
                      >
                        <option value="citizen">{roleLabels.citizen}</option>
                        <option value="moderator">{roleLabels.moderator}</option>
                        <option value="admin">{roleLabels.admin}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onSaveRole(user.id)}
                      disabled={isSelf || !hasChanges || savingUserId === user.id}
                      style={{
                        ...styles.primaryButton,
                        ...(isSelf || !hasChanges || savingUserId === user.id
                          ? styles.buttonDisabled
                          : null)
                      }}
                    >
                      {savingUserId === user.id ? text.saving : text.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onToggleActive(user.id, !user.isActive)}
                      disabled={isSelf || togglingUserId === user.id}
                      style={{
                        ...styles.secondaryButton,
                        ...(isSelf || togglingUserId === user.id
                          ? styles.buttonDisabled
                          : null)
                      }}
                    >
                      {togglingUserId === user.id
                        ? text.saving
                        : user.isActive
                          ? text.deactivate
                          : text.activate}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ ...styles.panel, marginTop: 16 }}>
        <div style={styles.panelHeader}>
          <strong>{text.auditTitle}</strong>
        </div>

        {auditItems.length === 0 ? (
          <p style={styles.muted}>{text.noAudit}</p>
        ) : (
          <div style={styles.auditList}>
            {auditItems.map((item) => (
              <div key={item.id} style={styles.auditCard}>
                <div style={styles.auditTitleRow}>
                  <strong style={styles.auditTitleText}>{formatAction(item)}</strong>
                  <span style={styles.auditMeta}>
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={styles.auditMeta}>
                  {item.actorDisplayName || item.actorUserId || text.actorFallback}
                </div>
                {item.targetDisplayName || item.targetUserId ? (
                  <div style={styles.auditMeta}>
                    {item.targetDisplayName || item.targetUserId}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
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
  error: {
    color: "#b91c1c",
    margin: "0 0 12px"
  },
  panel: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid #d7dbe0",
    borderRadius: 24,
    padding: 16,
    backdropFilter: "blur(10px)"
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    color: "#0f172a"
  },
  list: {
    display: "grid",
    gap: 12
  },
  auditList: {
    display: "grid",
    gap: 10
  },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #d7dbe0",
    borderRadius: 20,
    padding: 14
  },
  auditCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #d7dbe0",
    borderRadius: 16,
    padding: 12
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14
  },
  auditTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6
  },
  auditTitleText: {
    color: "#0f172a"
  },
  auditMeta: {
    color: "#64748b",
    fontSize: 13
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6
  },
  nameText: {
    color: "#0f172a",
    fontSize: 18
  },
  selfPill: {
    borderRadius: 999,
    padding: "4px 10px",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 700
  },
  activePill: {
    borderRadius: 999,
    padding: "4px 10px",
    backgroundColor: "#dcfce7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 700
  },
  inactivePill: {
    borderRadius: 999,
    padding: "4px 10px",
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700
  },
  metaText: {
    color: "#64748b",
    fontSize: 13
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 14
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 6
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.4
  },
  roleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12
  },
  roleField: {
    flex: 1
  },
  select: {
    width: "100%",
    maxWidth: 260,
    padding: "9px 11px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff"
  },
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: 0,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    minWidth: 120
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
    minWidth: 120
  },
  buttonDisabled: {
    cursor: "not-allowed",
    opacity: 0.55
  },
  countPill: {
    minWidth: 28,
    padding: "4px 10px",
    borderRadius: 999,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center"
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
  }
};
