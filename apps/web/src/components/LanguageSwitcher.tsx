"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchMe, fetchModerationAlerts, listPublishedInitiatives } from "../lib/api";
import {
  countUnreadInitiativeThreads,
  loadInitiativeChatReadState,
  subscribeInitiativeChatReadState
} from "../lib/initiativeChatReadState";
import { useWebI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";

type UserRole = "citizen" | "moderator" | "admin" | null;
type NavVisibility = "public" | "session" | "moderator" | "admin";

type NavItem = {
  key: string;
  href: string;
  label: string;
  requires: NavVisibility;
  badge?: number;
};

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useWebI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState(false);
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<UserRole>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [initiativeUnreadCount, setInitiativeUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setHasSession(Boolean(data.session));
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      if (!session) {
        setNickname("");
        setRole(null);
        setAlertCount(0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    let cancelled = false;

    void fetchMe()
      .then((profile) => {
        if (!cancelled) {
          setNickname(profile.nickname ?? profile.displayName ?? profile.email ?? "");
          setRole(profile.role);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNickname("");
          setRole(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitiativeUnreadCount() {
      try {
        const items = await listPublishedInitiatives();
        const readState = loadInitiativeChatReadState();
        if (!cancelled) {
          setInitiativeUnreadCount(countUnreadInitiativeThreads(items, readState));
        }
      } catch {
        if (!cancelled) {
          setInitiativeUnreadCount(0);
        }
      }
    }

    void loadInitiativeUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadInitiativeUnreadCount();
    }, 15000);
    const unsubscribe = subscribeInitiativeChatReadState(() => {
      void loadInitiativeUnreadCount();
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (role !== "moderator" && role !== "admin") {
      setAlertCount(0);
      return;
    }

    let cancelled = false;

    async function loadAlerts() {
      try {
        const response = await fetchModerationAlerts();
        if (!cancelled) {
          setAlertCount(response.counts.total);
        }
      } catch {
        if (!cancelled) {
          setAlertCount(0);
        }
      }
    }

    void loadAlerts();
    const intervalId = window.setInterval(() => {
      void loadAlerts();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [role]);

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        key: "dashboard",
        href: "/dashboard",
        label: t.home.dashboard,
        requires: "public"
      },
      {
        key: "my-dashboard",
        href: "/my/dashboard",
        label: t.home.myDashboard,
        requires: "session"
      },
      {
        key: "profile",
        href: "/profile",
        label: t.home.profile,
        requires: "session"
      },
      {
        key: "moderation",
        href: "/moderation",
        label: t.home.moderation,
        requires: "moderator"
      },
      {
        key: "notifications",
        href: "/moderation/notifications",
        label: t.home.notifications,
        requires: "moderator",
        badge: alertCount
      },
      {
        key: "campaigns",
        href: "/moderation/campaigns",
        label: t.home.campaigns,
        requires: "moderator"
      },
      {
        key: "initiatives",
        href: "/initiatives",
        label: t.home.initiatives,
        requires: "public",
        badge: initiativeUnreadCount
      },
      {
        key: "initiative-moderation",
        href: "/moderation/initiatives",
        label: t.home.initiativeModeration,
        requires: "moderator"
      },
      {
        key: "admin",
        href: "/admin/users",
        label: t.home.admin,
        requires: "admin"
      },
      {
        key: "service-areas",
        href: "/admin/service-areas",
        label: t.home.serviceAreas,
        requires: "admin"
      },
      {
        key: "maintenance",
        href: "/admin/maintenance",
        label: t.home.maintenance,
        requires: "admin"
      }
    ],
    [alertCount, initiativeUnreadCount, t]
  );

  function canAccess(item: NavItem) {
    if (item.requires === "public") {
      return true;
    }

    if (!hasSession) {
      return false;
    }

    if (item.requires === "session") {
      return true;
    }

    if (item.requires === "moderator") {
      return role === "moderator" || role === "admin";
    }

    return role === "admin";
  }

  function onNavigate(item: NavItem) {
    if (!canAccess(item)) {
      return;
    }

    router.push(item.href);
  }

  async function onLogout() {
    await supabase.auth.signOut();
    router.push("/dashboard");
    router.refresh();
  }

  const roleLabel =
    role === "admin" ? "ADMIN" : role === "moderator" ? "MOD" : role === "citizen" ? "USER" : "";

  return (
    <header className="app-global-header" style={styles.header}>
      <div style={styles.navWrap}>
        {navItems.map((item) => {
          const enabled = canAccess(item);
          const isActive =
            item.href === "/moderation"
              ? pathname === "/moderation"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item)}
              disabled={!enabled}
              style={{
                ...styles.navButton,
                ...(isActive ? styles.navButtonActive : null),
                ...(!enabled ? styles.navButtonDisabled : null)
              }}
            >
              <span>{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span style={styles.navBadge}>{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="app-header-controls" style={styles.controls}>
        <div style={styles.brandWrap}>
          <div style={styles.brandKicker}>Clean Sea</div>
          <div style={styles.brandTitle}>Clean Sea Web</div>
        </div>

        {nickname ? (
          <div style={styles.userWrap}>
            <div style={styles.nicknamePill}>{nickname}</div>
            {roleLabel ? <div style={styles.rolePill}>{roleLabel}</div> : null}
          </div>
        ) : null}

        <div style={styles.languageGroup}>
          <button
            type="button"
            onClick={() => setLanguage("bg")}
            style={{
              ...styles.button,
              ...(language === "bg" ? styles.buttonActive : null)
            }}
          >
            {t.common.bg}
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            style={{
              ...styles.button,
              ...(language === "en" ? styles.buttonActive : null)
            }}
          >
            {t.common.en}
          </button>
        </div>

        {hasSession ? (
          <button type="button" onClick={() => void onLogout()} style={styles.primaryButton}>
            {t.common.logout}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/auth/login")}
            style={styles.primaryButton}
          >
            {t.home.login}
          </button>
        )}
      </div>
    </header>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "14px 18px",
    background:
      "linear-gradient(135deg, rgba(7, 89, 133, 0.94) 0%, rgba(15, 118, 110, 0.92) 100%)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)"
  },
  navWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    minWidth: 0,
    flex: 1
  },
  navButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#ecfeff",
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 160ms ease"
  },
  navButtonActive: {
    background: "#ffffff",
    color: "#0f172a",
    borderColor: "#ffffff"
  },
  navButtonDisabled: {
    opacity: 0.42,
    cursor: "not-allowed"
  },
  navBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    background: "#fee2e2",
    color: "#991b1b",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
    padding: "0 6px"
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  brandWrap: {
    display: "grid",
    gap: 2,
    padding: "4px 10px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.14)"
  },
  brandKicker: {
    color: "rgba(236, 254, 255, 0.78)",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 1.2
  },
  brandTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 800,
    whiteSpace: "nowrap"
  },
  userWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  nicknamePill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.12)",
    color: "#f8fafc",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.16)",
    fontSize: 12,
    fontWeight: 700,
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  rolePill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "8px 10px",
    background: "#cffafe",
    color: "#155e75",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.4
  },
  languageGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  button: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#e2e8f0",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
  },
  buttonActive: {
    background: "#ffffff",
    color: "#0f172a",
    borderColor: "#ffffff"
  },
  primaryButton: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffffff",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer"
  }
};
