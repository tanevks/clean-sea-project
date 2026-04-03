"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchPublicActivity,
  fetchPublicStats,
  type PublicActivityResponse,
  type PublicPeriod,
  type PublicStatsResponse
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";

export default function PrintableDashboardPage() {
  return (
    <Suspense fallback={<PrintableDashboardLoading />}>
      <PrintableDashboardPageInner />
    </Suspense>
  );
}

function PrintableDashboardPageInner() {
  const { t } = useWebI18n();
  const searchParams = useSearchParams();
  const period = (searchParams.get("period") as PublicPeriod | null) ?? "year";
  const campaignId = searchParams.get("campaignId") ?? undefined;
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [activity, setActivity] = useState<PublicActivityResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [nextStats, nextActivity] = await Promise.all([
          fetchPublicStats(period, campaignId),
          fetchPublicActivity(period, campaignId)
        ]);

        if (!cancelled) {
          setStats(nextStats);
          setActivity(nextActivity);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load printable report."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [campaignId, period]);

  const cleanupSignups = useMemo(
    () => activity?.monthly.reduce((sum, item) => sum + item.cleanups, 0) ?? 0,
    [activity]
  );
  const reportTitle = useMemo(() => {
    if (period === "all") {
      return t.dashboard.overallReportTitle;
    }

    if (period === "season") {
      return t.dashboard.seasonalReportTitle;
    }

    return t.dashboard.yearlyReportTitle;
  }, [period, t]);

  return (
    <main style={styles.page}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          .app-global-header,
          .app-header-controls { display: none !important; }
          body { background: #ffffff !important; }
          body { padding-top: 0 !important; }
        }
      `}</style>
      <div style={styles.actions} className="print-actions">
        <a href="/dashboard" style={styles.backButton}>
          {t.dashboard.backToDashboardShort}
        </a>
        <button type="button" onClick={() => window.print()} style={styles.printButton}>
          {t.dashboard.printableReport}
        </button>
      </div>

      <section style={styles.header}>
        <div style={styles.kicker}>Clean Sea</div>
        <h1 style={styles.title}>{reportTitle}</h1>
        <p style={styles.subtitle}>{t.dashboard.subtitle}</p>
        <div style={styles.metaRow}>
          <span>{stats?.generatedAt ? new Date(stats.generatedAt).toLocaleString() : ""}</span>
          <span>{stats?.campaign?.name ?? t.dashboard.allCampaigns}</span>
          <span>{period}</span>
        </div>
      </section>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      {isLoading ? (
        <div style={styles.loadingBox}>{t.common.loading}</div>
      ) : (
        <>
          {stats?.campaign ? (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>{t.dashboard.selectedCampaignSummary}</h2>
              <div style={styles.summaryGrid}>
                <SummaryCard label={t.dashboard.totalReports} value={stats.counts.total} />
                <SummaryCard label={t.dashboard.activeReports} value={stats.counts.active} />
                <SummaryCard label={t.dashboard.resolved} value={stats.counts.resolved} />
                <SummaryCard label={t.dashboard.cleanupSignups} value={cleanupSignups} />
              </div>
            </section>
          ) : null}

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>{t.dashboard.title}</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <colgroup>
                  <col style={{ width: "16.66%" }} />
                  <col style={{ width: "16.66%" }} />
                  <col style={{ width: "16.66%" }} />
                  <col style={{ width: "16.66%" }} />
                  <col style={{ width: "16.66%" }} />
                  <col style={{ width: "16.66%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={styles.tableHeadCenter}>{t.dashboard.totalReports}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.activeReports}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.inReview}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.plannedCleanup}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.resolved}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.rejected}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.tableCellCenter}>{stats?.counts.total ?? 0}</td>
                    <td style={styles.tableCellCenter}>{stats?.counts.active ?? 0}</td>
                    <td style={styles.tableCellCenter}>{stats?.counts.inReview ?? 0}</td>
                    <td style={styles.tableCellCenter}>{stats?.counts.plannedCleanup ?? 0}</td>
                    <td style={styles.tableCellCenter}>{stats?.counts.resolved ?? 0}</td>
                    <td style={styles.tableCellCenter}>{stats?.counts.rejected ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>{t.dashboard.monthlyActivity}</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={styles.tableHeadText}>{t.dashboard.monthlyActivity}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.monthlyReports}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.monthlyResolved}</th>
                    <th style={styles.tableHeadCenter}>{t.dashboard.monthlyCleanups}</th>
                  </tr>
                </thead>
                <tbody>
                  {activity?.monthly.map((item) => (
                    <tr key={item.key}>
                      <td style={styles.tableCellText}>{item.label}</td>
                      <td style={styles.tableCellCenter}>{item.reports}</td>
                      <td style={styles.tableCellCenter}>{item.resolved}</td>
                      <td style={styles.tableCellCenter}>{item.cleanups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={styles.dualSection}>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>{t.dashboard.topParticipants}</h2>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <colgroup>
                    <col style={{ width: "56%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={styles.tableHeadText}>{t.dashboard.participantName}</th>
                      <th style={styles.tableHeadCenter}>{t.dashboard.cleanupCount}</th>
                      <th style={styles.tableHeadCenter}>{t.dashboard.resolvedCount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity?.topParticipants.map((item) => (
                      <tr key={item.userId}>
                        <td style={styles.tableCellText}>
                          {item.displayName ?? t.dashboard.unknownUser}
                        </td>
                        <td style={styles.tableCellCenter}>{item.cleanupCount}</td>
                        <td style={styles.tableCellCenter}>{item.resolvedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>{t.dashboard.topReporters}</h2>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <colgroup>
                    <col style={{ width: "56%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={styles.tableHeadText}>{t.dashboard.reporterName}</th>
                      <th style={styles.tableHeadCenter}>{t.dashboard.reportCount}</th>
                      <th style={styles.tableHeadCenter}>{t.dashboard.resolvedCount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity?.topReporters.map((item) => (
                      <tr key={item.userId}>
                        <td style={styles.tableCellText}>
                          {item.displayName ?? t.dashboard.unknownUser}
                        </td>
                        <td style={styles.tableCellCenter}>{item.reportCount}</td>
                        <td style={styles.tableCellCenter}>{item.resolvedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function PrintableDashboardLoading() {
  return (
    <main style={styles.page}>
      <div style={styles.loadingBox}>Loading...</div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "18px 20px 28px",
    background: "#ffffff",
    color: "#0f172a"
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginBottom: 12
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
    color: "#0f172a",
    padding: "12px 16px",
    fontWeight: 800,
    textDecoration: "none"
  },
  printButton: {
    border: "none",
    borderRadius: 12,
    background: "#0f766e",
    color: "#ffffff",
    padding: "12px 16px",
    fontWeight: 800,
    cursor: "pointer"
  },
  header: {
    borderBottom: "2px solid #e2e8f0",
    paddingBottom: 12,
    marginBottom: 14
  },
  kicker: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 6
  },
  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.1
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.45
  },
  metaRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 1.35
  },
  section: {
    marginBottom: 14
  },
  dualSection: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 10,
    fontSize: 17,
    lineHeight: 1.2
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10
  },
  summaryCard: {
    padding: 11,
    borderRadius: 12,
    border: "1px solid #dbe5ec",
    background: "#f8fafc"
  },
  summaryLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    lineHeight: 1.25
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 800
  },
  tableWrap: {
    width: "100%",
    overflow: "hidden"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed"
  },
  tableHeadText: {
    textAlign: "left",
    fontSize: 10,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: "1px solid #cbd5e1",
    padding: "0 10px 7px 0",
    verticalAlign: "bottom"
  },
  tableHeadCenter: {
    textAlign: "center",
    fontSize: 10,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: "1px solid #cbd5e1",
    padding: "0 6px 7px",
    verticalAlign: "bottom"
  },
  tableCellCenter: {
    padding: "7px 6px",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "center",
    fontWeight: 700,
    verticalAlign: "top",
    whiteSpace: "nowrap",
    fontSize: 12,
    lineHeight: 1.25
  },
  tableCellText: {
    padding: "7px 10px 7px 0",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left",
    verticalAlign: "top",
    wordBreak: "break-word",
    fontSize: 12,
    lineHeight: 1.3
  },
  loadingBox: {
    padding: 14,
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #dbe5ec",
    color: "#64748b",
    fontSize: 12
  },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontSize: 12,
    lineHeight: 1.35
  }
};
