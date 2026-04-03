"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { fetchMe, fetchPrivateDashboard, type PrivateDashboardResponse, type ReportSummary } from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

type DashboardTab = "reports" | "cleanups" | "stats";

export default function PrivateDashboardPage() {
  const { t } = useWebI18n();
  const [accessState, setAccessState] = useState<"unknown" | "anonymous" | "allowed">(
    "unknown"
  );
  const [data, setData] = useState<PrivateDashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("reports");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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
        await fetchMe();
        const dashboard = await fetchPrivateDashboard();
        if (!cancelled) {
          setData(dashboard);
          setAccessState("allowed");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load private dashboard."
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

  const tabs = useMemo(
    () => [
      { key: "reports" as const, label: t.myDashboard.reports },
      { key: "cleanups" as const, label: t.myDashboard.cleanups },
      { key: "stats" as const, label: t.myDashboard.stats }
    ],
    [t]
  );

  if (accessState === "anonymous") {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>{t.myDashboard.title}</h1>
        <p style={styles.subtitle}>{t.common.loginRequired}</p>
        <Link href="/auth/login" style={styles.linkButton}>
          {t.auth.login}
        </Link>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{t.myDashboard.title}</h1>
          <p style={styles.subtitle}>{t.myDashboard.subtitle}</p>
        </div>
        <Link href="/" style={styles.secondaryLink}>
          {t.common.home}
        </Link>
      </header>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      <div style={styles.tabRow}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveTab(item.key)}
            style={{
              ...styles.tabButton,
              ...(activeTab === item.key ? styles.tabButtonActive : null)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={styles.loadingBox}>{t.common.loading}</div>
      ) : activeTab === "reports" ? (
        <section style={styles.card}>
          {data?.myReports.length ? (
            <div style={styles.list}>
              {data.myReports.map((item) => (
                <ReportCard key={item.id} report={item} />
              ))}
            </div>
          ) : (
            <div style={styles.emptyBox}>{t.myDashboard.emptyReports}</div>
          )}
        </section>
      ) : activeTab === "cleanups" ? (
        <section style={styles.card}>
          {data?.myCleanups.length ? (
            <div style={styles.list}>
              {data.myCleanups.map((item) => (
                <div key={`${item.report.id}-${item.joinedAt}`} style={styles.cleanupCard}>
                  <div style={styles.cleanupJoined}>
                    {t.myDashboard.joinedAt}: {new Date(item.joinedAt).toLocaleString()}
                  </div>
                  <ReportCard report={item.report} compact />
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.emptyBox}>{t.myDashboard.emptyCleanups}</div>
          )}
        </section>
      ) : (
        <section style={styles.statsGrid}>
          <MetricCard label={t.myDashboard.reportCount} value={data?.stats.reportCount ?? 0} />
          <MetricCard label={t.myDashboard.activeReportCount} value={data?.stats.activeReportCount ?? 0} />
          <MetricCard label={t.myDashboard.resolvedReportCount} value={data?.stats.resolvedReportCount ?? 0} />
          <MetricCard label={t.myDashboard.cleanupJoinCount} value={data?.stats.cleanupJoinCount ?? 0} />
          <MetricCard label={t.myDashboard.cleanupResolvedCount} value={data?.stats.cleanupResolvedCount ?? 0} />
          <MetricCard label={t.myDashboard.upcomingCleanupCount} value={data?.stats.upcomingCleanupCount ?? 0} />
        </section>
      )}
    </main>
  );
}

function ReportCard({ report, compact = false }: { report: ReportSummary; compact?: boolean }) {
  return (
    <article style={{ ...styles.reportCard, ...(compact ? styles.reportCardCompact : null) }}>
      <div style={styles.reportHeader}>
        <span style={styles.statusPill}>{report.status}</span>
        <span style={styles.reportDate}>{new Date(report.createdAt).toLocaleDateString()}</span>
      </div>
      <div style={styles.reportTitle}>{report.title ?? report.description}</div>
      <div style={styles.reportBody}>{report.description}</div>
      <div style={styles.reportMeta}>
        {report.cleanupSummary?.participantCount ?? 0} participants
        {report.cleanupEvent?.scheduledAt ? ` • ${new Date(report.cleanupEvent.scheduledAt).toLocaleString()}` : ""}
      </div>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1180,
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
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 36
  },
  subtitle: {
    color: "#475569",
    marginTop: 10,
    marginBottom: 0
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
  tabRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 18
  },
  tabButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    background: "#ffffff",
    color: "#334155",
    padding: "9px 14px",
    fontWeight: 700,
    cursor: "pointer"
  },
  tabButtonActive: {
    background: "#0f172a",
    color: "#ffffff",
    borderColor: "#0f172a"
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    borderRadius: 22,
    padding: 18
  },
  list: {
    display: "grid",
    gap: 12
  },
  reportCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 16,
    background: "#f8fafc"
  },
  reportCardCompact: {
    paddingTop: 12
  },
  reportHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  reportDate: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600
  },
  reportTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 8
  },
  reportBody: {
    color: "#334155",
    lineHeight: 1.6
  },
  reportMeta: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 10
  },
  cleanupCard: {
    border: "1px solid #dbe5ec",
    borderRadius: 18,
    padding: 14,
    background: "#ffffff"
  },
  cleanupJoined: {
    color: "#475569",
    fontSize: 13,
    marginBottom: 10
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14
  },
  metricCard: {
    padding: 18,
    borderRadius: 20,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  metricLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 34,
    fontWeight: 800
  },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#64748b"
  },
  loadingBox: {
    padding: 18,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#475569"
  },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  }
};
