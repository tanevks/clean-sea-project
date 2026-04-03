"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchMe,
  fetchPublicCampaigns,
  fetchPublicActivity,
  getPublicExportUrl,
  getPublicMapUrl,
  getPublicPrintUrl,
  fetchPublicStats,
  type CampaignItem,
  type PublicActivityResponse,
  type PublicPeriod,
  type PublicStatsResponse
} from "../../lib/api";
import { useWebI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

const periods: PublicPeriod[] = ["all", "year", "season"];

export default function PublicDashboardPage() {
  const { t } = useWebI18n();
  const [period, setPeriod] = useState<PublicPeriod>("year");
  const [canExportReports, setCanExportReports] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [activity, setActivity] = useState<PublicActivityResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          if (!cancelled) {
            setCanExportReports(false);
          }
          return;
        }

        const me = await fetchMe();
        if (!cancelled) {
          setCanExportReports(me.role === "moderator" || me.role === "admin");
        }
      } catch {
        if (!cancelled) {
          setCanExportReports(false);
        }
      }
    }

    void loadAccess();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setCanExportReports(false);
        return;
      }

      try {
        const me = await fetchMe();
        setCanExportReports(me.role === "moderator" || me.role === "admin");
      } catch {
        setCanExportReports(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [nextStats, nextActivity, nextCampaigns] = await Promise.all([
          fetchPublicStats(period, selectedCampaignId || undefined),
          fetchPublicActivity(period, selectedCampaignId || undefined),
          fetchPublicCampaigns()
        ]);

        if (!cancelled) {
          setStats(nextStats);
          setActivity(nextActivity);
          setCampaigns(nextCampaigns);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load public dashboard."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [period, selectedCampaignId]);

  const periodLabels = useMemo(
    () => ({
      all: t.dashboard.all,
      year: t.dashboard.year,
      season: t.dashboard.season
    }),
    [t]
  );

  const exportUrl = useMemo(
    () => getPublicExportUrl(period, selectedCampaignId || undefined),
    [period, selectedCampaignId]
  );
  const printUrl = useMemo(
    () => getPublicPrintUrl(period, selectedCampaignId || undefined),
    [period, selectedCampaignId]
  );

  const monthlyMax = useMemo(() => {
    if (!activity?.monthly.length) {
      return 1;
    }

    return Math.max(
      1,
      ...activity.monthly.flatMap((item) => [item.reports, item.resolved, item.cleanups])
    );
  }, [activity]);
  const selectedCampaignCleanupCount = useMemo(
    () => activity?.monthly.reduce((sum, item) => sum + item.cleanups, 0) ?? 0,
    [activity]
  );

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>Clean Sea</div>
          <h1 style={styles.title}>{t.dashboard.title}</h1>
          <p style={styles.subtitle}>{t.dashboard.subtitle}</p>
        </div>

        <div style={styles.periodWrap}>
          <label style={styles.campaignField}>
            <span style={styles.campaignLabel}>{t.dashboard.campaignFilter}</span>
            <select
              value={selectedCampaignId}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
              style={styles.campaignSelect}
            >
              <option value="">{t.dashboard.allCampaigns}</option>
              {campaigns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {periods.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              style={{
                ...styles.periodButton,
                ...(period === item ? styles.periodButtonActive : null)
              }}
            >
              {periodLabels[item]}
            </button>
          ))}
          {canExportReports ? (
            <>
              <a href={exportUrl} style={styles.exportButton}>
                {t.dashboard.exportCsv}
              </a>
              <a href={printUrl} style={styles.printButton}>
                {t.dashboard.printableReport}
              </a>
              <div style={styles.exportHint}>{t.dashboard.exportHint}</div>
              <div style={styles.exportHint}>{t.dashboard.printReportHint}</div>
            </>
          ) : null}
        </div>
      </section>

      {stats?.campaign ? (
        <section style={styles.selectedCampaignCard}>
          <div style={styles.selectedCampaignLabel}>{t.dashboard.selectedCampaign}</div>
          <div style={styles.selectedCampaignName}>{stats.campaign.name}</div>
          <div style={styles.selectedCampaignMeta}>
            {new Date(stats.campaign.startsAt).toLocaleDateString()} -{" "}
            {new Date(stats.campaign.endsAt).toLocaleDateString()}
          </div>
          {stats.campaign.description ? (
            <p style={styles.selectedCampaignDescription}>{stats.campaign.description}</p>
          ) : null}
          <div style={styles.selectedCampaignSummaryGrid}>
            <div style={styles.selectedCampaignSummaryCard}>
              <div style={styles.selectedCampaignSummaryLabel}>{t.dashboard.totalReports}</div>
              <div style={styles.selectedCampaignSummaryValue}>{stats.counts.total}</div>
            </div>
            <div style={styles.selectedCampaignSummaryCard}>
              <div style={styles.selectedCampaignSummaryLabel}>{t.dashboard.resolved}</div>
              <div style={styles.selectedCampaignSummaryValue}>{stats.counts.resolved}</div>
            </div>
            <div style={styles.selectedCampaignSummaryCard}>
              <div style={styles.selectedCampaignSummaryLabel}>{t.dashboard.cleanupSignups}</div>
              <div style={styles.selectedCampaignSummaryValue}>{selectedCampaignCleanupCount}</div>
            </div>
          </div>
        </section>
      ) : null}

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      {isLoading ? (
        <div style={styles.loadingBox}>{t.dashboard.loading}</div>
      ) : (
        <>
          <section style={styles.statsGrid}>
            <MetricCard
              label={t.dashboard.totalReports}
              value={stats?.counts.total ?? 0}
              href={getPublicMapUrl("total", period, selectedCampaignId || undefined)}
            />
            <MetricCard
              label={t.dashboard.activeReports}
              value={stats?.counts.active ?? 0}
              href={getPublicMapUrl("active", period, selectedCampaignId || undefined)}
            />
            <MetricCard
              label={t.dashboard.inReview}
              value={stats?.counts.inReview ?? 0}
              href={getPublicMapUrl("in_review", period, selectedCampaignId || undefined)}
            />
            <MetricCard
              label={t.dashboard.plannedCleanup}
              value={stats?.counts.plannedCleanup ?? 0}
              href={getPublicMapUrl("planned_cleanup", period, selectedCampaignId || undefined)}
            />
            <MetricCard
              label={t.dashboard.resolved}
              value={stats?.counts.resolved ?? 0}
              href={getPublicMapUrl("resolved", period, selectedCampaignId || undefined)}
            />
            <MetricCard
              label={t.dashboard.rejected}
              value={stats?.counts.rejected ?? 0}
              href={getPublicMapUrl("rejected", period, selectedCampaignId || undefined)}
            />
          </section>

          <section style={styles.grid}>
            <div style={{ ...styles.card, ...styles.wideCard }}>
              <h2 style={styles.sectionTitle}>{t.dashboard.monthlyActivity}</h2>
              {!activity?.monthly.length ? (
                <div style={styles.emptyState}>{t.dashboard.noActivity}</div>
              ) : (
                <div style={styles.chartList}>
                  {activity.monthly.map((item) => (
                    <div key={item.key} style={styles.chartRow}>
                      <div style={styles.chartLabel}>{item.label}</div>
                      <div style={styles.barGroup}>
                        <div style={styles.barLine}>
                          <span style={styles.barCaption}>{t.dashboard.monthlyReports}</span>
                          <div style={styles.barTrack}>
                            <div
                              style={{
                                ...styles.barFill,
                                ...styles.barReports,
                                width: `${(item.reports / monthlyMax) * 100}%`
                              }}
                            />
                          </div>
                          <span style={styles.barValue}>{item.reports}</span>
                        </div>
                        <div style={styles.barLine}>
                          <span style={styles.barCaption}>{t.dashboard.monthlyResolved}</span>
                          <div style={styles.barTrack}>
                            <div
                              style={{
                                ...styles.barFill,
                                ...styles.barResolved,
                                width: `${(item.resolved / monthlyMax) * 100}%`
                              }}
                            />
                          </div>
                          <span style={styles.barValue}>{item.resolved}</span>
                        </div>
                        <div style={styles.barLine}>
                          <span style={styles.barCaption}>{t.dashboard.monthlyCleanups}</span>
                          <div style={styles.barTrack}>
                            <div
                              style={{
                                ...styles.barFill,
                                ...styles.barCleanups,
                                width: `${(item.cleanups / monthlyMax) * 100}%`
                              }}
                            />
                          </div>
                          <span style={styles.barValue}>{item.cleanups}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <LeaderboardCard
              title={t.dashboard.topParticipants}
              nameLabel={t.dashboard.participantName}
              primaryMetricLabel={t.dashboard.cleanupCount}
              secondaryMetricLabel={t.dashboard.resolvedCount}
              emptyLabel={t.dashboard.noActivity}
              items={
                activity?.topParticipants.map((item) => ({
                  id: item.userId,
                  name: item.displayName ?? t.dashboard.unknownUser,
                  primaryValue: item.cleanupCount,
                  secondaryValue: item.resolvedCount
                })) ?? []
              }
            />

            <LeaderboardCard
              title={t.dashboard.topReporters}
              nameLabel={t.dashboard.reporterName}
              primaryMetricLabel={t.dashboard.reportCount}
              secondaryMetricLabel={t.dashboard.resolvedCount}
              emptyLabel={t.dashboard.noActivity}
              items={
                activity?.topReporters.map((item) => ({
                  id: item.userId,
                  name: item.displayName ?? t.dashboard.unknownUser,
                  primaryValue: item.reportCount,
                  secondaryValue: item.resolvedCount
                })) ?? []
              }
            />
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={styles.metricCardLink}>
      <div style={styles.metricCard}>
        <div style={styles.metricLabel}>{label}</div>
        <div style={styles.metricValue}>{value}</div>
      </div>
    </a>
  );
}

function LeaderboardCard({
  title,
  nameLabel,
  primaryMetricLabel,
  secondaryMetricLabel,
  emptyLabel,
  items
}: {
  title: string;
  nameLabel: string;
  primaryMetricLabel: string;
  secondaryMetricLabel: string;
  emptyLabel: string;
  items: Array<{
    id: string;
    name: string;
    primaryValue: number;
    secondaryValue: number;
  }>;
}) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {items.length === 0 ? (
        <div style={styles.emptyState}>{emptyLabel}</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHead}>{nameLabel}</th>
              <th style={styles.tableHead}>{primaryMetricLabel}</th>
              <th style={styles.tableHead}>{secondaryMetricLabel}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={styles.tableCellName}>{item.name}</td>
                <td style={styles.tableCellValue}>{item.primaryValue}</td>
                <td style={styles.tableCellValue}>{item.secondaryValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "24px 24px 56px"
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 20,
    marginBottom: 24,
    padding: 24,
    borderRadius: 24,
    background:
      "linear-gradient(135deg, #082f49 0%, #155e75 46%, #f0fdf4 140%)",
    color: "#f8fafc"
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 8
  },
  title: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.05
  },
  subtitle: {
    maxWidth: 720,
    marginTop: 12,
    marginBottom: 0,
    color: "rgba(255,255,255,0.82)",
    fontSize: 16,
    lineHeight: 1.6
  },
  periodWrap: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end"
  },
  exportButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.24)",
    background: "#f59e0b",
    color: "#082f49",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none"
  },
  printButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.24)",
    background: "#ffffff",
    color: "#082f49",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none"
  },
  exportHint: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: 600,
    maxWidth: 240,
    lineHeight: 1.5
  },
  campaignField: {
    display: "grid",
    gap: 6
  },
  campaignLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)"
  },
  campaignSelect: {
    border: "1px solid rgba(255,255,255,0.24)",
    background: "rgba(255,255,255,0.08)",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    minWidth: 220
  },
  periodButton: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.24)",
    background: "rgba(255,255,255,0.08)",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer"
  },
  periodButtonActive: {
    background: "#f8fafc",
    color: "#082f49",
    borderColor: "#f8fafc"
  },
  errorBox: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  loadingBox: {
    padding: 18,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#475569"
  },
  selectedCampaignCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 20,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  selectedCampaignLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6
  },
  selectedCampaignName: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: 800
  },
  selectedCampaignMeta: {
    color: "#475569",
    fontSize: 13,
    marginTop: 6
  },
  selectedCampaignDescription: {
    color: "#334155",
    lineHeight: 1.6,
    margin: "10px 0 0"
  },
  selectedCampaignSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 14
  },
  selectedCampaignSummaryCard: {
    padding: 14,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #dbe5ec"
  },
  selectedCampaignSummaryLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8
  },
  selectedCampaignSummaryValue: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: 800
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 18
  },
  metricCard: {
    padding: 18,
    borderRadius: 20,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  metricCardLink: {
    textDecoration: "none",
    color: "inherit",
    display: "block"
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
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 1fr)",
    gap: 16
  },
  initiativeGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
    gap: 16,
    marginTop: 16
  },
  card: {
    padding: 18,
    borderRadius: 22,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  wideCard: {
    minHeight: 640
  },
  initiativeListCard: {
    minHeight: 520
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 16,
    color: "#0f172a",
    fontSize: 20
  },
  chartList: {
    display: "grid",
    gap: 14
  },
  chartRow: {
    display: "grid",
    gridTemplateColumns: "78px minmax(0, 1fr)",
    gap: 14,
    alignItems: "start"
  },
  chartLabel: {
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 13,
    paddingTop: 7
  },
  barGroup: {
    display: "grid",
    gap: 8
  },
  barLine: {
    display: "grid",
    gridTemplateColumns: "130px minmax(0, 1fr) 36px",
    gap: 10,
    alignItems: "center"
  },
  barCaption: {
    color: "#475569",
    fontSize: 12,
    fontWeight: 700
  },
  barTrack: {
    height: 12,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden"
  },
  barFill: {
    height: "100%",
    borderRadius: 999
  },
  barReports: {
    background: "#0f766e"
  },
  barResolved: {
    background: "#16a34a"
  },
  barCleanups: {
    background: "#2563eb"
  },
  barValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 800,
    textAlign: "right"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse"
  },
  tableHead: {
    textAlign: "left",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    paddingBottom: 10,
    borderBottom: "1px solid #e2e8f0"
  },
  tableCellName: {
    padding: "12px 0",
    color: "#0f172a",
    fontWeight: 700,
    borderBottom: "1px solid #f1f5f9"
  },
  tableCellValue: {
    padding: "12px 0",
    color: "#0f172a",
    fontWeight: 700,
    textAlign: "right",
    borderBottom: "1px solid #f1f5f9"
  },
  emptyState: {
    color: "#64748b",
    paddingTop: 10
  },
  initiativeList: {
    display: "grid",
    gap: 12
  },
  initiativeCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 16,
    background: "#f8fafc"
  },
  initiativeMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10
  },
  initiativeCategory: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  initiativeDate: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600
  },
  initiativeTitle: {
    margin: "0 0 8px",
    color: "#0f172a",
    fontSize: 18
  },
  initiativeBody: {
    margin: 0,
    color: "#334155",
    lineHeight: 1.6
  },
  initiativeAuthor: {
    marginTop: 12,
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 13
  },
  formRow: {
    marginBottom: 12
  },
  formLabel: {
    display: "block",
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "11px 12px",
    fontSize: 14
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "11px 12px",
    fontSize: 14
  },
  textarea: {
    width: "100%",
    minHeight: 140,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: 12,
    resize: "vertical",
    fontSize: 14,
    fontFamily: "inherit"
  },
  submitButton: {
    border: "none",
    borderRadius: 14,
    background: "#0f766e",
    color: "#ffffff",
    padding: "12px 16px",
    fontWeight: 800,
    cursor: "pointer"
  },
  successBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #86efac"
  }
};

