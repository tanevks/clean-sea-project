"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchAdminUsers,
  fetchCampaigns,
  deleteMaintenanceEntity,
  exportMaintenanceArchive,
  fetchMaintenanceSummary,
  fetchMe,
  fetchReports,
  fetchServiceAreas,
  listInitiatives,
  resetMaintenanceData,
  restoreMaintenanceArchive,
  type AdminUserItem,
  type CampaignItem,
  type MaintenanceArchive,
  type MaintenanceSummary,
  type InitiativeItem,
  type ReportSummary,
  type ServiceAreaItem
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

type AccessState = "unknown" | "anonymous" | "forbidden" | "allowed";
type DeleteEntityType = "user" | "report" | "initiative" | "campaign" | "service_area";
type EntityCatalogItem = {
  id: string;
  type: DeleteEntityType;
  title: string;
  subtitle: string;
  meta?: string;
};

const copy = {
  bg: {
    title: "Поддръжка на данните",
    subtitle:
      "Web-only инструменти за архивиране, възстановяване и нулиране на приложните данни преди предаване на проекта.",
    adminRequired: "Само admin може да използва тази секция.",
    loginCta: "Към вход",
    backHome: "Към dashboard",
    backUsers: "Към потребители",
    backAreas: "Към райони",
    summary: "Обобщение на данните",
    exportTitle: "Архивиране",
    exportText:
      "Изтегля JSON архив на приложните данни. Архивът не включва бинарните media файлове и не възстановява автоматично auth потребители.",
    exportAction: "Изтегли архив",
    resetTitle: "Нулиране на приложните данни",
    resetText:
      "Изтрива проектните данни от базата и media файловете от storage. Това не засяга schema, extensions и Supabase конфигурацията.",
    includeUsers: "Изтрий и всички не-admin потребители",
    resetConfirmationLabel: "Въведи: RESET APPLICATION DATA",
    resetAction: "Нулирай данните",
    restoreTitle: "Възстановяване от архив",
    restoreText:
      "Работи само върху празен application dataset. Възстановява таблиците на приложението, но не създава автоматично auth потребители и не връща бинарните media файлове.",
    chooseFile: "Избери JSON архив",
    loadedArchive: "Зареден архив",
    archivePreview: "Преглед на архива",
    deleteTitle: "Единично изтриване",
    deleteText:
      "Използвай това само ако искаш да махнеш конкретен обект, без да нулираш всички данни.",
    entityType: "Тип обект",
    entityId: "ID на обекта",
    deleteEntityAction: "Изтрий обекта",
    restoreConfirmationLabel: "Въведи: RESTORE APPLICATION DATA",
    restoreAction: "Възстанови архив",
    successExport: "Архивът е изтеглен.",
    successReset: "Нулирането завърши успешно.",
    successRestore: "Възстановяването завърши успешно.",
    warnings: "Предупреждения",
    loading: "Зареждане...",
    users: "Потребители",
    nonAdminUsers: "Не-admin потребители",
    reports: "Сигнали",
    reportComments: "Коментари по сигнали",
    reportMedia: "Media по сигнали",
    cleanupParticipants: "Участници",
    cleanupEvents: "Насрочени почиствания",
    initiatives: "Идеи и инициативи",
    initiativeComments: "Коментари по инициативи",
    campaigns: "Акции",
    serviceAreas: "Райони",
    notifications: "Известия",
    auditLogs: "Одит логове"
  },
  en: {
    title: "Data maintenance",
    subtitle:
      "Web-only tools for archive export, restore, and application data reset before project handoff.",
    adminRequired: "Only the admin can use this section.",
    loginCta: "Go to login",
    backHome: "To dashboard",
    backUsers: "To users",
    backAreas: "To service areas",
    summary: "Data summary",
    exportTitle: "Archive export",
    exportText:
      "Downloads a JSON archive of the application data. The archive does not include binary media files and does not automatically restore auth users.",
    exportAction: "Download archive",
    resetTitle: "Application data reset",
    resetText:
      "Deletes project data from the database and media files from storage. This does not affect the schema, extensions, or Supabase configuration.",
    includeUsers: "Delete all non-admin users as well",
    resetConfirmationLabel: "Type: RESET APPLICATION DATA",
    resetAction: "Reset data",
    restoreTitle: "Restore from archive",
    restoreText:
      "Works only on an empty application dataset. Restores application tables, but does not recreate auth users or media binaries automatically.",
    chooseFile: "Choose JSON archive",
    loadedArchive: "Loaded archive",
    archivePreview: "Archive preview",
    deleteTitle: "Single-entity delete",
    deleteText:
      "Use this only when you want to remove one specific object without resetting the whole dataset.",
    entityType: "Entity type",
    entityId: "Entity id",
    deleteEntityAction: "Delete entity",
    restoreConfirmationLabel: "Type: RESTORE APPLICATION DATA",
    restoreAction: "Restore archive",
    successExport: "Archive downloaded successfully.",
    successReset: "Reset completed successfully.",
    successRestore: "Restore completed successfully.",
    warnings: "Warnings",
    loading: "Loading...",
    users: "Users",
    nonAdminUsers: "Non-admin users",
    reports: "Reports",
    reportComments: "Report comments",
    reportMedia: "Report media",
    cleanupParticipants: "Participants",
    cleanupEvents: "Scheduled cleanups",
    initiatives: "Ideas and initiatives",
    initiativeComments: "Initiative comments",
    campaigns: "Campaigns",
    serviceAreas: "Service areas",
    notifications: "Notifications",
    auditLogs: "Audit logs"
  }
} as const;

export default function AdminMaintenancePage() {
  const { language } = useWebI18n();
  const text = copy[language];
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [summary, setSummary] = useState<MaintenanceSummary["counts"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [includeUsers, setIncludeUsers] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [archiveFileName, setArchiveFileName] = useState("");
  const [archivePayload, setArchivePayload] = useState<MaintenanceArchive | null>(null);
  const [deleteEntityType, setDeleteEntityType] = useState<
    DeleteEntityType
  >("report");
  const [deleteEntitySearch, setDeleteEntitySearch] = useState("");
  const [deleteEntityId, setDeleteEntityId] = useState("");
  const [isDeletingEntity, setIsDeletingEntity] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [entityCatalog, setEntityCatalog] = useState<Record<DeleteEntityType, EntityCatalogItem[]>>({
    user: [],
    report: [],
    initiative: [],
    campaign: [],
    service_area: []
  });

  const filteredEntityOptions = useMemo(() => {
    const normalizedQuery = deleteEntitySearch.trim().toLowerCase();
    const items = entityCatalog[deleteEntityType] ?? [];
    if (!normalizedQuery) {
      return items.slice(0, 8);
    }

    return items
      .filter((item) => {
        const haystack = `${item.title} ${item.subtitle} ${item.meta ?? ""} ${item.id}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 12);
  }, [deleteEntitySearch, deleteEntityType, entityCatalog]);

  const selectedEntity = useMemo(
    () =>
      (entityCatalog[deleteEntityType] ?? []).find((item) => item.id === deleteEntityId) ?? null,
    [deleteEntityId, deleteEntityType, entityCatalog]
  );

  const summaryItems = useMemo(
    () =>
      summary
        ? [
            [text.users, summary.users],
            [text.nonAdminUsers, summary.nonAdminUsers],
            [text.reports, summary.reports],
            [text.reportComments, summary.reportComments],
            [text.reportMedia, summary.reportMedia],
            [text.cleanupParticipants, summary.cleanupParticipants],
            [text.cleanupEvents, summary.cleanupEvents],
            [text.initiatives, summary.initiatives],
            [text.initiativeComments, summary.initiativeComments],
            [text.campaigns, summary.campaigns],
            [text.serviceAreas, summary.serviceAreas],
            [text.notifications, summary.notifications],
            [text.auditLogs, summary.auditLogs]
          ]
        : [],
    [summary, text]
  );

  async function loadSummary(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    try {
      const next = await fetchMaintenanceSummary();
      setSummary(next.counts);
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load maintenance summary."
        );
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }

  async function loadEntityCatalog() {
    const [users, reports, initiatives, campaigns, serviceAreas] = await Promise.all([
      fetchAdminUsers(),
      fetchReports("all"),
      listInitiatives("all"),
      fetchCampaigns(),
      fetchServiceAreas()
    ]);

    setEntityCatalog({
      user: users.map(toUserCatalogItem),
      report: reports.map(toReportCatalogItem),
      initiative: initiatives.map(toInitiativeCatalogItem),
      campaign: campaigns.map(toCampaignCatalogItem),
      service_area: serviceAreas.map(toServiceAreaCatalogItem)
    });
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
        if (me.role !== "admin") {
          setAccessState("forbidden");
          setIsLoading(false);
          return;
        }

        setAccessState("allowed");
        await Promise.all([loadSummary(), loadEntityCatalog()]);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to bootstrap maintenance panel."
        );
        setIsLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    setDeleteEntityId("");
    setDeleteEntitySearch("");
  }, [deleteEntityType]);

  async function onExport() {
    setIsExporting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setWarnings([]);

    try {
      const archive = await exportMaintenanceArchive();
      const blob = new Blob([JSON.stringify(archive, null, 2)], {
        type: "application/json;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `cleansea-archive-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccessMessage(text.successExport);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to export archive."
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function onReset() {
    setIsResetting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setWarnings([]);

    try {
      const result = await resetMaintenanceData({
        confirmation: resetConfirmation,
        includeUsers
      });
      setSuccessMessage(
        `${text.successReset} Deleted: ${JSON.stringify(result.deleted)}`
      );
      setResetConfirmation("");
      await Promise.all([loadSummary({ silent: true }), loadEntityCatalog()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to reset data."
      );
    } finally {
      setIsResetting(false);
    }
  }

  async function onArchiveFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setArchiveFileName("");
      setArchivePayload(null);
      return;
    }

    try {
      const textContent = await file.text();
      const parsed = JSON.parse(textContent) as MaintenanceArchive;
      setArchiveFileName(file.name);
      setArchivePayload(parsed);
      setErrorMessage("");
    } catch {
      setArchiveFileName("");
      setArchivePayload(null);
      setErrorMessage("Invalid archive file.");
    }
  }

  async function onRestore() {
    if (!archivePayload) {
      return;
    }

    setIsRestoring(true);
    setErrorMessage("");
    setSuccessMessage("");
    setWarnings([]);

    try {
      const result = await restoreMaintenanceArchive({
        confirmation: restoreConfirmation,
        archive: archivePayload
      });
      setWarnings(result.warnings);
      setSuccessMessage(
        `${text.successRestore} Restored: ${JSON.stringify(result.restored)}`
      );
      setRestoreConfirmation("");
      await Promise.all([loadSummary({ silent: true }), loadEntityCatalog()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to restore archive."
      );
    } finally {
      setIsRestoring(false);
    }
  }

  async function onDeleteEntity() {
    if (!deleteEntityId.trim()) {
      setErrorMessage("Entity id is required.");
      return;
    }

    setIsDeletingEntity(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteMaintenanceEntity({
        entityType: deleteEntityType,
        entityId: deleteEntityId.trim()
      });
      setSuccessMessage("Entity deleted successfully.");
      setDeleteEntityId("");
      setDeleteEntitySearch("");
      await Promise.all([loadSummary({ silent: true }), loadEntityCatalog()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete entity."
      );
    } finally {
      setIsDeletingEntity(false);
    }
  }

  if (accessState === "anonymous") {
    return (
      <main style={styles.page}>
        <div style={styles.heroCard}>
          <h1 style={styles.title}>{text.title}</h1>
          <p style={styles.subtitle}>{text.adminRequired}</p>
          <Link href="/auth/login" style={styles.primaryLink}>
            {text.loginCta}
          </Link>
        </div>
      </main>
    );
  }

  if (accessState === "forbidden") {
    return (
      <main style={styles.page}>
        <div style={styles.heroCard}>
          <h1 style={styles.title}>{text.title}</h1>
          <p style={styles.subtitle}>{text.adminRequired}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.heroCard}>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.subtitle}>{text.subtitle}</p>
        <div style={styles.linkRow}>
          <Link href="/admin/users" style={styles.secondaryLink}>
            {text.backUsers}
          </Link>
          <Link href="/admin/service-areas" style={styles.secondaryLink}>
            {text.backAreas}
          </Link>
          <Link href="/dashboard" style={styles.secondaryLink}>
            {text.backHome}
          </Link>
        </div>
      </div>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}
      {successMessage ? <div style={styles.successBox}>{successMessage}</div> : null}
      {warnings.length > 0 ? (
        <div style={styles.warningBox}>
          <strong>{text.warnings}</strong>
          <ul style={styles.warningList}>
            {warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>{text.summary}</h2>
        {isLoading ? (
          <div style={styles.emptyState}>{text.loading}</div>
        ) : (
          <div style={styles.summaryGrid}>
            {summaryItems.map(([label, value]) => (
              <div key={label} style={styles.summaryCard}>
                <div style={styles.summaryLabel}>{label}</div>
                <div style={styles.summaryValue}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>{text.exportTitle}</h2>
          <p style={styles.muted}>{text.exportText}</p>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={isExporting}
            style={styles.primaryButton}
          >
            {isExporting ? text.loading : text.exportAction}
          </button>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>{text.restoreTitle}</h2>
          <p style={styles.muted}>{text.restoreText}</p>
          <label style={styles.fileLabel}>
            <span>{text.chooseFile}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => void onArchiveFileSelected(event)}
              style={styles.fileInput}
            />
          </label>
          {archiveFileName ? (
            <div style={styles.loadedFile}>
              {text.loadedArchive}: <strong>{archiveFileName}</strong>
            </div>
          ) : null}
          {archivePayload ? (
            <div style={styles.previewBox}>
              <strong>{text.archivePreview}</strong>
              <div style={styles.previewRow}>
                <span>format</span>
                <span>{archivePayload.format}</span>
              </div>
              <div style={styles.previewRow}>
                <span>version</span>
                <span>{archivePayload.version}</span>
              </div>
              <div style={styles.previewRow}>
                <span>reports</span>
                <span>{archivePayload.data.reports.length}</span>
              </div>
              <div style={styles.previewRow}>
                <span>initiatives</span>
                <span>{archivePayload.data.initiatives.length}</span>
              </div>
              <div style={styles.previewRow}>
                <span>campaigns</span>
                <span>{archivePayload.data.campaigns.length}</span>
              </div>
              <div style={styles.previewRow}>
                <span>service areas</span>
                <span>{archivePayload.data.serviceAreas.length}</span>
              </div>
              <div style={styles.previewRow}>
                <span>media manifest</span>
                <span>{archivePayload.data.mediaManifest.length}</span>
              </div>
            </div>
          ) : null}
          <label style={styles.label}>{text.restoreConfirmationLabel}</label>
          <input
            value={restoreConfirmation}
            onChange={(event) => setRestoreConfirmation(event.target.value)}
            style={styles.input}
          />
          <button
            type="button"
            onClick={() => void onRestore()}
            disabled={isRestoring || !archivePayload}
            style={{
              ...styles.primaryButton,
              ...styles.buttonTopSpacing,
              ...((isRestoring || !archivePayload) ? styles.disabledButton : null)
            }}
          >
            {isRestoring ? text.loading : text.restoreAction}
          </button>
        </section>
      </div>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>{text.deleteTitle}</h2>
        <p style={styles.muted}>{text.deleteText}</p>
        <div style={styles.deleteGrid}>
          <div style={styles.deleteMainColumn}>
            <label style={styles.label}>{text.entityType}</label>
            <select
              value={deleteEntityType}
              onChange={(event) =>
                setDeleteEntityType(event.target.value as DeleteEntityType)
              }
              style={styles.input}
            >
              <option value="user">user</option>
              <option value="report">report</option>
              <option value="initiative">initiative</option>
              <option value="campaign">campaign</option>
              <option value="service_area">service_area</option>
            </select>

            <label style={styles.label}>Търсене</label>
            <input
              value={deleteEntitySearch}
              onChange={(event) => setDeleteEntitySearch(event.target.value)}
              style={styles.input}
              placeholder="Търси по име, заглавие, email или описание"
            />

            <div style={styles.entityList}>
              {filteredEntityOptions.length > 0 ? (
                filteredEntityOptions.map((item) => {
                  const isSelected = item.id === deleteEntityId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDeleteEntityId(item.id)}
                      style={{
                        ...styles.entityOption,
                        ...(isSelected ? styles.entityOptionSelected : null)
                      }}
                    >
                      <span style={styles.entityOptionTitle}>{item.title}</span>
                      <span style={styles.entityOptionSubtitle}>{item.subtitle}</span>
                      {item.meta ? <span style={styles.entityOptionMeta}>{item.meta}</span> : null}
                    </button>
                  );
                })
              ) : (
                <div style={styles.emptyEntityList}>
                  Няма съвпадащи записи за избрания тип.
                </div>
              )}
            </div>
          </div>

          <div style={styles.deleteSideColumn}>
            <label style={styles.label}>{text.entityId}</label>
            <input value={deleteEntityId} readOnly style={styles.inputReadonly} />
            <div style={styles.selectionCard}>
              <strong>Избран обект</strong>
              {selectedEntity ? (
                <>
                  <div style={styles.selectionTitle}>{selectedEntity.title}</div>
                  <div style={styles.selectionSubtitle}>{selectedEntity.subtitle}</div>
                  {selectedEntity.meta ? (
                    <div style={styles.selectionMeta}>{selectedEntity.meta}</div>
                  ) : null}
                </>
              ) : (
                <div style={styles.selectionSubtitle}>
                  Избери запис от списъка вляво.
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onDeleteEntity()}
          disabled={isDeletingEntity || !deleteEntityId.trim()}
          style={{
            ...styles.dangerButton,
            ...styles.buttonTopSpacing,
            ...((isDeletingEntity || !deleteEntityId.trim()) ? styles.disabledButton : null)
          }}
        >
          {isDeletingEntity ? text.loading : text.deleteEntityAction}
        </button>
      </section>

      <section style={styles.cardDanger}>
        <h2 style={styles.sectionTitle}>{text.resetTitle}</h2>
        <p style={styles.muted}>{text.resetText}</p>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={includeUsers}
            onChange={(event) => setIncludeUsers(event.target.checked)}
          />
          <span>{text.includeUsers}</span>
        </label>
        <label style={styles.label}>{text.resetConfirmationLabel}</label>
        <input
          value={resetConfirmation}
          onChange={(event) => setResetConfirmation(event.target.value)}
          style={styles.input}
        />
        <button
          type="button"
          onClick={() => void onReset()}
          disabled={isResetting}
          style={{
            ...styles.dangerButton,
            ...styles.buttonTopSpacing,
            ...(isResetting ? styles.disabledButton : null)
          }}
        >
          {isResetting ? text.loading : text.resetAction}
        </button>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: "32px 24px 56px",
    display: "grid",
    gap: "20px",
    background: "#f4f7fb",
    minHeight: "100vh"
  },
  heroCard: {
    background: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    borderRadius: "18px",
    padding: "24px"
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.15,
    color: "#172033"
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#5b6475",
    lineHeight: 1.55,
    maxWidth: "920px"
  },
  linkRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px"
  },
  primaryLink: {
    display: "inline-flex",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "#0b6bcb",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 700
  },
  secondaryLink: {
    display: "inline-flex",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#172033",
    textDecoration: "none",
    fontWeight: 700,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea"
  },
  errorBox: {
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: "14px",
    padding: "14px 16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#fecaca"
  },
  successBox: {
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "14px",
    padding: "14px 16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#bbf7d0"
  },
  warningBox: {
    background: "#fff7ed",
    color: "#9a3412",
    borderRadius: "14px",
    padding: "14px 16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#fed7aa"
  },
  warningList: {
    margin: "10px 0 0 18px"
  },
  card: {
    background: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    borderRadius: "18px",
    padding: "20px"
  },
  cardDanger: {
    background: "#fff7f7",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#f5c2c7",
    borderRadius: "18px",
    padding: "20px"
  },
  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#172033"
  },
  muted: {
    color: "#5b6475",
    lineHeight: 1.6
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    marginTop: "16px"
  },
  summaryCard: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    borderRadius: "14px",
    padding: "14px"
  },
  summaryLabel: {
    color: "#5b6475",
    fontSize: "12px",
    marginBottom: "6px"
  },
  summaryValue: {
    color: "#172033",
    fontSize: "24px",
    fontWeight: 800
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "20px"
  },
  primaryButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#0b6bcb",
    background: "#0b6bcb",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer"
  },
  dangerButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#b91c1c",
    background: "#b91c1c",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer"
  },
  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  buttonTopSpacing: {
    marginTop: "14px"
  },
  label: {
    display: "block",
    marginTop: "14px",
    marginBottom: "6px",
    color: "#334155",
    fontWeight: 700
  },
  input: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    padding: "10px 12px",
    fontSize: "14px"
  },
  fileLabel: {
    display: "grid",
    gap: "8px",
    marginTop: "14px",
    color: "#334155",
    fontWeight: 700
  },
  fileInput: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box"
  },
  loadedFile: {
    marginTop: "10px",
    color: "#334155",
    wordBreak: "break-word"
  },
  previewBox: {
    marginTop: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    borderRadius: "12px",
    padding: "12px 14px",
    display: "grid",
    gap: "8px"
  },
  previewRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: "12px",
    color: "#334155"
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "16px",
    color: "#334155",
    fontWeight: 700
  },
  emptyState: {
    marginTop: "16px",
    color: "#5b6475"
  },
  deleteGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    alignItems: "start"
  },
  deleteMainColumn: {
    minWidth: 0
  },
  deleteSideColumn: {
    minWidth: 0
  },
  inputReadonly: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    background: "#f8fafc",
    color: "#475569",
    padding: "10px 12px",
    fontSize: "14px"
  },
  entityList: {
    marginTop: "12px",
    display: "grid",
    gap: "10px",
    maxHeight: "360px",
    overflowY: "auto",
    paddingRight: "4px"
  },
  entityOption: {
    width: "100%",
    textAlign: "left",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    background: "#ffffff",
    borderRadius: "12px",
    padding: "12px 14px",
    display: "grid",
    gap: "4px",
    cursor: "pointer",
    boxSizing: "border-box"
  },
  entityOptionSelected: {
    borderColor: "#0b6bcb",
    background: "#eff6ff"
  },
  entityOptionTitle: {
    color: "#172033",
    fontWeight: 700,
    wordBreak: "break-word"
  },
  entityOptionSubtitle: {
    color: "#475569",
    fontSize: "13px",
    wordBreak: "break-word"
  },
  entityOptionMeta: {
    color: "#64748b",
    fontSize: "12px",
    wordBreak: "break-word"
  },
  emptyEntityList: {
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: "12px",
    padding: "16px",
    color: "#64748b"
  },
  selectionCard: {
    marginTop: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d8e0ea",
    borderRadius: "12px",
    padding: "14px",
    display: "grid",
    gap: "6px",
    background: "#f8fafc"
  },
  selectionTitle: {
    color: "#172033",
    fontWeight: 700,
    wordBreak: "break-word"
  },
  selectionSubtitle: {
    color: "#475569",
    wordBreak: "break-word"
  },
  selectionMeta: {
    color: "#64748b",
    fontSize: "12px",
    wordBreak: "break-word"
  }
};

function toUserCatalogItem(item: AdminUserItem): EntityCatalogItem {
  return {
    id: item.id,
    type: "user",
    title: item.displayName || item.email || "Потребител без име",
    subtitle: item.email || item.id,
    meta: `${item.role}${item.phone ? ` • ${item.phone}` : ""}`
  };
}

function toReportCatalogItem(item: ReportSummary): EntityCatalogItem {
  return {
    id: item.id,
    type: "report",
    title: item.title?.trim() || item.description.slice(0, 80),
    subtitle: item.description.slice(0, 140),
    meta: `${item.status}${item.createdAt ? ` • ${new Date(item.createdAt).toLocaleString("bg-BG")}` : ""}`
  };
}

function toInitiativeCatalogItem(item: InitiativeItem): EntityCatalogItem {
  return {
    id: item.id,
    type: "initiative",
    title: item.title,
    subtitle: item.description.slice(0, 140),
    meta: `${item.status} • ${item.submitterName}`
  };
}

function toCampaignCatalogItem(item: CampaignItem): EntityCatalogItem {
  return {
    id: item.id,
    type: "campaign",
    title: item.name,
    subtitle: item.description?.slice(0, 140) || "Без описание",
    meta: `${item.status} • ${new Date(item.startsAt).toLocaleDateString("bg-BG")} - ${new Date(item.endsAt).toLocaleDateString("bg-BG")}`
  };
}

function toServiceAreaCatalogItem(item: ServiceAreaItem): EntityCatalogItem {
  return {
    id: item.id,
    type: "service_area",
    title: item.name,
    subtitle: item.isActive ? "Активен район" : "Неактивен район",
    meta: `${new Date(item.updatedAt).toLocaleString("bg-BG")}`
  };
}
