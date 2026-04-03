"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createReportComment,
  fetchReportCleanupParticipants,
  fetchMe,
  fetchReport,
  fetchReportComments,
  fetchReportHistory,
  fetchReports,
  moderateReportComment,
  moderateReportMedia,
  removeReportCleanupParticipant,
  updateReportCleanupEvent,
  updateReportStatus,
  type CleanupEvent,
  type CleanupParticipantItem,
  type ReportCommentItem,
  type ReportStatusHistoryItem,
  type ReportSummary
} from "../../lib/api";
import { useWebI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

type StatusFilter = "all" | ReportSummary["status"];

function statusColors(status: ReportSummary["status"]) {
  switch (status) {
    case "resolved":
      return { background: "#dcfce7", text: "#166534" };
    case "in_review":
      return { background: "#dbeafe", text: "#1d4ed8" };
    case "planned_cleanup":
      return { background: "#ede9fe", text: "#6d28d9" };
    case "rejected":
      return { background: "#fee2e2", text: "#b91c1c" };
    case "new":
    default:
      return { background: "#ffedd5", text: "#c2410c" };
  }
}

function getMapEmbedUrl(report: ReportSummary) {
  const { latitude, longitude } = report.location;
  const delta = 0.01;
  const left = longitude - delta;
  const right = longitude + delta;
  const top = latitude + delta;
  const bottom = latitude - delta;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

function toDateTimeLocalValue(isoString?: string | null) {
  if (!isoString) {
    return "";
  }

  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseCoordinatesFromText(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const coordinateToken = "[+-]?\\d+(?:\\.\\d+)?";
  const patterns = [
    new RegExp(`@(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`q=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`ll=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`!3d(${coordinateToken})!4d(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s*,\\s*(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s+(${coordinateToken})`)
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);

    if (
      areValidCoordinates(latitude, longitude)
    ) {
      return { latitude, longitude };
    }
  }

  return null;
}

function areValidCoordinates(latitude: number, longitude: number) {
  return (
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function resolveLocationInput(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return {
      address: ""
    };
  }

  const expanded = await expandMapsShortUrl(normalized);
  const normalizedExpanded = decodeRepeatedly(expanded);

  const parsedCoordinates = parseCoordinatesFromText(normalizedExpanded);
  if (parsedCoordinates) {
    return {
      address: `${parsedCoordinates.latitude}, ${parsedCoordinates.longitude}`,
      coordinates: parsedCoordinates
    };
  }

  try {
    const url = new URL(normalizedExpanded);
    const candidate =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("daddr");

    if (candidate) {
      const decodedCandidate = decodeURIComponent(candidate).replace(/\+/g, " ").trim();
      const candidateCoordinates = parseCoordinatesFromText(decodedCandidate);
      if (candidateCoordinates) {
        return {
          address: `${candidateCoordinates.latitude}, ${candidateCoordinates.longitude}`,
          coordinates: candidateCoordinates
        };
      }

      return {
        address: decodedCandidate
      };
    }
  } catch {
    // Not a URL, keep the raw text.
  }

  const fallbackCoordinates = extractCoordinatesFromGoogleContent(normalizedExpanded);
  if (fallbackCoordinates) {
    return {
      address: `${fallbackCoordinates.latitude}, ${fallbackCoordinates.longitude}`,
      coordinates: fallbackCoordinates
    };
  }

  return {
    address: normalizedExpanded
  };
}

async function expandMapsShortUrl(text: string) {
  if (!/https?:\/\/maps\.app\.goo\.gl\//i.test(text.trim())) {
    return text;
  }

  try {
    const response = await fetch(text, {
      method: "GET",
      redirect: "follow"
    });

    if (response.url && !/https?:\/\/maps\.app\.goo\.gl\//i.test(response.url)) {
      return response.url;
    }

    const responseText = await response.text();
    const extractedFromHtml = extractGoogleMapsUrlFromHtml(responseText);
    if (extractedFromHtml) {
      return extractedFromHtml;
    }
  } catch {
    // Browser CORS may block this. Fall back to the original text.
  }

  return text;
}

function decodeGoogleHtmlValue(value: string) {
  return decodeRepeatedly(value.replace(/&amp;/g, "&").trim());
}

function decodeRepeatedly(value: string) {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }

      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function extractGoogleMapsUrlFromHtml(html: string) {
  const candidates = [
    ...html.matchAll(/continue=([^"'\\s>]+)/gi),
    ...html.matchAll(/https:\/\/www\.google\.com\/maps\/(?:search|place)\/[^"'\\s<]+/gi)
  ];

  for (const candidate of candidates) {
    const rawValue = candidate[1] ?? candidate[0];
    const decoded = decodeGoogleHtmlValue(rawValue);
    if (/https:\/\/www\.google\.com\/maps\//i.test(decoded)) {
      return decoded;
    }
  }

  return "";
}

function extractCoordinatesFromGoogleContent(text: string) {
  const matches = [
    ...text.matchAll(/maps\/search\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi),
    ...text.matchAll(/maps\/place\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi)
  ];

  for (const match of matches) {
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

export default function ModerationPage() {
  return (
    <Suspense fallback={<ModerationPageLoading />}>
      <ModerationPageInner />
    </Suspense>
  );
}

function ModerationPageInner() {
  const { language, t } = useWebI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedReportId = searchParams.get("reportId") ?? "";
  const requestedStatus = searchParams.get("status");
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [moderatingCommentId, setModeratingCommentId] = useState("");
  const [moderatingMediaId, setModeratingMediaId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
  const [historyItems, setHistoryItems] = useState<ReportStatusHistoryItem[]>([]);
  const [comments, setComments] = useState<ReportCommentItem[]>([]);
  const [cleanupParticipants, setCleanupParticipants] = useState<CleanupParticipantItem[]>([]);
  const [nextStatus, setNextStatus] = useState<ReportSummary["status"]>("in_review");
  const [cleanupScheduledAt, setCleanupScheduledAt] = useState("");
  const [cleanupMeetingAddress, setCleanupMeetingAddress] = useState("");
  const [cleanupMeetingLatitude, setCleanupMeetingLatitude] = useState("");
  const [cleanupMeetingLongitude, setCleanupMeetingLongitude] = useState("");
  const [cleanupInstructionsText, setCleanupInstructionsText] = useState("");
  const [cleanupToolsNote, setCleanupToolsNote] = useState("");
  const [isCleanupFormDirty, setIsCleanupFormDirty] = useState(false);
  const cleanupFormDirtyRef = useRef(false);
  const [note, setNote] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"public" | "internal">(
    "internal"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isMapInteractive, setIsMapInteractive] = useState(false);
  const [isSavingCleanupEvent, setIsSavingCleanupEvent] = useState(false);
  const [removingParticipantUserId, setRemovingParticipantUserId] = useState("");
  const [accessState, setAccessState] = useState<
    "unknown" | "anonymous" | "forbidden" | "allowed"
  >("unknown");
  const [currentRole, setCurrentRole] = useState<"citizen" | "moderator" | "admin" | null>(
    null
  );
  const pendingReportIdRef = useRef(requestedReportId);
  const selectedReportIdRef = useRef("");
  const loadReportsRequestIdRef = useRef(0);

  const statusLabels: Record<ReportSummary["status"], string> = useMemo(
    () => ({
      new: t.moderation.new,
      in_review: t.moderation.inReview,
      planned_cleanup: t.moderation.plannedCleanup,
      resolved: t.moderation.resolved,
      rejected: t.moderation.rejected
    }),
    [t]
  );

  const statusOptions: Array<{ value: StatusFilter; label: string }> = useMemo(
    () => [
      { value: "all", label: t.moderation.all },
      { value: "new", label: t.moderation.new },
      { value: "in_review", label: t.moderation.inReview },
      { value: "planned_cleanup", label: t.moderation.plannedCleanup },
      { value: "resolved", label: t.moderation.resolved },
      { value: "rejected", label: t.moderation.rejected }
    ],
    [t]
  );

  function formatActorName(displayName?: string | null, userId?: string | null) {
    if (displayName) {
      return displayName;
    }

    if (userId) {
      return `User ${userId.slice(0, 8)}`;
    }

    return t.moderation.unknownUser;
  }

  function applyCleanupEventToForm(cleanupEvent?: CleanupEvent | null) {
    setCleanupScheduledAt(toDateTimeLocalValue(cleanupEvent?.scheduledAt ?? null));
    setCleanupMeetingAddress(cleanupEvent?.meetingAddress ?? "");
    setCleanupMeetingLatitude(
      cleanupEvent?.meetingLocation?.latitude !== undefined &&
      cleanupEvent?.meetingLocation?.latitude !== null
        ? String(cleanupEvent.meetingLocation.latitude)
        : ""
    );
    setCleanupMeetingLongitude(
      cleanupEvent?.meetingLocation?.longitude !== undefined &&
      cleanupEvent?.meetingLocation?.longitude !== null
        ? String(cleanupEvent.meetingLocation.longitude)
        : ""
    );
    setCleanupInstructionsText(cleanupEvent?.instructionsText ?? "");
    setCleanupToolsNote(cleanupEvent?.toolsNote ?? "");
    setIsCleanupFormDirty(false);
  }

  useEffect(() => {
    cleanupFormDirtyRef.current = isCleanupFormDirty;
  }, [isCleanupFormDirty]);

  useEffect(() => {
    pendingReportIdRef.current = requestedReportId;
  }, [requestedReportId]);

  useEffect(() => {
    selectedReportIdRef.current = selectedReportId;
  }, [selectedReportId]);

  useEffect(() => {
    if (!requestedReportId || selectedReportId !== requestedReportId) {
      return;
    }

    pendingReportIdRef.current = "";
    const params = new URLSearchParams(searchParams.toString());
    params.delete("reportId");
    const nextUrl = params.toString() ? `/moderation?${params.toString()}` : "/moderation";
    router.replace(nextUrl, { scroll: false });
  }, [requestedReportId, router, searchParams, selectedReportId]);

  useEffect(() => {
    if (
      requestedStatus === "all" ||
      requestedStatus === "new" ||
      requestedStatus === "in_review" ||
      requestedStatus === "planned_cleanup" ||
      requestedStatus === "resolved" ||
      requestedStatus === "rejected"
    ) {
      setStatusFilter(requestedStatus);
    }
  }, [requestedStatus]);

  async function loadReports(
    filter: StatusFilter,
    options?: { silent?: boolean }
  ) {
    const requestId = ++loadReportsRequestIdRef.current;

    if (!options?.silent) {
      setIsLoadingReports(true);
      setErrorMessage("");
    }

    try {
      const items = await fetchReports(filter);
      if (requestId !== loadReportsRequestIdRef.current) {
        return;
      }

      setReports(items);

      if (items.length === 0) {
        setSelectedReportId("");
        setSelectedReport(null);
        setHistoryItems([]);
        setComments([]);
        setCleanupParticipants([]);
        return;
      }

      const pendingReportId = pendingReportIdRef.current;
      const targetId =
        pendingReportId && items.some((item) => item.id === pendingReportId)
          ? pendingReportId
          : items.some((item) => item.id === selectedReportIdRef.current)
            ? selectedReportIdRef.current
            : items[0].id;

      setSelectedReportId(targetId);
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load reports.");
      }
    } finally {
      if (!options?.silent) {
        setIsLoadingReports(false);
      }
    }
  }

  async function loadDetailResources(
    reportId: string,
    options?: { silent?: boolean }
  ) {
    if (!options?.silent) {
      setIsLoadingDetails(true);
      setErrorMessage("");
    }

    try {
      const [report, history, nextComments] = await Promise.all([
        fetchReport(reportId),
        fetchReportHistory(reportId),
        fetchReportComments(reportId)
      ]);
      const nextCleanupParticipants =
        report.status === "planned_cleanup"
          ? await fetchReportCleanupParticipants(reportId)
          : [];

      setSelectedReport(report);
      setNextStatus(report.status);
      setHistoryItems(history);
      setComments(nextComments);
      setCleanupParticipants(nextCleanupParticipants);
      if (!options?.silent || !cleanupFormDirtyRef.current) {
        applyCleanupEventToForm(report.cleanupEvent ?? null);
      }
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load report details."
        );
      }
    } finally {
      if (!options?.silent) {
        setIsLoadingDetails(false);
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
        setIsBooting(false);
        return;
      }

      try {
        const me = await fetchMe();
        if (me.role !== "moderator" && me.role !== "admin") {
          setAccessState("forbidden");
          setIsBooting(false);
          return;
        }

        setCurrentRole(me.role);
        setAccessState("allowed");
        await loadReports("all");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to bootstrap moderation."
        );
      } finally {
        setIsBooting(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (accessState !== "allowed") {
      return;
    }

    void loadReports(statusFilter);
  }, [accessState, statusFilter]);

  useEffect(() => {
    if (!selectedReportId || accessState !== "allowed") {
      setSelectedReport(null);
      setHistoryItems([]);
      setComments([]);
      setCleanupParticipants([]);
      applyCleanupEventToForm(null);
      setIsMapInteractive(false);
      return;
    }

    setIsMapInteractive(false);
    void loadDetailResources(selectedReportId);
  }, [accessState, selectedReportId]);

  useEffect(() => {
    if (accessState !== "allowed") {
      return;
    }

    const refreshSilently = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadReports(statusFilter, { silent: true });
      if (selectedReportId) {
        void loadDetailResources(selectedReportId, { silent: true });
      }
    };

    const interval = window.setInterval(refreshSilently, 15000);
    const onFocus = () => {
      refreshSilently();
    };
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
  }, [accessState, selectedReportId, statusFilter]);

  const selectedStatusColors = useMemo(
    () => (selectedReport ? statusColors(selectedReport.status) : null),
    [selectedReport]
  );
  const activateMapLabel =
    language === "bg" ? "Клик за активиране на картата" : "Click to activate map";
  const publicLabel = language === "bg" ? "Публичен" : "Public";
  const internalLabel = language === "bg" ? "Вътрешен" : "Internal";
  const visibilityLabel = language === "bg" ? "Видимост" : "Visibility";
  const commentsSectionTitle = language === "bg" ? "Коментари" : "Comments";
  const addCommentLabel = language === "bg" ? "Добави коментар" : "Add comment";
  const cleanupSectionTitle =
    language === "bg" ? "Участници в почистването" : "Cleanup participants";
  const cleanupScheduleSectionTitle =
    language === "bg" ? "Насрочване на почистването" : "Schedule cleanup";
  const cleanupNoParticipantsLabel =
    language === "bg" ? "Още няма записани участници." : "No participants yet.";
  const cleanupParticipantsCountLabel =
    language === "bg" ? "Участници" : "Participants";
  const cleanupScheduledSummaryLabel =
    language === "bg" ? "Почистване" : "Cleanup";
  const removeParticipantLabel =
    language === "bg" ? "Премахни" : "Remove";
  const cleanupScheduledAtLabel = language === "bg" ? "Дата и час" : "Date and time";
  const cleanupMeetingAddressLabel = language === "bg" ? "Адрес или линк" : "Address or link";
  const cleanupMeetingLatitudeLabel =
    language === "bg" ? "Ширина (по желание)" : "Latitude (optional)";
  const cleanupMeetingLongitudeLabel =
    language === "bg" ? "Дължина (по желание)" : "Longitude (optional)";
  const cleanupMeetingHint =
    language === "bg"
      ? "Можеш да поставиш адрес, Google Maps линк или координати."
      : "You can paste an address, Google Maps link, or coordinates.";
  const cleanupInstructionsLabel = language === "bg" ? "Указания" : "Instructions";
  const cleanupToolsLabel =
    language === "bg" ? "Инструменти и материали" : "Tools and materials";
  const cleanupSaveLabel =
    language === "bg" ? "Насрочване на почистването" : "Schedule cleanup";
  const cleanupInstructionsPlaceholder =
    language === "bg"
      ? "Опиши как ще протече почистването и какво е важно да знаят участниците."
      : "Describe how the cleanup will run and what participants need to know.";
  const cleanupToolsPlaceholder =
    language === "bg"
      ? "Например: ръкавици, чували, гребла, вода."
      : "For example: gloves, bags, rakes, water.";
  const commentPlaceholder =
    language === "bg"
      ? "Добави коментар към сигнала"
      : "Add a comment for this report";
  const hiddenLabel = language === "bg" ? "Скрит" : "Hidden";
  const hideLabel = language === "bg" ? "Скрий" : "Hide";
  const unhideLabel = language === "bg" ? "Покажи" : "Unhide";
  const mediaHiddenLabel = language === "bg" ? "Скрит файл" : "Hidden file";
  const cleanupEvidenceLabel =
    language === "bg" ? "След почистване" : "After cleanup";
  const originalMediaLabel =
    language === "bg" ? "Първоначален файл" : "Original file";
  const moderatorReason = language === "bg" ? "Скрито от модератор" : "Hidden by moderator";

  async function onStatusUpdate() {
    if (!selectedReport) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const updated = await updateReportStatus(selectedReport.id, {
        status: nextStatus,
        note: note.trim() || undefined
      });

      setSelectedReport(updated);
      setReports((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNote("");
      await loadDetailResources(updated.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function onCreateComment() {
    if (!selectedReport || !commentMessage.trim()) {
      return;
    }

    setIsPostingComment(true);
    setErrorMessage("");

    try {
      await createReportComment(selectedReport.id, {
        message: commentMessage.trim(),
        visibility: commentVisibility
      });
      setCommentMessage("");
      const nextComments = await fetchReportComments(selectedReport.id);
      setComments(nextComments);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create comment."
      );
    } finally {
      setIsPostingComment(false);
    }
  }

  async function onRemoveCleanupParticipant(userId: string) {
    if (!selectedReport) {
      return;
    }

    setRemovingParticipantUserId(userId);
    setErrorMessage("");

    try {
      const items = await removeReportCleanupParticipant(selectedReport.id, userId);
      setCleanupParticipants(items);
      setReports((current) =>
        current.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                cleanupSummary: {
                  participantCount: items.length,
                  scheduledAt: item.cleanupSummary?.scheduledAt ?? item.cleanupEvent?.scheduledAt ?? null
                }
              }
            : item
        )
      );
      setSelectedReport((current) =>
        current
          ? {
              ...current,
              cleanupSummary: {
                participantCount: items.length,
                scheduledAt:
                  current.cleanupSummary?.scheduledAt ?? current.cleanupEvent?.scheduledAt ?? null
              }
            }
          : current
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to remove participant."
      );
    } finally {
      setRemovingParticipantUserId("");
    }
  }

  async function onModerateComment(commentId: string, isHidden: boolean) {
    if (!selectedReport) {
      return;
    }

    setModeratingCommentId(commentId);
    setErrorMessage("");

    try {
      await moderateReportComment(selectedReport.id, commentId, { isHidden });
      const nextComments = await fetchReportComments(selectedReport.id);
      setComments(nextComments);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to moderate comment."
      );
    } finally {
      setModeratingCommentId("");
    }
  }

  async function onModerateMedia(mediaId: string, isHidden: boolean) {
    if (!selectedReport) {
      return;
    }

    setModeratingMediaId(mediaId);
    setErrorMessage("");

    try {
      await moderateReportMedia(selectedReport.id, mediaId, {
        isHidden,
        reason: isHidden ? moderatorReason : undefined
      });
      const refreshed = await fetchReport(selectedReport.id);
      setSelectedReport(refreshed);
      setReports((current) =>
        current.map((item) => (item.id === refreshed.id ? refreshed : item))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to moderate media."
      );
    } finally {
      setModeratingMediaId("");
    }
  }

  async function onSaveCleanupEvent() {
    if (!selectedReport) {
      return;
    }

    setIsSavingCleanupEvent(true);
    setErrorMessage("");

    try {
      const scheduledAtDate = cleanupScheduledAt ? new Date(cleanupScheduledAt) : null;

      if (!scheduledAtDate || Number.isNaN(scheduledAtDate.getTime())) {
        throw new Error(
          language === "bg"
            ? "Въведи валидна дата и час за почистването."
            : "Enter a valid cleanup date and time."
        );
      }

      const resolvedMeetingInput =
        cleanupMeetingAddress.trim().length > 0
          ? await resolveLocationInput(cleanupMeetingAddress)
          : { address: "", coordinates: null };

      const latitude =
        cleanupMeetingLatitude.trim().length > 0
          ? Number(cleanupMeetingLatitude.trim())
          : resolvedMeetingInput.coordinates?.latitude ?? null;
      const longitude =
        cleanupMeetingLongitude.trim().length > 0
          ? Number(cleanupMeetingLongitude.trim())
          : resolvedMeetingInput.coordinates?.longitude ?? null;

      if (
        (latitude !== null && Number.isNaN(latitude)) ||
        (longitude !== null && Number.isNaN(longitude))
      ) {
        throw new Error(
          language === "bg"
            ? "Координатите на срещата трябва да са валидни числа."
            : "Meeting coordinates must be valid numbers."
        );
      }

      const cleanupEvent = await updateReportCleanupEvent(selectedReport.id, {
        scheduledAt: scheduledAtDate.toISOString(),
        meetingAddress:
          resolvedMeetingInput.address.trim() || cleanupMeetingAddress.trim(),
        meetingLatitude: latitude,
        meetingLongitude: longitude,
        instructionsText: cleanupInstructionsText.trim(),
        toolsNote: cleanupToolsNote.trim() || null
      });

      setSelectedReport((current) =>
        current ? { ...current, cleanupEvent } : current
      );
      setReports((current) =>
        current.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                cleanupEvent,
                cleanupSummary: {
                  participantCount: item.cleanupSummary?.participantCount ?? cleanupParticipants.length,
                  scheduledAt: cleanupEvent.scheduledAt
                }
              }
            : item
        )
      );
      applyCleanupEventToForm(cleanupEvent);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to schedule cleanup."
      );
    } finally {
      setIsSavingCleanupEvent(false);
    }
  }

  if (isBooting) {
    return <main style={styles.centered}>{t.common.loading}</main>;
  }

  if (accessState === "anonymous") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{t.moderation.title}</h1>
        <p style={styles.muted}>{t.common.loginRequired}</p>
        <Link href="/auth/login" style={styles.linkButton}>
          {t.moderation.loginCta}
        </Link>
      </main>
    );
  }

  if (accessState === "forbidden") {
    return (
      <main style={styles.centered}>
        <h1 style={styles.title}>{t.moderation.title}</h1>
        <p style={styles.muted}>{t.common.moderatorRequired}</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{t.moderation.title}</h1>
          <p style={styles.muted}>{t.moderation.subtitle}</p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.navTabs}>
            <Link href="/moderation" style={{ ...styles.navTab, ...styles.navTabActive }}>
              {t.moderation.reports}
            </Link>
            <Link href="/moderation/notifications" style={styles.navTab}>
              {t.moderation.notifications}
            </Link>
            <Link href="/moderation/campaigns" style={styles.navTab}>
              {language === "bg" ? "Акции" : "Campaigns"}
            </Link>
            <Link href="/moderation/initiatives" style={styles.navTab}>
              {t.home.initiatives}
            </Link>
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            style={styles.select}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Link href="/" style={styles.secondaryLink}>
            {t.common.home}
          </Link>
        </div>
      </header>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      <section style={styles.layout}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <strong>{t.moderation.reports}</strong>
            <span style={styles.countPill}>{reports.length}</span>
          </div>

          {isLoadingReports ? <p style={styles.muted}>{t.moderation.loadingReports}</p> : null}
          {!isLoadingReports && reports.length === 0 ? (
            <p style={styles.muted}>{t.moderation.noReportsForFilter}</p>
          ) : null}

          <div style={styles.reportList}>
            {reports.map((report) => {
              const palette = statusColors(report.status);
              const isSelected = report.id === selectedReportId;

              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  style={{
                    ...styles.reportItem,
                    ...(isSelected ? styles.reportItemSelected : null)
                  }}
                >
                  <div style={styles.reportItemTop}>
                    <span
                      style={{
                        ...styles.statusPill,
                        backgroundColor: palette.background,
                        color: palette.text
                      }}
                    >
                      {statusLabels[report.status]}
                    </span>
                    <span style={styles.sourcePill}>{report.source}</span>
                  </div>
                  <div style={styles.reportText}>{report.description}</div>
                  <div style={styles.reportMeta}>
                    {t.moderation.reporter}: {report.createdBy?.displayName ?? t.moderation.unknownUser}
                  </div>
                  {report.cleanupSummary?.scheduledAt ? (
                    <div style={styles.reportMeta}>
                      {cleanupScheduledSummaryLabel}:{" "}
                      {new Date(report.cleanupSummary.scheduledAt).toLocaleString()}
                    </div>
                  ) : null}
                  {(report.cleanupSummary?.participantCount ?? 0) > 0 ? (
                    <div style={styles.reportMeta}>
                      {cleanupParticipantsCountLabel}: {report.cleanupSummary?.participantCount ?? 0}
                    </div>
                  ) : null}
                  <div style={styles.reportMeta}>
                    {new Date(report.createdAt).toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section style={styles.detailPane}>
          {!selectedReport ? (
            <div style={styles.emptyDetail}>{t.moderation.selectReport}</div>
          ) : isLoadingDetails ? (
            <div style={styles.emptyDetail}>{t.moderation.loadingDetails}</div>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div style={styles.detailHeaderTop}>
                  <span
                    style={{
                      ...styles.statusPill,
                      backgroundColor: selectedStatusColors?.background,
                      color: selectedStatusColors?.text
                    }}
                  >
                    {statusLabels[selectedReport.status]}
                  </span>
                  <span style={styles.sourcePill}>{selectedReport.source}</span>
                </div>
                <p style={styles.detailDescription}>{selectedReport.description}</p>
              </div>

              <div style={styles.infoGrid}>
                <div style={styles.infoCard}>
                  <div style={styles.infoLabel}>{t.moderation.reporter}</div>
                  <div style={styles.infoValue}>
                    {selectedReport.createdBy?.displayName ?? t.moderation.unknownUser}
                  </div>
                </div>
                <div style={styles.infoCard}>
                  <div style={styles.infoLabel}>{t.moderation.coordinates}</div>
                  <div style={styles.infoValue}>
                    {selectedReport.location.latitude.toFixed(6)}, {" "}
                    {selectedReport.location.longitude.toFixed(6)}
                  </div>
                </div>
                <div style={styles.infoCard}>
                  <div style={styles.infoLabel}>{t.moderation.created}</div>
                  <div style={styles.infoValue}>
                    {new Date(selectedReport.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={styles.mapPanel}>
                <div style={styles.sectionTitle}>{t.moderation.map}</div>
                <div
                  style={styles.mapShell}
                  onMouseLeave={() => setIsMapInteractive(false)}
                >
                  {!isMapInteractive ? (
                    <button
                      type="button"
                      onClick={() => setIsMapInteractive(true)}
                      style={styles.mapOverlay}
                    >
                      {activateMapLabel}
                    </button>
                  ) : null}
                  <iframe
                    title="Report map"
                    src={getMapEmbedUrl(selectedReport)}
                    style={{
                      ...styles.mapFrame,
                      pointerEvents: isMapInteractive ? "auto" : "none"
                    }}
                    loading="lazy"
                  />
                </div>
              </div>

              <div style={styles.mediaPanel}>
                <div style={styles.sectionTitle}>{t.moderation.media}</div>
                {selectedReport.media.length === 0 ? (
                  <p style={styles.muted}>{t.moderation.noMedia}</p>
                ) : (
                  <div style={styles.mediaGrid}>
                    {selectedReport.media.map((item) => (
                      <div key={item.id} style={styles.mediaModerationCard}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.mediaCard}
                        >
                          {item.mediaType === "image" ? (
                            <img
                              src={item.thumbnailUrl ?? item.url}
                              alt="Report media"
                              style={styles.mediaImage}
                            />
                          ) : (
                            <div style={styles.videoCard}>Video</div>
                          )}
                        </a>
                        <div style={styles.mediaModerationMeta}>
                          <div style={styles.mediaPills}>
                            <span
                              style={{
                                ...styles.commentPill,
                                ...(item.mediaContext === "cleanup_evidence"
                                  ? styles.commentPillInternal
                                  : styles.commentPillPublic)
                              }}
                            >
                              {item.mediaContext === "cleanup_evidence"
                                ? cleanupEvidenceLabel
                                : originalMediaLabel}
                            </span>
                            {item.isHidden ? (
                              <span style={{ ...styles.commentPill, ...styles.commentPillHidden }}>
                                {mediaHiddenLabel}
                              </span>
                            ) : null}
                          </div>
                          {(currentRole === "moderator" || currentRole === "admin") ? (
                            <button
                              type="button"
                              onClick={() =>
                                void onModerateMedia(item.id, !(item.isHidden ?? false))
                              }
                              style={styles.commentActionButton}
                              disabled={moderatingMediaId === item.id}
                            >
                              {moderatingMediaId === item.id
                                ? t.moderation.saving
                                : item.isHidden
                                  ? unhideLabel
                                  : hideLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.detailColumns}>
                {selectedReport.status === "planned_cleanup" ? (
                  <div style={styles.panelCard}>
                    <div style={styles.sectionTitle}>{cleanupScheduleSectionTitle}</div>
                    <div style={styles.formRow}>
                      <label style={styles.formLabel}>{cleanupScheduledAtLabel}</label>
                      <input
                        type="datetime-local"
                        value={cleanupScheduledAt}
                        onChange={(event) => {
                          setCleanupScheduledAt(event.target.value);
                          setIsCleanupFormDirty(true);
                        }}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formRow}>
                      <label style={styles.formLabel}>{cleanupMeetingAddressLabel}</label>
                      <input
                        type="text"
                        value={cleanupMeetingAddress}
                        onChange={(event) => {
                          setCleanupMeetingAddress(event.target.value);
                          setIsCleanupFormDirty(true);
                        }}
                        style={styles.input}
                      />
                      <div style={styles.fieldHint}>{cleanupMeetingHint}</div>
                    </div>
                    <div style={styles.inlineFields}>
                      <div style={styles.formRow}>
                        <label style={styles.formLabel}>{cleanupMeetingLatitudeLabel}</label>
                        <input
                          type="text"
                          value={cleanupMeetingLatitude}
                          onChange={(event) => {
                            setCleanupMeetingLatitude(event.target.value);
                            setIsCleanupFormDirty(true);
                          }}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.formRow}>
                        <label style={styles.formLabel}>{cleanupMeetingLongitudeLabel}</label>
                        <input
                          type="text"
                          value={cleanupMeetingLongitude}
                          onChange={(event) => {
                            setCleanupMeetingLongitude(event.target.value);
                            setIsCleanupFormDirty(true);
                          }}
                          style={styles.input}
                        />
                      </div>
                    </div>
                    <label style={styles.formLabel}>{cleanupInstructionsLabel}</label>
                    <textarea
                      value={cleanupInstructionsText}
                      onChange={(event) => {
                        setCleanupInstructionsText(event.target.value);
                        setIsCleanupFormDirty(true);
                      }}
                      placeholder={cleanupInstructionsPlaceholder}
                      style={styles.textarea}
                    />
                    <label style={styles.formLabel}>{cleanupToolsLabel}</label>
                    <textarea
                      value={cleanupToolsNote}
                      onChange={(event) => {
                        setCleanupToolsNote(event.target.value);
                        setIsCleanupFormDirty(true);
                      }}
                      placeholder={cleanupToolsPlaceholder}
                      style={styles.textarea}
                    />
                    <button
                      type="button"
                      onClick={onSaveCleanupEvent}
                      style={styles.primaryButton}
                    >
                      {isSavingCleanupEvent ? t.moderation.saving : cleanupSaveLabel}
                    </button>
                  </div>
                ) : null}

                {selectedReport.status === "planned_cleanup" ? (
                  <div style={styles.panelCard}>
                    <div style={styles.sectionTitle}>{cleanupSectionTitle}</div>
                    <div style={styles.panelScrollArea}>
                      {cleanupParticipants.length === 0 ? (
                        <p style={styles.muted}>{cleanupNoParticipantsLabel}</p>
                      ) : (
                        <div style={styles.cleanupParticipantList}>
                          {cleanupParticipants.map((participant) => (
                            <div key={participant.id} style={styles.cleanupParticipantCard}>
                              <div style={styles.cleanupParticipantName}>
                                {participant.displayName ?? t.moderation.unknownUser}
                              </div>
                              <div style={styles.cleanupParticipantMeta}>
                                {new Date(participant.joinedAt).toLocaleString()}
                              </div>
                              <div style={styles.cleanupParticipantActions}>
                                <button
                                  type="button"
                                  onClick={() => void onRemoveCleanupParticipant(participant.userId)}
                                  style={styles.commentActionButton}
                                  disabled={removingParticipantUserId === participant.userId}
                                >
                                  {removingParticipantUserId === participant.userId
                                    ? t.moderation.saving
                                    : removeParticipantLabel}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {selectedReport.status === "resolved" ? (
                  <div style={styles.panelCard}>
                    <div style={styles.sectionTitle}>{t.moderation.resolutionNote}</div>
                    {selectedReport.resolutionNote?.note ? (
                      <>
                        <div style={styles.timelineNote}>{selectedReport.resolutionNote.note}</div>
                        {selectedReport.resolutionNote.createdAt ? (
                          <div style={styles.timelineMeta}>
                            {new Date(selectedReport.resolutionNote.createdAt).toLocaleString()}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p style={styles.muted}>{t.moderation.noResolutionNote}</p>
                    )}
                  </div>
                ) : null}

                <div style={styles.panelCard}>
                  <div style={styles.sectionTitle}>{t.moderation.statusHistory}</div>
                  <div style={styles.panelScrollArea}>
                    {historyItems.length === 0 ? (
                      <p style={styles.muted}>{t.moderation.noStatusTransitions}</p>
                    ) : (
                      <div style={styles.timeline}>
                        {historyItems.map((item, index) => (
                          <div key={item.id ?? `${item.toStatus}-${index}`} style={styles.timelineItem}>
                            <div style={styles.timelineDot} />
                            <div>
                              <div style={styles.timelineTitle}>
                                {item.fromStatus ? statusLabels[item.fromStatus] : t.moderation.start}{" "}
                                {"->"}{" "}
                                {statusLabels[item.toStatus]}
                              </div>
                              <div style={styles.timelineMeta}>
                                {formatActorName(item.changedByDisplayName, item.changedByUserId)}
                                {item.createdAt ? ` • ${new Date(item.createdAt).toLocaleString()}` : ""}
                              </div>
                              {item.note ? <div style={styles.timelineNote}>{item.note}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={styles.panelCard}>
                  <div style={styles.sectionTitle}>{commentsSectionTitle}</div>
                  <div style={styles.formRow}>
                    <label style={styles.formLabel}>
                      {visibilityLabel}
                    </label>
                    <select
                      value={commentVisibility}
                      onChange={(event) =>
                        setCommentVisibility(
                          event.target.value as "public" | "internal"
                        )
                      }
                      style={styles.select}
                    >
                      <option value="internal">{internalLabel}</option>
                      <option value="public">{publicLabel}</option>
                    </select>
                  </div>
                    <textarea
                      value={commentMessage}
                      onChange={(event) => setCommentMessage(event.target.value)}
                    placeholder={commentPlaceholder}
                    style={styles.textarea}
                  />
                  <button
                    type="button"
                    onClick={onCreateComment}
                    style={styles.secondaryButton}
                  >
                    {isPostingComment ? t.moderation.posting : addCommentLabel}
                  </button>

                  <div style={styles.panelScrollArea}>
                    <div style={styles.commentList}>
                      {comments.length === 0 ? (
                        <p style={styles.muted}>{t.moderation.noComments}</p>
                      ) : (
                        comments.map((item) => (
                          <div key={item.id} style={styles.commentCard}>
                            <div style={styles.commentHeader}>
                              <div style={styles.commentAuthorBlock}>
                                <strong>{formatActorName(item.authorDisplayName, item.authorUserId)}</strong>
                                <div style={styles.commentPills}>
                                  <span
                                    style={{
                                      ...styles.commentPill,
                                      ...(item.visibility === "public"
                                        ? styles.commentPillPublic
                                        : styles.commentPillInternal)
                                    }}
                                  >
                                    {item.visibility === "public" ? publicLabel : internalLabel}
                                  </span>
                                  {item.isHidden ? (
                                    <span style={{ ...styles.commentPill, ...styles.commentPillHidden }}>
                                      {hiddenLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <span style={styles.commentMeta}>
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div style={styles.commentBody}>{item.message}</div>
                            {(currentRole === "moderator" || currentRole === "admin") &&
                            item.visibility === "public" ? (
                              <div style={styles.commentActions}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onModerateComment(item.id, !(item.isHidden ?? false))
                                  }
                                  style={styles.commentActionButton}
                                  disabled={moderatingCommentId === item.id}
                                >
                                  {moderatingCommentId === item.id
                                    ? t.moderation.saving
                                    : item.isHidden
                                      ? unhideLabel
                                      : hideLabel}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div style={styles.moderationPanel}>
                  <div style={styles.sectionTitle}>{t.moderation.moderationPanel}</div>
                  <>
                    <div style={styles.formRow}>
                      <select
                        value={nextStatus}
                        onChange={(event) =>
                          setNextStatus(event.target.value as ReportSummary["status"])
                        }
                        style={styles.select}
                      >
                        {statusOptions
                          .filter((option) => option.value !== "all")
                          .map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t.moderation.moderationNotePlaceholder}
                      style={styles.textarea}
                    />
                    <button type="button" onClick={onStatusUpdate} style={styles.primaryButton}>
                      {isSaving ? t.moderation.saving : t.moderation.updateStatus}
                    </button>
                  </>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function ModerationPageLoading() {
  return (
    <main style={styles.centered}>
      <h1 style={styles.title}>Loading...</h1>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    height: "calc(100vh - 64px)",
    background: "linear-gradient(180deg, #e8f2f5 0%, #f7fafc 100%)",
    padding: "20px 20px 16px",
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column"
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
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  navTabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
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
  muted: {
    color: "#475569",
    margin: "8px 0 0"
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: 18,
    alignItems: "stretch",
    minHeight: 0,
    height: "100%",
    flex: 1
  },
  sidebar: {
    background: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 24,
    padding: 14,
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden"
  },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    color: "#0f172a"
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
  reportList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 4,
    alignItems: "stretch",
    justifyContent: "flex-start"
  },
  reportItem: {
    width: "100%",
    textAlign: "left",
    background: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18,
    padding: 12,
    cursor: "pointer"
  },
  reportItemSelected: {
    borderColor: "#0b6bcb",
    boxShadow: "0 0 0 2px rgba(11,107,203,0.12)"
  },
  reportItemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    alignItems: "center"
  },
  reportText: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 1.45,
    marginBottom: 8
  },
  reportMeta: {
    color: "#64748b",
    fontSize: 12
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700
  },
  sourcePill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    backgroundColor: "#eef2f7",
    color: "#475569"
  },
  detailPane: {
    background: "rgba(255,255,255,0.86)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 24,
    padding: 16,
    backdropFilter: "blur(10px)",
    minHeight: 0,
    overflowY: "auto"
  },
  emptyDetail: {
    minHeight: 320,
    display: "grid",
    placeItems: "center",
    color: "#64748b"
  },
  detailHeader: {
    marginBottom: 16
  },
  detailHeaderTop: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 12
  },
  detailDescription: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.5,
    color: "#0f172a"
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18,
    padding: 14
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 8
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.4
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 10
  },
  mapPanel: {
    marginBottom: 18
  },
  mapShell: {
    position: "relative"
  },
  mapFrame: {
    width: "100%",
    height: 380,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18
  },
  mapOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18,
    background: "rgba(15, 23, 42, 0.16)",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(1px)"
  },
  mediaPanel: {
    marginBottom: 18
  },
  mediaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12
  },
  mediaCard: {
    display: "block",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    backgroundColor: "#e2e8f0",
    textDecoration: "none"
  },
  mediaModerationCard: {
    display: "grid",
    gap: 8
  },
  mediaModerationMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  mediaPills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap"
  },
  mediaImage: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    display: "block"
  },
  videoCard: {
    height: 180,
    display: "grid",
    placeItems: "center",
    background: "#0f172a",
    color: "#f8fafc",
    fontWeight: 700
  },
  detailColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    marginBottom: 8,
    alignItems: "start"
  },
  panelCard: {
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    minHeight: 0
  },
  panelScrollArea: {
    maxHeight: 240,
    overflowY: "auto",
    paddingRight: 4
  },
  cleanupParticipantList: {
    display: "grid",
    gap: 10
  },
  cleanupParticipantCard: {
    borderRadius: 14,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    padding: 12,
    backgroundColor: "#f8fafc"
  },
  cleanupParticipantName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4
  },
  cleanupParticipantMeta: {
    color: "#64748b",
    fontSize: 12
  },
  cleanupParticipantActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 8
  },
  timeline: {
    display: "grid",
    gap: 12
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr)",
    gap: 10,
    alignItems: "start"
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#0b6bcb",
    marginTop: 6
  },
  timelineTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4
  },
  timelineMeta: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 4
  },
  timelineNote: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 1.45
  },
  commentList: {
    display: "grid",
    gap: 10,
    marginTop: 12
  },
  commentCard: {
    borderRadius: 14,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    padding: 12,
    backgroundColor: "#f8fafc"
  },
  commentHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
    color: "#0f172a"
  },
  commentMeta: {
    color: "#64748b",
    fontSize: 12
  },
  commentAuthorBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  commentPills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap"
  },
  commentPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 700
  },
  commentPillPublic: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8"
  },
  commentPillInternal: {
    backgroundColor: "#ede9fe",
    color: "#6d28d9"
  },
  commentPillHidden: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c"
  },
  commentBody: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap"
  },
  commentActions: {
    marginTop: 10,
    display: "flex",
    justifyContent: "flex-end"
  },
  commentActionButton: {
    padding: "8px 12px",
    borderRadius: 10,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer"
  },
  moderationPanel: {
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    borderRadius: 18,
    padding: 14,
    display: "flex",
    flexDirection: "column"
  },
  formRow: {
    marginBottom: 10
  },
  inlineFields: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10
  },
  formLabel: {
    display: "block",
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6
  },
  fieldHint: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 1.4
  },
  input: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 12,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    boxSizing: "border-box"
  },
  select: {
    minWidth: 180,
    padding: "9px 11px",
    borderRadius: 12,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff"
  },
  textarea: {
    width: "100%",
    minHeight: 88,
    padding: 10,
    borderRadius: 14,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    marginBottom: 10,
    resize: "vertical",
    font: "inherit",
    boxSizing: "border-box"
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
    padding: "9px 12px",
    borderRadius: 12,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer"
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7dbe0"
  },
  error: {
    color: "#b91c1c",
    margin: "0 0 12px"
  }
};

