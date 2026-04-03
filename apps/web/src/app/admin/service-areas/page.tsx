"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  createServiceArea,
  deleteServiceArea,
  fetchMe,
  fetchServiceAreas,
  geocodeServiceAreaSearch,
  updateServiceArea,
  type ServiceAreaItem
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

type AccessState = "unknown" | "anonymous" | "forbidden" | "allowed";
type DraftPoint = { lng: number; lat: number };

const copy = {
  title: "Райони на действие",
  subtitle:
    "Admin задава границите на района чрез кликове върху картата. Само сигнали в активните райони ще се приемат.",
  loginRequired: "Нужен е вход.",
  adminRequired: "Само admin може да управлява районите на действие.",
  goToLogin: "Към вход",
  home: "Начало",
  users: "Потребители",
  newArea: "Нов район",
  editArea: "Редакция на район",
  areas: "Райони",
  noAreas: "Още няма създадени райони.",
  active: "Активен",
  inactive: "Неактивен",
  name: "Име на района",
  map: "Карта",
  hint: "Клик върху картата добавя точка. За полигон трябват поне 3 точки.",
  points: "Точки",
  noPoints: "Още няма точки.",
  removePoint: "Махни",
  undo: "Назад",
  clear: "Изчисти",
  searchAddress: "Търсене на адрес",
  searchAddressPlaceholder: "Адрес, населено място или Google Maps линк",
  searchAddressAction: "Намери на картата",
  searching: "Търсене...",
  importExport: "Импорт / експорт на GeoJSON",
  geojsonLabel: "GeoJSON",
  importGeoJson: "Импортирай GeoJSON",
  exportGeoJson: "Експорт на GeoJSON",
  chooseFile: "Файл GeoJSON",
  saveNew: "Създай район",
  saveExisting: "Запази промените",
  deleteArea: "Изтрий район",
  saving: "Запазване...",
  deleting: "Изтриване...",
  point: "Точка",
  created: "Създаден",
  updated: "Обновен",
  cannotEditMulti:
    "Този район не е прост полигон. Можеш да го прегледаш, но редакцията през този UI е ограничена.",
  loadFailed: "Грешка при зареждане на районите.",
  saveFailed: "Грешка при запис на района.",
  confirmDelete: "Сигурен ли си, че искаш да изтриеш този район?",
  requiredName: "Името е задължително.",
  requiredPoints: "Нужни са поне 3 точки за полигон.",
  addressLookupFailed: "Не успях да намеря адреса на картата.",
  invalidGeoJson: "GeoJSON трябва да съдържа Polygon или MultiPolygon.",
  exportUnavailable: "Няма GeoJSON за експорт.",
  loading: "Зареждане..."
} as const;

function extractDraftPointsFromGeoJson(geojson: unknown): DraftPoint[] {
  if (!geojson || typeof geojson !== "object") {
    return [];
  }

  const type = (geojson as { type?: unknown }).type;
  const coordinates = (geojson as { coordinates?: unknown }).coordinates;

  if (type === "Polygon" && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    const ring = coordinates[0] as unknown[];
    return ring
      .slice(0, Math.max(0, ring.length - 1))
      .filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number"
      )
      .map(([lng, lat]) => ({ lng, lat }));
  }

  if (
    type === "MultiPolygon" &&
    Array.isArray(coordinates) &&
    Array.isArray(coordinates[0]) &&
    Array.isArray(coordinates[0][0])
  ) {
    const ring = coordinates[0][0] as unknown[];
    return ring
      .slice(0, Math.max(0, ring.length - 1))
      .filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number"
      )
      .map(([lng, lat]) => ({ lng, lat }));
  }

  return [];
}

function toPolygonGeoJson(points: DraftPoint[]) {
  return {
    type: "Polygon",
    coordinates: [
      [...points.map((point) => [point.lng, point.lat]), [points[0].lng, points[0].lat]]
    ]
  };
}

function formatGeoJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function getEditableGeoJson(points: DraftPoint[], selectedArea: ServiceAreaItem | null) {
  if (points.length >= 3) {
    return toPolygonGeoJson(points);
  }

  return selectedArea?.geojson ?? null;
}

export default function AdminServiceAreasPage() {
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [areas, setAreas] = useState<ServiceAreaItem[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [draftPoints, setDraftPoints] = useState<DraftPoint[]>([]);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCenter, setSearchCenter] = useState<DraftPoint | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const selectedArea = useMemo(
    () => areas.find((item) => item.id === selectedAreaId) ?? null,
    [areas, selectedAreaId]
  );

  async function loadAreas(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    try {
      const nextAreas = await fetchServiceAreas();
      setAreas(nextAreas);
      setSelectedAreaId((current) =>
        current && nextAreas.some((item) => item.id === current)
          ? current
          : (nextAreas[0]?.id ?? "")
      );
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(error instanceof Error ? error.message : copy.loadFailed);
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
        if (me.role !== "admin") {
          setAccessState("forbidden");
          setIsLoading(false);
          return;
        }

        setAccessState("allowed");
        await loadAreas();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : copy.loadFailed);
        setIsLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedArea) {
      setName("");
      setIsActive(true);
      setDraftPoints([]);
      setGeoJsonText("");
      return;
    }

    setName(selectedArea.name);
    setIsActive(selectedArea.isActive);
    const nextDraftPoints = extractDraftPointsFromGeoJson(selectedArea.geojson);
    setDraftPoints(nextDraftPoints);
    setGeoJsonText(formatGeoJson(selectedArea.geojson));
  }, [selectedArea]);

  function onNewArea() {
    setSelectedAreaId("");
    setName("");
    setIsActive(true);
    setDraftPoints([]);
    setGeoJsonText("");
    setSearchCenter(null);
    setErrorMessage("");
  }

  async function onSearchAddress() {
    if (!searchQuery.trim()) {
      return;
    }

    setIsSearching(true);
    setErrorMessage("");

    try {
      const result = await geocodeServiceAreaSearch(searchQuery.trim());
      setSearchCenter({
        lat: result.latitude,
        lng: result.longitude
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : copy.addressLookupFailed
      );
    } finally {
      setIsSearching(false);
    }
  }

  function onImportGeoJson(rawText: string) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      const points = extractDraftPointsFromGeoJson(parsed);
      if (points.length < 3) {
        setErrorMessage(copy.invalidGeoJson);
        return;
      }

      setDraftPoints(points);
      setGeoJsonText(formatGeoJson(parsed));
      setSearchCenter(points[0] ?? null);
      setErrorMessage("");
    } catch {
      setErrorMessage(copy.invalidGeoJson);
    }
  }

  async function onGeoJsonFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await file.text();
    onImportGeoJson(content);
    event.target.value = "";
  }

  function onExportGeoJson() {
    const geojson = getEditableGeoJson(draftPoints, selectedArea);
    if (!geojson) {
      setErrorMessage(copy.exportUnavailable);
      return;
    }

    const blob = new Blob([formatGeoJson(geojson)], {
      type: "application/geo+json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(name.trim() || "service-area").replace(/\s+/g, "-").toLowerCase()}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onSave() {
    if (!name.trim()) {
      setErrorMessage(copy.requiredName);
      return;
    }

    if (draftPoints.length < 3) {
      setErrorMessage(copy.requiredPoints);
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const payload = {
        name: name.trim(),
        isActive,
        geojson: toPolygonGeoJson(draftPoints)
      };

      const saved = selectedAreaId
        ? await updateServiceArea(selectedAreaId, payload)
        : await createServiceArea(payload);

      await loadAreas({ silent: true });
      setSelectedAreaId(saved.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedAreaId) {
      return;
    }

    if (!window.confirm(copy.confirmDelete)) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage("");

    try {
      await deleteServiceArea(selectedAreaId);
      setSelectedAreaId("");
      setName("");
      setIsActive(true);
      setDraftPoints([]);
      await loadAreas({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setIsDeleting(false);
    }
  }

  if (accessState === "unknown" || (accessState === "allowed" && isLoading)) {
    return <main style={styles.centered}>{copy.loading}</main>;
  }

  if (accessState === "anonymous") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{copy.title}</h1>
        <p style={styles.muted}>{copy.loginRequired}</p>
        <Link href="/auth/login" style={styles.primaryLink}>
          {copy.goToLogin}
        </Link>
      </main>
    );
  }

  if (accessState === "forbidden") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{copy.title}</h1>
        <p style={styles.muted}>{copy.adminRequired}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{copy.title}</h1>
          <p style={styles.muted}>{copy.subtitle}</p>
        </div>
        <div style={styles.headerActions}>
          <Link href="/admin/users" style={styles.secondaryLink}>
            {copy.users}
          </Link>
          <Link href="/" style={styles.secondaryLink}>
            {copy.home}
          </Link>
        </div>
      </header>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      <section style={styles.layout}>
        <aside style={styles.sidebar}>
          <div style={styles.panelHeader}>
            <strong>{copy.areas}</strong>
            <button type="button" onClick={onNewArea} style={styles.smallButton}>
              {copy.newArea}
            </button>
          </div>

          {areas.length === 0 ? (
            <div style={styles.emptyState}>{copy.noAreas}</div>
          ) : (
            <div style={styles.areaList}>
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreaId(area.id)}
                  style={{
                    ...styles.areaCard,
                    ...(selectedAreaId === area.id ? styles.areaCardSelected : null)
                  }}
                >
                  <div style={styles.areaCardTop}>
                    <strong style={styles.areaName}>{area.name}</strong>
                    <span style={area.isActive ? styles.activePill : styles.inactivePill}>
                      {area.isActive ? copy.active : copy.inactive}
                    </span>
                  </div>
                  <div style={styles.metaText}>
                    {copy.updated}: {new Date(area.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div style={styles.mainPanel}>
          <div style={styles.editorGrid}>
            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>{selectedArea ? copy.editArea : copy.newArea}</strong>
              </div>

              <label style={styles.field}>
                <span style={styles.label}>{copy.name}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                <span>{copy.active}</span>
              </label>

              <div style={styles.field}>
                <span style={styles.label}>{copy.map}</span>
                <div style={styles.hint}>{copy.hint}</div>
              </div>

              <label style={styles.field}>
                <span style={styles.label}>{copy.searchAddress}</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={copy.searchAddressPlaceholder}
                  style={styles.input}
                />
              </label>
              <button
                type="button"
                onClick={() => void onSearchAddress()}
                disabled={!searchQuery.trim() || isSearching || isSaving || isDeleting}
                style={{
                  ...styles.secondaryButton,
                  ...styles.fullWidthButton,
                  ...((!searchQuery.trim() || isSearching || isSaving || isDeleting)
                    ? styles.buttonDisabled
                    : null)
                }}
              >
                {isSearching ? copy.searching : copy.searchAddressAction}
              </button>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  onClick={() =>
                    setDraftPoints((current) => current.slice(0, Math.max(0, current.length - 1)))
                  }
                  disabled={draftPoints.length === 0 || isSaving || isDeleting}
                  style={{
                    ...styles.secondaryButton,
                    ...(draftPoints.length === 0 || isSaving || isDeleting
                      ? styles.buttonDisabled
                      : null)
                  }}
                >
                  {copy.undo}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPoints([])}
                  disabled={draftPoints.length === 0 || isSaving || isDeleting}
                  style={{
                    ...styles.secondaryButton,
                    ...(draftPoints.length === 0 || isSaving || isDeleting
                      ? styles.buttonDisabled
                      : null)
                  }}
                >
                  {copy.clear}
                </button>
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={isSaving || isDeleting}
                  style={{
                    ...styles.primaryButton,
                    ...(isSaving || isDeleting ? styles.buttonDisabled : null)
                  }}
                >
                  {isSaving
                    ? copy.saving
                    : selectedAreaId
                      ? copy.saveExisting
                      : copy.saveNew}
                </button>
                {selectedAreaId ? (
                  <button
                    type="button"
                    onClick={() => void onDelete()}
                    disabled={isSaving || isDeleting}
                    style={{
                      ...styles.deleteButton,
                      ...(isSaving || isDeleting ? styles.buttonDisabled : null)
                    }}
                  >
                    {isDeleting ? copy.deleting : copy.deleteArea}
                  </button>
                ) : null}
              </div>

              {selectedArea &&
              selectedArea.geojson &&
              !String((selectedArea.geojson as { type?: string }).type || "").includes("Polygon") ? (
                <div style={styles.warningBox}>{copy.cannotEditMulti}</div>
              ) : null}

              <div style={styles.metaStack}>
                {selectedArea ? (
                  <>
                    <div style={styles.metaText}>
                      {copy.created}: {new Date(selectedArea.createdAt).toLocaleString()}
                    </div>
                    <div style={styles.metaText}>
                      {copy.updated}: {new Date(selectedArea.updatedAt).toLocaleString()}
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <strong>{copy.map}</strong>
              </div>
              <MapEditor
                draftPoints={draftPoints}
                selectedGeoJson={selectedArea?.geojson ?? null}
                focusPoint={searchCenter}
                onAddPoint={(point) => setDraftPoints((current) => [...current, point])}
              />
            </section>
          </div>

          <section style={{ ...styles.panel, marginTop: 16 }}>
            <div style={styles.panelHeader}>
              <strong>{copy.importExport}</strong>
            </div>

            <label style={styles.field}>
              <span style={styles.label}>{copy.geojsonLabel}</span>
              <textarea
                value={geoJsonText}
                onChange={(event) => setGeoJsonText(event.target.value)}
                style={styles.textarea}
              />
            </label>

            <div style={styles.buttonRow}>
              <button
                type="button"
                onClick={() => onImportGeoJson(geoJsonText)}
                style={styles.secondaryButton}
              >
                {copy.importGeoJson}
              </button>
              <button
                type="button"
                onClick={onExportGeoJson}
                style={styles.secondaryButton}
              >
                {copy.exportGeoJson}
              </button>
              <label style={styles.fileButton}>
                {copy.chooseFile}
                <input
                  type="file"
                  accept=".json,.geojson,application/json,application/geo+json"
                  onChange={(event) => void onGeoJsonFileSelected(event)}
                  style={styles.hiddenInput}
                />
              </label>
            </div>
          </section>

          <section style={{ ...styles.panel, marginTop: 16 }}>
            <div style={styles.panelHeader}>
              <strong>{copy.points}</strong>
              <span style={styles.countPill}>{draftPoints.length}</span>
            </div>

            {draftPoints.length === 0 ? (
              <div style={styles.emptyState}>{copy.noPoints}</div>
            ) : (
              <div style={styles.pointsList}>
                {draftPoints.map((point, index) => (
                  <div key={`${point.lng}-${point.lat}-${index}`} style={styles.pointCard}>
                    <div>
                      <div style={styles.pointTitle}>
                        {copy.point} {index + 1}
                      </div>
                      <div style={styles.pointMeta}>
                        {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftPoints((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                      style={styles.removeButton}
                    >
                      {copy.removePoint}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function MapEditor({
  draftPoints,
  selectedGeoJson,
  focusPoint,
  onAddPoint
}: {
  draftPoints: DraftPoint[];
  selectedGeoJson: unknown;
  focusPoint: DraftPoint | null;
  onAddPoint: (point: DraftPoint) => void;
}) {
  const srcDoc = useMemo(
    () => buildMapHtml(draftPoints, selectedGeoJson, focusPoint),
    [draftPoints, selectedGeoJson, focusPoint]
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          lat?: number;
          lng?: number;
        };

        if (
          payload.type === "mapClick" &&
          typeof payload.lat === "number" &&
          typeof payload.lng === "number"
        ) {
          onAddPoint({ lat: payload.lat, lng: payload.lng });
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAddPoint]);

  return (
    <iframe
      title="service-area-editor"
      srcDoc={srcDoc}
      style={styles.iframe}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

function buildMapHtml(
  draftPoints: DraftPoint[],
  selectedGeoJson: unknown,
  focusPoint: DraftPoint | null
) {
  const payload = JSON.stringify({
    defaultCenter: { lat: 42.6977, lng: 23.3219 },
    selectedGeoJson,
    draftPoints,
    focusPoint
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
        scrollWheelZoom: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      const layers = [];

      function addPolygonFromGeoJson(geojson, color) {
        if (!geojson || !geojson.type || !geojson.coordinates) {
          return;
        }

        const layer = L.geoJSON(geojson, {
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12
          }
        }).addTo(map);
        layers.push(layer);
      }

      addPolygonFromGeoJson(payload.selectedGeoJson, "#0b6bcb");

      if (payload.focusPoint && typeof payload.focusPoint.lat === "number" && typeof payload.focusPoint.lng === "number") {
        const marker = L.circleMarker([payload.focusPoint.lat, payload.focusPoint.lng], {
          radius: 8,
          color: "#0f172a",
          fillColor: "#0b6bcb",
          fillOpacity: 0.95,
          weight: 2
        }).addTo(map);
        marker.bindTooltip("Търсен адрес", { permanent: false });
        layers.push(marker);
      }

      if (Array.isArray(payload.draftPoints) && payload.draftPoints.length > 0) {
        const latLngs = payload.draftPoints.map((point) => [point.lat, point.lng]);
        const polyline = L.polyline(latLngs, {
          color: "#f97316",
          weight: 3
        }).addTo(map);
        layers.push(polyline);

        latLngs.forEach((point, index) => {
          const marker = L.circleMarker(point, {
            radius: 6,
            color: "#ea580c",
            fillColor: "#fb923c",
            fillOpacity: 0.95,
            weight: 2
          }).addTo(map);
          marker.bindTooltip(String(index + 1), { permanent: true, direction: "top", offset: [0, -10] });
          layers.push(marker);
        });

        if (latLngs.length >= 3) {
          const polygon = L.polygon(latLngs, {
            color: "#f97316",
            weight: 2,
            fillColor: "#fb923c",
            fillOpacity: 0.18
          }).addTo(map);
          layers.push(polygon);
        }
      }

      if (payload.focusPoint && typeof payload.focusPoint.lat === "number" && typeof payload.focusPoint.lng === "number") {
        map.setView([payload.focusPoint.lat, payload.focusPoint.lng], 13);
      } else if (layers.length > 0) {
        const group = L.featureGroup(layers);
        map.fitBounds(group.getBounds().pad(0.15));
      } else {
        map.setView([payload.defaultCenter.lat, payload.defaultCenter.lng], 11);
      }

      map.on("click", (event) => {
        window.parent.postMessage(
          JSON.stringify({
            type: "mapClick",
            lat: event.latlng.lat,
            lng: event.latlng.lng
          }),
          "*"
        );
      });
    </script>
  </body>
</html>`;
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
    margin: "8px 0 0",
    maxWidth: 760,
    lineHeight: 1.5
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr)",
    gap: 16
  },
  sidebar: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid #d7dbe0",
    borderRadius: 24,
    padding: 16,
    backdropFilter: "blur(10px)",
    height: "fit-content"
  },
  mainPanel: {
    minWidth: 0
  },
  editorGrid: {
    display: "grid",
    gridTemplateColumns: "380px minmax(0, 1fr)",
    gap: 16
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
  smallButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #d7dbe0",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 700
  },
  areaList: {
    display: "grid",
    gap: 10
  },
  areaCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    background: "#ffffff",
    borderRadius: 16,
    padding: 12,
    textAlign: "left",
    cursor: "pointer"
  },
  areaCardSelected: {
    borderColor: "#0b6bcb",
    boxShadow: "0 0 0 2px rgba(11, 107, 203, 0.12)"
  },
  areaCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  },
  areaName: {
    color: "#0f172a"
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
  field: {
    display: "grid",
    gap: 6,
    marginBottom: 12
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff"
  },
  textarea: {
    width: "100%",
    minHeight: 180,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    resize: "vertical",
    fontFamily: "Consolas, Monaco, monospace",
    fontSize: 12,
    lineHeight: 1.5
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    color: "#0f172a",
    fontWeight: 700
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.45
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 16
  },
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: 0,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer"
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer"
  },
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #fecaca",
    backgroundColor: "#ffffff",
    color: "#b91c1c",
    fontWeight: 700,
    cursor: "pointer"
  },
  fileButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer"
  },
  hiddenInput: {
    display: "none"
  },
  fullWidthButton: {
    width: "100%",
    justifyContent: "center"
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  warningBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fdba74",
    fontSize: 13,
    lineHeight: 1.45
  },
  metaStack: {
    display: "grid",
    gap: 6,
    marginTop: 14
  },
  metaText: {
    color: "#64748b",
    fontSize: 13
  },
  iframe: {
    width: "100%",
    height: 520,
    border: "1px solid #d7dbe0",
    borderRadius: 16,
    display: "block"
  },
  emptyState: {
    color: "#64748b",
    lineHeight: 1.5
  },
  pointsList: {
    display: "grid",
    gap: 10
  },
  pointCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: "1px solid #d7dbe0",
    background: "#ffffff",
    borderRadius: 14,
    padding: 12
  },
  pointTitle: {
    color: "#0f172a",
    fontWeight: 700,
    marginBottom: 4
  },
  pointMeta: {
    color: "#64748b",
    fontSize: 13
  },
  removeButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#ffffff",
    color: "#b91c1c",
    fontWeight: 700,
    cursor: "pointer"
  },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  primaryLink: {
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
  countPill: {
    minWidth: 28,
    padding: "4px 10px",
    borderRadius: 999,
    backgroundColor: "#0b6bcb",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center"
  }
};
