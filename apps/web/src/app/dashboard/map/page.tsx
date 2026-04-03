"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchPublicMap,
  type PublicMapMetric,
  type PublicMapReportItem,
  type PublicMapResponse,
  type ReportMedia
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";

type MapFrameProps = {
  items: PublicMapReportItem[];
  color: string;
  onMarkerPress: (reportId: string) => void;
};

const DEFAULT_CENTER = {
  latitude: 42.6977,
  longitude: 23.3219
};

export default function PublicDashboardMapPage() {
  const { t } = useWebI18n();
  const [payload, setPayload] = useState<PublicMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");

  const searchParams =
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const metric = (searchParams.get("metric") ?? "total") as PublicMapMetric;
  const period = (searchParams.get("period") ?? "year") as "all" | "year" | "season";
  const campaignId = searchParams.get("campaignId") ?? "";

  useEffect(() => {
    let cancelled = false;

    async function loadMap() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const nextPayload = await fetchPublicMap(metric, period, campaignId || undefined);
        if (!cancelled) {
          setPayload(nextPayload);
          setSelectedReportId(nextPayload.items[0]?.id ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load public map.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMap();

    return () => {
      cancelled = true;
    };
  }, [campaignId, metric, period]);

  const selectedReport = useMemo(
    () => payload?.items.find((item) => item.id === selectedReportId) ?? null,
    [payload, selectedReportId]
  );
  const backHref = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (campaignId) {
      params.set("campaignId", campaignId);
    }
    return `/dashboard?${params.toString()}`;
  }, [campaignId, period]);
  const metricLabel = useMemo(() => {
    switch (metric) {
      case "active":
        return t.dashboard.activeReports;
      case "in_review":
        return t.dashboard.inReview;
      case "planned_cleanup":
        return t.dashboard.plannedCleanup;
      case "resolved":
        return t.dashboard.resolved;
      case "rejected":
        return t.dashboard.rejected;
      case "total":
      default:
        return t.dashboard.totalReports;
    }
  }, [metric, t]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>Clean Sea</div>
          <h1 style={styles.title}>{t.dashboard.mapTitle}</h1>
          <p style={styles.subtitle}>
            {t.dashboard.mapSubtitle} {metricLabel}
          </p>
          {payload?.campaign ? (
            <div style={styles.campaignPill}>
              {payload.campaign.name}
            </div>
          ) : null}
        </div>
        <a href={backHref} style={styles.backButton}>
          {t.dashboard.backToDashboard}
        </a>
      </header>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      {isLoading ? (
        <div style={styles.loadingBox}>{t.dashboard.loadingMap}</div>
      ) : (
        <>
          {payload?.counts.excludedPrivate ? (
            <div style={styles.infoBox}>
              {t.dashboard.privateReportsExcluded.replace(
                "{count}",
                String(payload.counts.excludedPrivate)
              )}
            </div>
          ) : null}

          {!payload?.items.length ? (
            <div style={styles.emptyBox}>{t.dashboard.noMapReports}</div>
          ) : (
            <section style={styles.layout}>
              <div style={styles.mapCard}>
                <MapFrame
                  items={payload.items}
                  color={payload.color}
                  onMarkerPress={(reportId) => setSelectedReportId(reportId)}
                />
              </div>
              <aside style={styles.detailCard}>
                {selectedReport ? (
                  <PublicReportDetail report={selectedReport} />
                ) : (
                  <div style={styles.emptyState}>{t.dashboard.selectMarker}</div>
                )}
              </aside>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function PublicReportDetail({ report }: { report: PublicMapReportItem }) {
  const { t } = useWebI18n();

  return (
    <div style={styles.detailWrap}>
      <div style={styles.statusRow}>
        <span style={styles.statusChip}>{getStatusLabel(t, report.status)}</span>
        <span style={styles.dateLabel}>
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>
      <h2 style={styles.detailTitle}>{report.title || t.dashboard.untitledReport}</h2>
      <p style={styles.detailBody}>{report.description}</p>
      <div style={styles.coordBox}>
        {report.location.latitude.toFixed(6)}, {report.location.longitude.toFixed(6)}
      </div>
      {report.cleanupEvent ? (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>{t.dashboard.cleanupMeeting}</div>
          <div style={styles.detailBody}>{report.cleanupEvent.meetingAddress}</div>
          <div style={styles.dateLabel}>
            {new Date(report.cleanupEvent.scheduledAt).toLocaleString()}
          </div>
          <div style={styles.detailBody}>{report.cleanupEvent.instructionsText}</div>
          {report.cleanupEvent.toolsNote ? (
            <div style={styles.toolsBox}>{report.cleanupEvent.toolsNote}</div>
          ) : null}
        </div>
      ) : null}
      {report.resolutionNote?.note ? (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>{t.moderation.resolutionNote}</div>
          <div style={styles.detailBody}>{report.resolutionNote.note}</div>
        </div>
      ) : null}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>{t.moderation.media}</div>
        {report.media.length ? (
          <div style={styles.mediaGrid}>
            {report.media.map((item) => (
              <MediaThumb key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>{t.moderation.noMedia}</div>
        )}
      </div>
    </div>
  );
}

function MediaThumb({ item }: { item: ReportMedia }) {
  if (item.mediaType === "video") {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" style={styles.videoThumb}>
        <span style={styles.videoLabel}>VIDEO</span>
      </a>
    );
  }

  return (
    <a href={item.url} target="_blank" rel="noreferrer" style={styles.mediaLink}>
      <img src={item.thumbnailUrl || item.url} alt="" style={styles.mediaImage} />
    </a>
  );
}

function MapFrame({ items, color, onMarkerPress }: MapFrameProps) {
  const srcDoc = useMemo(() => buildMapHtml(items, color), [items, color]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as { type?: string; id?: string };
        if (payload.type === "markerPress" && payload.id) {
          onMarkerPress(payload.id);
        }
      } catch {
        // Ignore unrelated messages.
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMarkerPress]);

  return (
    <iframe
      title="public-report-map"
      srcDoc={srcDoc}
      style={styles.iframe}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

function buildMapHtml(items: PublicMapReportItem[], color: string) {
  const payload = JSON.stringify({
    color,
    defaultCenter: DEFAULT_CENTER,
    markers: items.map((item) => ({
      id: item.id,
      latitude: item.location.latitude,
      longitude: item.location.longitude,
      label: item.title || item.description.slice(0, 120)
    }))
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; }
      body { background: #e2e8f0; }
      .leaflet-container { font-family: sans-serif; }
      .leaflet-popup-content { font-size: 12px; line-height: 1.4; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const payload = ${payload};
      const map = L.map("map", {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      const markers = payload.markers.map((item) => {
        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius: 8,
          color: payload.color,
          fillColor: payload.color,
          fillOpacity: 0.92,
          weight: 2
        }).addTo(map);

        marker.bindPopup(item.label || "Signal");
        marker.on("click", () => {
          window.parent.postMessage(
            JSON.stringify({ type: "markerPress", id: item.id }),
            "*"
          );
        });
        return marker;
      });

      if (markers.length === 1) {
        map.setView(markers[0].getLatLng(), 15);
      } else if (markers.length > 1) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.18));
      } else {
        map.setView([payload.defaultCenter.latitude, payload.defaultCenter.longitude], 12);
      }
    </script>
  </body>
</html>`;
}

function getStatusLabel(t: ReturnType<typeof useWebI18n>["t"], status: PublicMapReportItem["status"]) {
  switch (status) {
    case "in_review":
      return t.dashboard.inReview;
    case "planned_cleanup":
      return t.dashboard.plannedCleanup;
    case "resolved":
      return t.dashboard.resolved;
    case "rejected":
      return t.dashboard.rejected;
    case "new":
      return t.moderation.new;
    default:
      return status;
  }
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 20,
    background: "#eaf1f6"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 8
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 34
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#475569",
    fontSize: 15,
    lineHeight: 1.6
  },
  campaignPill: {
    marginTop: 12,
    display: "inline-flex",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: 12
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "#0f172a",
    color: "#ffffff",
    padding: "12px 16px",
    fontWeight: 800,
    textDecoration: "none"
  },
  errorBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  infoBox: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fdba74"
  },
  loadingBox: {
    padding: 18,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    color: "#475569"
  },
  emptyBox: {
    padding: 18,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    color: "#475569"
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) 360px",
    gap: 16,
    minHeight: "calc(100vh - 180px)"
  },
  mapCard: {
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    borderRadius: 24,
    overflow: "hidden",
    minHeight: "calc(100vh - 180px)"
  },
  detailCard: {
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    borderRadius: 24,
    padding: 18,
    overflowY: "auto"
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    minHeight: "calc(100vh - 180px)"
  },
  detailWrap: {
    display: "grid",
    gap: 14
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  statusChip: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    padding: "6px 10px",
    fontWeight: 800,
    fontSize: 12
  },
  dateLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700
  },
  detailTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 24
  },
  detailBody: {
    color: "#334155",
    lineHeight: 1.65,
    margin: 0,
    whiteSpace: "pre-wrap"
  },
  coordBox: {
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #dbe5ec",
    padding: 12,
    color: "#0f172a",
    fontWeight: 700
  },
  section: {
    display: "grid",
    gap: 8
  },
  sectionLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em"
  },
  toolsBox: {
    borderRadius: 12,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    padding: 12,
    color: "#1e3a8a",
    lineHeight: 1.6
  },
  mediaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10
  },
  mediaLink: {
    display: "block",
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid #dbe5ec"
  },
  mediaImage: {
    width: "100%",
    height: 112,
    objectFit: "cover",
    display: "block"
  },
  videoThumb: {
    minHeight: 112,
    borderRadius: 14,
    border: "1px solid #dbe5ec",
    background: "#0f172a",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none"
  },
  videoLabel: {
    fontWeight: 900,
    letterSpacing: "0.12em"
  },
  emptyState: {
    color: "#64748b",
    lineHeight: 1.6
  }
};
