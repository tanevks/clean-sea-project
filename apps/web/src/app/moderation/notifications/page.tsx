"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  fetchMe,
  fetchModerationAlerts,
  markAllModerationAlertsRead,
  markModerationAlertRead,
  type ModerationAlertsResponse
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

export default function ModerationNotificationsPage() {
  const { t } = useWebI18n();
  const [accessState, setAccessState] = useState<
    "unknown" | "anonymous" | "forbidden" | "allowed"
  >("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<ModerationAlertsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionKey, setActionKey] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setAccessState("anonymous");
          setIsLoading(false);
        }
        return;
      }

      try {
        const me = await fetchMe();
        if (me.role !== "moderator" && me.role !== "admin") {
          if (!cancelled) {
            setAccessState("forbidden");
            setIsLoading(false);
          }
          return;
        }

        const nextAlerts = await fetchModerationAlerts();
        if (!cancelled) {
          setAlerts(nextAlerts);
          setAccessState("allowed");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load moderation alerts."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadAlerts() {
    setAlerts(await fetchModerationAlerts());
  }

  async function onMarkAllRead() {
    setActionKey("all");
    setErrorMessage("");

    try {
      await markAllModerationAlertsRead();
      await reloadAlerts();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to mark alerts as read."
      );
    } finally {
      setActionKey("");
    }
  }

  async function onOpenReport(entityType: "new_report" | "unscheduled_cleanup", reportId: string) {
    setActionKey(`${entityType}:${reportId}`);
    setErrorMessage("");

    try {
      await markModerationAlertRead(entityType, reportId);
      window.location.href = `/moderation?reportId=${reportId}`;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open report."
      );
      setActionKey("");
    }
  }

  async function onOpenInitiative(
    entityType: "new_initiative" | "initiative_comment",
    entityId: string,
    initiativeId: string,
    commentId?: string
  ) {
    setActionKey(`${entityType}:${entityId}`);
    setErrorMessage("");

    try {
      await markModerationAlertRead(entityType, entityId);
      const params = new URLSearchParams({ initiativeId });
      if (commentId) {
        params.set("commentId", commentId);
      }
      window.location.href = `/moderation/initiatives?${params.toString()}`;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open initiative."
      );
      setActionKey("");
    }
  }

  async function markSingleAlert(
    entityType: "new_report" | "new_initiative" | "initiative_comment" | "unscheduled_cleanup",
    entityId: string
  ) {
    setActionKey(`read:${entityType}:${entityId}`);
    setErrorMessage("");

    try {
      await markModerationAlertRead(entityType, entityId);
      await reloadAlerts();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to mark alert as read."
      );
    } finally {
      setActionKey("");
    }
  }

  if (accessState === "anonymous") {
    return <main style={styles.page}>{t.common.loginRequired}</main>;
  }

  if (accessState === "forbidden") {
    return <main style={styles.page}>{t.common.moderatorRequired}</main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{t.moderation.notificationCenterTitle}</h1>
          <p style={styles.subtitle}>{t.moderation.notificationCenterSubtitle}</p>
        </div>
        <button type="button" onClick={() => void onMarkAllRead()} style={styles.markAllButton}>
          {actionKey === "all" ? t.moderation.saving : t.moderation.markAllRead}
        </button>
        <div style={styles.navTabs}>
          <Link href="/moderation" style={styles.navTab}>
            {t.moderation.reports}
          </Link>
          <Link href="/moderation/notifications" style={{ ...styles.navTab, ...styles.navTabActive }}>
            {t.moderation.notifications}
          </Link>
          <Link href="/moderation/campaigns" style={styles.navTab}>
            {t.home.campaigns}
          </Link>
          <Link href="/moderation/initiatives" style={styles.navTab}>
            {t.home.initiatives}
          </Link>
        </div>
      </div>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      {isLoading ? (
        <div style={styles.loadingBox}>{t.common.loading}</div>
      ) : (
        <>
          <section style={styles.metricStrip}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>{t.moderation.alertSummary}</div>
              <div style={styles.metricValue}>{alerts?.counts.total ?? 0}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>{t.moderation.newReports}</div>
              <div style={styles.metricValue}>{alerts?.counts.newReports ?? 0}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>{t.moderation.newInitiatives}</div>
              <div style={styles.metricValue}>{alerts?.counts.newInitiatives ?? 0}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>{t.moderation.newInitiativeComments}</div>
              <div style={styles.metricValue}>{alerts?.counts.newInitiativeComments ?? 0}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>{t.moderation.unscheduledCleanups}</div>
              <div style={styles.metricValue}>{alerts?.counts.unscheduledCleanups ?? 0}</div>
            </div>
          </section>

          <section style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>{t.moderation.newReports}</h2>
                <Link href="/moderation?status=new" style={styles.linkButton}>
                  {t.moderation.openModeration}
                </Link>
              </div>
              {alerts?.newReports.length ? (
                <div style={styles.list}>
                  {alerts.newReports.map((item) => (
                    <article key={item.id} style={styles.itemCard}>
                      <div style={styles.itemMeta}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>{item.reporterDisplayName ?? t.moderation.unknownUser}</span>
                      </div>
                      <div style={styles.itemTitle}>{item.title ?? item.description}</div>
                      {item.title ? <div style={styles.itemBody}>{item.description}</div> : null}
                      <button
                        type="button"
                        onClick={() => void onOpenReport("new_report", item.id)}
                        style={styles.inlineButton}
                      >
                        {actionKey === `new_report:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.openReport}
                      </button>
                      <button
                        type="button"
                        onClick={() => void markSingleAlert("new_report", item.id)}
                        style={styles.inlineButtonSecondary}
                      >
                        {actionKey === `read:new_report:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.markRead}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyBox}>{t.moderation.noNewReports}</div>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>{t.moderation.newInitiatives}</h2>
                <Link href="/moderation/initiatives" style={styles.linkButton}>
                  {t.moderation.openInitiatives}
                </Link>
              </div>
              {alerts?.newInitiatives.length ? (
                <div style={styles.list}>
                  {alerts.newInitiatives.map((item) => (
                    <article key={item.id} style={styles.itemCard}>
                      <div style={styles.itemMeta}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>{item.submitterName}</span>
                      </div>
                      <div style={styles.itemTitle}>{item.title}</div>
                      <div style={styles.itemTag}>
                        {item.category === "idea" ? t.dashboard.idea : t.dashboard.initiative}
                      </div>
                      <button
                        type="button"
                        onClick={() => void onOpenInitiative("new_initiative", item.id, item.id)}
                        style={styles.inlineButton}
                      >
                        {actionKey === `new_initiative:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.openInitiatives}
                      </button>
                      <button
                        type="button"
                        onClick={() => void markSingleAlert("new_initiative", item.id)}
                        style={styles.inlineButtonSecondary}
                      >
                        {actionKey === `read:new_initiative:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.markRead}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyBox}>{t.moderation.noNewInitiatives}</div>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>{t.moderation.newInitiativeComments}</h2>
                <Link href="/moderation/initiatives" style={styles.linkButton}>
                  {t.moderation.openInitiatives}
                </Link>
              </div>
              {alerts?.newInitiativeComments.length ? (
                <div style={styles.list}>
                  {alerts.newInitiativeComments.map((item) => (
                    <article key={item.id} style={styles.itemCard}>
                      <div style={styles.itemMeta}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>{item.authorDisplayName ?? t.moderation.unknownUser}</span>
                      </div>
                      <div style={styles.itemTitle}>{item.initiativeTitle}</div>
                      <div style={styles.itemBody}>{item.message}</div>
                      <button
                        type="button"
                        onClick={() =>
                          void onOpenInitiative(
                            "initiative_comment",
                            item.id,
                            item.initiativeId,
                            item.id
                          )
                        }
                        style={styles.inlineButton}
                      >
                        {actionKey === `initiative_comment:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.openInitiatives}
                      </button>
                      <button
                        type="button"
                        onClick={() => void markSingleAlert("initiative_comment", item.id)}
                        style={styles.inlineButtonSecondary}
                      >
                        {actionKey === `read:initiative_comment:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.markRead}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyBox}>{t.moderation.noNewInitiativeComments}</div>
              )}
            </div>

            <div style={{ ...styles.card, ...styles.wideCard }}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>{t.moderation.unscheduledCleanups}</h2>
                <Link href="/moderation?status=planned_cleanup" style={styles.linkButton}>
                  {t.moderation.openModeration}
                </Link>
              </div>
              {alerts?.unscheduledCleanups.length ? (
                <div style={styles.list}>
                  {alerts.unscheduledCleanups.map((item) => (
                    <article key={item.id} style={styles.itemCard}>
                      <div style={styles.itemMeta}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span>{t.moderation.participantCount}: {item.participantCount}</span>
                      </div>
                      <div style={styles.itemTitle}>{item.title ?? item.description}</div>
                      {item.title ? <div style={styles.itemBody}>{item.description}</div> : null}
                      <div style={styles.itemMeta}>
                        {item.reporterDisplayName ?? t.moderation.unknownUser}
                      </div>
                      <button
                        type="button"
                        onClick={() => void onOpenReport("unscheduled_cleanup", item.id)}
                        style={styles.inlineButton}
                      >
                        {actionKey === `unscheduled_cleanup:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.openReport}
                      </button>
                      <button
                        type="button"
                        onClick={() => void markSingleAlert("unscheduled_cleanup", item.id)}
                        style={styles.inlineButtonSecondary}
                      >
                        {actionKey === `read:unscheduled_cleanup:${item.id}`
                          ? t.moderation.saving
                          : t.moderation.markRead}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyBox}>{t.moderation.noUnscheduledCleanups}</div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: 24
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18
  },
  navTabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  markAllButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer"
  },
  navTab: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    textDecoration: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    fontWeight: 700
  },
  navTabActive: {
    backgroundColor: "#0b6bcb",
    borderColor: "#0b6bcb",
    color: "#ffffff"
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 34,
    lineHeight: 1.1
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 0,
    color: "#475569"
  },
  errorBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  loadingBox: {
    padding: 16,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    color: "#64748b"
  },
  metricStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 18
  },
  metricCard: {
    padding: 18,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dbe5ec"
  },
  metricLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: 800
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16
  },
  card: {
    padding: 18,
    borderRadius: 20,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    minWidth: 0
  },
  wideCard: {
    gridColumn: "1 / -1"
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14
  },
  sectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 20
  },
  linkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #dbe5ec",
    background: "#f8fafc",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 700
  },
  list: {
    display: "grid",
    gap: 12
  },
  itemCard: {
    padding: 14,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0"
  },
  itemMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12,
    marginBottom: 8,
    flexWrap: "wrap"
  },
  itemTitle: {
    color: "#0f172a",
    fontWeight: 800,
    marginBottom: 8
  },
  itemBody: {
    color: "#334155",
    lineHeight: 1.5,
    marginBottom: 10
  },
  itemTag: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  inlineButton: {
    border: "none",
    background: "transparent",
    color: "#0b6bcb",
    fontWeight: 700,
    textDecoration: "none",
    padding: 0,
    cursor: "pointer"
  },
  inlineButtonSecondary: {
    border: "none",
    background: "transparent",
    color: "#64748b",
    fontWeight: 700,
    textDecoration: "none",
    padding: 0,
    cursor: "pointer",
    marginLeft: 12
  },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#64748b"
  }
};
