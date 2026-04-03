"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  createCampaign,
  fetchCampaigns,
  fetchMe,
  fetchReports,
  updateReportCampaign,
  updateCampaign,
  type CampaignItem,
  type CampaignStatus,
  type ReportSummary
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

function toLocalInputValue(value: string) {
  const date = new Date(value);
  const pad = (item: number) => `${item}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

export default function CampaignModerationPage() {
  const { t } = useWebI18n();
  const [accessState, setAccessState] = useState<
    "unknown" | "anonymous" | "forbidden" | "allowed"
  >("unknown");
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assigningReportId, setAssigningReportId] = useState("");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setAccessState("anonymous");
        }
        return;
      }

      try {
        const me = await fetchMe();
        if (me.role !== "moderator" && me.role !== "admin") {
          if (!cancelled) {
            setAccessState("forbidden");
          }
          return;
        }

        if (!cancelled) {
          setAccessState("allowed");
        }
      } catch {
        if (!cancelled) {
          setAccessState("anonymous");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accessState !== "allowed") {
      return;
    }

    let cancelled = false;

    async function loadItems() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [nextItems, nextReports] = await Promise.all([
          fetchCampaigns(),
          fetchReports("all")
        ]);
        if (!cancelled) {
          setItems(nextItems);
          setReports(nextReports);
          if (!selectedId && nextItems[0]) {
            selectItem(nextItems[0]);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load campaigns.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [accessState]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const reportStatusLabels: Record<ReportSummary["status"], string> = useMemo(
    () => ({
      new: t.moderation.new,
      in_review: t.moderation.inReview,
      planned_cleanup: t.moderation.plannedCleanup,
      resolved: t.moderation.resolved,
      rejected: t.moderation.rejected
    }),
    [t]
  );

  function selectItem(item: CampaignItem) {
    setSelectedId(item.id);
    setName(item.name);
    setDescription(item.description ?? "");
    setStartsAt(toLocalInputValue(item.startsAt));
    setEndsAt(toLocalInputValue(item.endsAt));
    setStatus(item.status);
    setSuccessMessage("");
    setErrorMessage("");
  }

  function resetForm() {
    setSelectedId("");
    setName("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setStatus("draft");
    setSuccessMessage("");
    setErrorMessage("");
  }

  async function onSave() {
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = {
        name,
        description,
        startsAt: toIso(startsAt),
        endsAt: toIso(endsAt),
        status
      };

      if (selectedItem) {
        const updated = await updateCampaign(selectedItem.id, payload);
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        selectItem(updated);
        setSuccessMessage(t.campaigns.updateSuccess);
      } else {
        const created = await createCampaign(payload);
        setItems((current) => [created, ...current]);
        selectItem(created);
        setSuccessMessage(t.campaigns.createSuccess);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save campaign.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onAssignReport(reportId: string, campaignId: string | null) {
    setAssigningReportId(reportId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const updated = await updateReportCampaign(reportId, { campaignId });
      const assignedCampaign =
        campaignId === null
          ? null
          : items.find((item) => item.id === campaignId) ?? null;

      setReports((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...updated,
                campaign: campaignId === null ? null : updated.campaign ?? assignedCampaign
              }
            : item
        )
      );

      const refreshedReports = await fetchReports("all");
      setReports(refreshedReports);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update report campaign.");
    } finally {
      setAssigningReportId("");
    }
  }

  const filteredReports = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    return reports.filter((item) => {
      if (item.status === "resolved" || item.status === "rejected") {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        item.description.toLowerCase().includes(query) ||
        (item.title ?? "").toLowerCase().includes(query)
      );
    });
  }, [reportSearch, reports]);

  const assignedReports = selectedItem
    ? filteredReports.filter((item) => item.campaign?.id === selectedItem.id)
    : [];
  const unassignedOrOtherReports = selectedItem
    ? filteredReports.filter((item) => item.campaign?.id !== selectedItem.id)
    : [];

  const campaignReports = selectedItem
    ? reports.filter((item) => item.campaign?.id === selectedItem.id)
    : [];

  const campaignSummary = useMemo(() => {
    return {
      linkedReports: campaignReports.length,
      activeReports: campaignReports.filter(
        (item) => item.status !== "resolved" && item.status !== "rejected"
      ).length,
      resolvedReports: campaignReports.filter((item) => item.status === "resolved").length,
      cleanupParticipants: campaignReports.reduce(
        (sum, item) => sum + (item.cleanupSummary?.participantCount ?? 0),
        0
      )
    };
  }, [campaignReports]);

  if (accessState === "anonymous") {
    return <main style={styles.page}>{t.common.loginRequired}</main>;
  }

  if (accessState === "forbidden") {
    return <main style={styles.page}>{t.common.moderatorRequired}</main>;
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>{t.campaigns.title}</h1>
      <p style={styles.subtitle}>{t.campaigns.subtitle}</p>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}
      {successMessage ? <div style={styles.successBox}>{successMessage}</div> : null}

      <div style={styles.layout}>
        <aside style={styles.sidebar}>
          <button type="button" onClick={resetForm} style={styles.newButton}>
            {t.campaigns.newCampaign}
          </button>
          {isLoading ? (
            <div style={styles.emptyBox}>{t.common.loading}</div>
          ) : items.length === 0 ? (
            <div style={styles.emptyBox}>{t.campaigns.empty}</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item)}
                style={{
                  ...styles.sidebarItem,
                  ...(selectedId === item.id ? styles.sidebarItemActive : null)
                }}
              >
                <div style={styles.sidebarMeta}>
                  <span style={styles.statusPill}>{t.campaigns[item.status]}</span>
                </div>
                <div style={styles.sidebarTitle}>{item.name}</div>
                <div style={styles.sidebarDate}>
                  {new Date(item.startsAt).toLocaleDateString()} - {" "}
                  {new Date(item.endsAt).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </aside>

        <section style={styles.detailCard}>
          <div style={styles.field}>
            <label style={styles.label}>{t.campaigns.name}</label>
            <input value={name} onChange={(event) => setName(event.target.value)} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.campaigns.description}</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              style={styles.textarea}
            />
          </div>
          <div style={styles.twoCols}>
            <div style={styles.field}>
              <label style={styles.label}>{t.campaigns.startsAt}</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>{t.campaigns.endsAt}</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                style={styles.input}
              />
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.campaigns.status}</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CampaignStatus)}
              style={styles.select}
            >
              <option value="draft">{t.campaigns.draft}</option>
              <option value="active">{t.campaigns.active}</option>
              <option value="completed">{t.campaigns.completed}</option>
            </select>
          </div>
          <button type="button" onClick={() => void onSave()} style={styles.primaryButton}>
            {isSaving
              ? t.moderation.saving
              : selectedItem
                ? t.campaigns.update
                : t.campaigns.create}
          </button>

          {selectedItem ? (
            <div style={styles.reportAssignmentSection}>
              <div style={styles.summarySection}>
                <h2 style={styles.assignmentTitle}>{t.campaigns.summary}</h2>
                <div style={styles.summaryGrid}>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>{t.campaigns.linkedReports}</div>
                    <div style={styles.summaryValue}>{campaignSummary.linkedReports}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>{t.campaigns.activeReports}</div>
                    <div style={styles.summaryValue}>{campaignSummary.activeReports}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>{t.campaigns.resolvedReports}</div>
                    <div style={styles.summaryValue}>{campaignSummary.resolvedReports}</div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>{t.campaigns.cleanupParticipants}</div>
                    <div style={styles.summaryValue}>{campaignSummary.cleanupParticipants}</div>
                  </div>
                </div>
              </div>

              <div style={styles.assignmentHeader}>
                <div>
                  <h2 style={styles.assignmentTitle}>{t.campaigns.reportsInCampaign}</h2>
                  <p style={styles.assignmentSubtitle}>{t.campaigns.reportsInCampaignSubtitle}</p>
                </div>
                <input
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  placeholder={t.campaigns.searchReport}
                  style={styles.searchInput}
                />
              </div>

              <div style={styles.assignmentColumns}>
                <div style={styles.assignmentColumn}>
                  <div style={styles.assignmentColumnTitle}>{t.campaigns.assigned}</div>
                  {assignedReports.length === 0 ? (
                    <div style={styles.assignmentEmpty}>{t.campaigns.noAssignedReports}</div>
                  ) : (
                    assignedReports.map((report) => (
                      <div key={report.id} style={styles.reportCard}>
                        <div style={styles.reportCardTop}>
                          <span style={styles.reportStatus}>{reportStatusLabels[report.status]}</span>
                          <button
                            type="button"
                            onClick={() => void onAssignReport(report.id, null)}
                            style={styles.reportSecondaryAction}
                            disabled={assigningReportId === report.id}
                          >
                            {assigningReportId === report.id ? t.moderation.saving : t.campaigns.remove}
                          </button>
                        </div>
                        <div style={styles.reportCardBody}>{report.title ?? report.description}</div>
                      </div>
                    ))
                  )}
                </div>

                <div style={styles.assignmentColumn}>
                  <div style={styles.assignmentColumnTitle}>{t.campaigns.otherReports}</div>
                  {unassignedOrOtherReports.length === 0 ? (
                    <div style={styles.assignmentEmpty}>{t.campaigns.noOtherReports}</div>
                  ) : (
                    unassignedOrOtherReports.map((report) => (
                      <div key={report.id} style={styles.reportCard}>
                        <div style={styles.reportCardTop}>
                          <span style={styles.reportStatus}>{reportStatusLabels[report.status]}</span>
                          <button
                            type="button"
                            onClick={() => void onAssignReport(report.id, selectedItem.id)}
                            style={styles.reportPrimaryAction}
                            disabled={assigningReportId === report.id}
                          >
                            {assigningReportId === report.id ? t.moderation.saving : t.campaigns.assign}
                          </button>
                        </div>
                        <div style={styles.reportCardBody}>{report.title ?? report.description}</div>
                        {report.campaign ? (
                          <div style={styles.reportCardMeta}>
                            {t.campaigns.currentCampaign}: {report.campaign.name}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: 24
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 36
  },
  subtitle: {
    color: "#475569",
    marginTop: 10,
    marginBottom: 18
  },
  errorBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  successBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #86efac"
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: 18
  },
  sidebar: {
    display: "grid",
    gap: 10,
    alignContent: "start"
  },
  newButton: {
    border: "none",
    borderRadius: 14,
    background: "#0f766e",
    color: "#ffffff",
    padding: "12px 14px",
    fontWeight: 800,
    cursor: "pointer"
  },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#64748b"
  },
  sidebarItem: {
    textAlign: "left",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe5ec",
    background: "#ffffff",
    cursor: "pointer"
  },
  sidebarItemActive: {
    borderColor: "#0f766e",
    boxShadow: "0 0 0 2px rgba(15, 118, 110, 0.12)"
  },
  sidebarMeta: {
    marginBottom: 8
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
  sidebarTitle: {
    color: "#0f172a",
    fontWeight: 800,
    marginBottom: 8
  },
  sidebarDate: {
    color: "#64748b",
    fontSize: 13
  },
  detailCard: {
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    borderRadius: 22,
    padding: 18
  },
  field: {
    display: "grid",
    gap: 6,
    marginBottom: 14
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: 700
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
  primaryButton: {
    border: "none",
    borderRadius: 14,
    background: "#0f766e",
    color: "#ffffff",
    padding: "12px 16px",
    fontWeight: 800,
    cursor: "pointer"
  },
  reportAssignmentSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid #e2e8f0"
  },
  summarySection: {
    marginBottom: 20
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 12
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #dbe5ec"
  },
  summaryLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: 800
  },
  assignmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 16
  },
  assignmentTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 22
  },
  assignmentSubtitle: {
    marginTop: 6,
    marginBottom: 0,
    color: "#64748b"
  },
  searchInput: {
    width: 260,
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "11px 12px",
    fontSize: 14
  },
  assignmentColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14
  },
  assignmentColumn: {
    display: "grid",
    gap: 10,
    alignContent: "start"
  },
  assignmentColumnTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800
  },
  assignmentEmpty: {
    padding: 14,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#64748b"
  },
  reportCard: {
    padding: 14,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #dbe5ec"
  },
  reportCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 8
  },
  reportStatus: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#e2e8f0",
    color: "#334155",
    fontSize: 12,
    fontWeight: 800
  },
  reportCardBody: {
    color: "#0f172a",
    lineHeight: 1.5
  },
  reportCardMeta: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 12
  },
  reportPrimaryAction: {
    border: "none",
    borderRadius: 10,
    background: "#0f766e",
    color: "#ffffff",
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer"
  },
  reportSecondaryAction: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#ffffff",
    color: "#0f172a",
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer"
  }
};
