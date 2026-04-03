import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  type AppStateStatus,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { getChatReadState, markReportChatRead, type ChatReadState } from "../../lib/chatReadState";
import { useI18n } from "../../lib/i18n";
import {
  toPendingReportMedia,
  uploadReportMedia
} from "../../lib/reportMediaUpload";
import { supabase } from "../../lib/supabase";
import { OpenStreetMapPreview } from "../../components/OpenStreetMapPreview";
import { ReportChatModal } from "./ReportChatModal";
import {
  appendReportMedia,
  joinCleanup,
  leaveCleanup,
  listCleanupParticipants,
  type CleanupParticipant,
  listReports,
  type ReportMedia,
  type ReportSummary
} from "../../lib/reportsApi";

type Props = {
  refreshKey: number;
  focusReportId?: string | null;
  focusReportNonce?: number;
  onFocusedReportHandled?: () => void;
  onVisibleCountChange?: (count: number) => void;
  onUnreadStateChange?: (count: number) => void;
};

type CurrentLocation = {
  latitude: number;
  longitude: number;
};

type StatusFilter = "all" | ReportSummary["status"];

function getStatusPalette(status: ReportSummary["status"]) {
  switch (status) {
    case "resolved":
      return { backgroundColor: "#dcfce7", textColor: "#166534", markerColor: "#16a34a" };
    case "in_review":
      return { backgroundColor: "#dbeafe", textColor: "#1d4ed8", markerColor: "#2563eb" };
    case "planned_cleanup":
      return { backgroundColor: "#ede9fe", textColor: "#6d28d9", markerColor: "#7c3aed" };
    case "rejected":
      return { backgroundColor: "#fee2e2", textColor: "#b91c1c", markerColor: "#dc2626" };
    case "new":
    default:
      return { backgroundColor: "#ffedd5", textColor: "#c2410c", markerColor: "#ea580c" };
  }
}

function openExternalMap(report: ReportSummary) {
  const { latitude, longitude } = report.location;
  const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  void Linking.openURL(url);
}

function openCleanupMeeting(report: ReportSummary) {
  const cleanupEvent = report.cleanupEvent;
  if (!cleanupEvent) {
    return;
  }

  const meetingLocation = cleanupEvent.meetingLocation;
  const url = meetingLocation
    ? `https://www.openstreetmap.org/?mlat=${meetingLocation.latitude}&mlon=${meetingLocation.longitude}#map=16/${meetingLocation.latitude}/${meetingLocation.longitude}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(cleanupEvent.meetingAddress)}`;

  void Linking.openURL(url);
}

function openMedia(media: ReportMedia) {
  void Linking.openURL(media.url);
}

function splitReportMedia(media: ReportMedia[]) {
  return {
    original: media.filter((item) => (item.mediaContext ?? "report") !== "cleanup_evidence"),
    cleanupEvidence: media.filter(
      (item) => (item.mediaContext ?? "report") === "cleanup_evidence"
    )
  };
}

function MediaPreview({
  media,
  openLabel,
  videoLabel
}: {
  media: ReportMedia[];
  openLabel: string;
  videoLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.mediaRow}
      style={styles.mediaScroll}
    >
      {media.map((item) => (
        <Pressable
          key={item.id}
          style={styles.mediaTile}
          onPress={() => openMedia(item)}
        >
          {item.mediaType === "image" ? (
            <Image source={{ uri: item.url }} style={styles.mediaImage} />
          ) : (
            <View style={styles.videoTile}>
              <Text style={styles.videoTileLabel}>{videoLabel}</Text>
              <Text style={styles.videoTileLink}>{openLabel}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function ReportsScreen({
  refreshKey,
  focusReportId,
  focusReportNonce,
  onFocusedReportHandled,
  onVisibleCountChange,
  onUnreadStateChange
}: Props) {
  const { language, t } = useI18n();
  const scrollRef = useRef<ScrollView | null>(null);
  const reportOffsets = useRef<Record<string, number>>({});
  const unreadPulse = useRef(new Animated.Value(1)).current;
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
  const [chatReport, setChatReport] = useState<ReportSummary | null>(null);
  const [chatReadState, setChatReadState] = useState<ChatReadState>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [cleanupParticipants, setCleanupParticipants] = useState<CleanupParticipant[]>([]);
  const [isLoadingCleanupParticipants, setIsLoadingCleanupParticipants] = useState(false);
  const [isSavingCleanupParticipation, setIsSavingCleanupParticipation] = useState(false);
  const [cleanupErrorMessage, setCleanupErrorMessage] = useState("");
  const [cleanupUploadMessage, setCleanupUploadMessage] = useState("");
  const [isUploadingCleanupMedia, setIsUploadingCleanupMedia] = useState(false);
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [isModalMapInteracting, setIsModalMapInteracting] = useState(false);

  const cleanupTitle =
    language === "bg" ? "\u041f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435" : "Cleanup";
  const cleanupParticipantsLabel =
    language === "bg" ? "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u0446\u0438" : "Participants";
  const cleanupJoinLabel =
    language === "bg" ? "\u0417\u0430\u043f\u0438\u0448\u0438 \u0441\u0435" : "Join";
  const cleanupLeaveLabel =
    language === "bg" ? "\u041e\u0442\u043a\u0430\u0436\u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u0435" : "Leave";
  const cleanupLoadingLabel =
    language === "bg"
      ? "\u0417\u0430\u0440\u0435\u0436\u0434\u0430\u043d\u0435 \u043d\u0430 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u0446\u0438\u0442\u0435..."
      : "Loading participants...";
  const cleanupNoParticipantsLabel =
    language === "bg"
      ? "\u041e\u0449\u0435 \u043d\u044f\u043c\u0430 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u0438 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u0446\u0438."
      : "No participants yet.";
  const cleanupJoinFailedLabel =
    language === "bg"
      ? "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0437\u0430\u043f\u0438\u0441\u0432\u0430\u043d\u0435 \u0437\u0430 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435."
      : "Failed to join cleanup.";
  const cleanupLeaveFailedLabel =
    language === "bg"
      ? "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043e\u0442\u043a\u0430\u0437\u0432\u0430\u043d\u0435 \u043e\u0442 \u0443\u0447\u0430\u0441\u0442\u0438\u0435."
      : "Failed to leave cleanup.";
  const cleanupScheduleTitle =
    language === "bg" ? "\u041d\u0430\u0441\u0440\u043e\u0447\u0435\u043d\u043e \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435" : "Scheduled cleanup";
  const cleanupScheduledAtLabel =
    language === "bg" ? "\u0414\u0430\u0442\u0430 \u0438 \u0447\u0430\u0441" : "Date and time";
  const cleanupMeetingAddressLabel =
    language === "bg" ? "\u041c\u044f\u0441\u0442\u043e \u043d\u0430 \u0441\u0440\u0435\u0449\u0430" : "Meeting place";
  const cleanupInstructionsLabel =
    language === "bg" ? "\u0423\u043a\u0430\u0437\u0430\u043d\u0438\u044f" : "Instructions";
  const cleanupToolsLabel =
    language === "bg" ? "\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u0438 \u0438 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0438" : "Tools and materials";
  const cleanupDetailsLockedLabel =
    language === "bg"
      ? "\u0414\u0435\u0442\u0430\u0439\u043b\u0438\u0442\u0435 \u0437\u0430 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435\u0442\u043e \u0441\u0435 \u0432\u0438\u0436\u0434\u0430\u0442 \u0441\u043b\u0435\u0434 \u0437\u0430\u043f\u0438\u0441\u0432\u0430\u043d\u0435."
      : "Cleanup details are visible after joining.";
  const cleanupOpenMeetingLabel =
    language === "bg" ? "\u041e\u0442\u0432\u043e\u0440\u0438 \u043c\u044f\u0441\u0442\u043e\u0442\u043e" : "Open meeting point";

  const filterOptions = useMemo(
    () => [
      { key: "all" as const, label: t.reports.filterAll },
      { key: "new" as const, label: t.statuses.new },
      { key: "in_review" as const, label: t.statuses.in_review },
      { key: "planned_cleanup" as const, label: t.statuses.planned_cleanup },
      { key: "resolved" as const, label: t.statuses.resolved },
      { key: "rejected" as const, label: t.statuses.rejected }
    ],
    [t]
  );

  const filteredReports = useMemo(() => {
    if (statusFilter === "all") {
      return reports;
    }

    return reports.filter((report) => report.status === statusFilter);
  }, [reports, statusFilter]);

  const unreadThreadCount = useMemo(
    () => reports.filter((report) => hasUnreadComments(report)).length,
    [reports, chatReadState]
  );

  const mapMarkers = useMemo(() => {
    if (filteredReports.length > 0) {
      return filteredReports.map((report) => ({
        id: report.id,
        latitude: report.location.latitude,
        longitude: report.location.longitude,
        label: report.description,
        color: getStatusPalette(report.status).markerColor,
        isSelected: report.id === selectedReport?.id
      }));
    }

    if (reports.length === 0 && currentLocation) {
      return [
        {
          id: "current-location",
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          label: t.reports.currentPosition,
          color: "#0b6bcb"
        }
      ];
    }

    return [];
  }, [currentLocation, filteredReports, reports.length, selectedReport?.id, t.reports.currentPosition]);

  async function loadReports(mode: "initial" | "manual" | "silent" = "initial") {
    if (mode === "manual") {
      setIsRefreshing(true);
    } else if (mode === "initial") {
      setIsLoading(true);
    }

    if (mode !== "silent") {
      setErrorMessage("");
    }

    try {
      const items = await listReports();
      setReports(items);
    } catch (error) {
      if (mode !== "silent") {
        setErrorMessage(
          error instanceof Error ? error.message : t.reports.loadReportsFailed
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function loadCurrentLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setCurrentLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      });
    } catch {
      setCurrentLocation(null);
    }
  }

  function scrollToReport(reportId: string) {
    const y = reportOffsets.current[reportId];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
    }
  }

  function openReportDetails(report: ReportSummary, shouldScroll = false) {
    setSelectedReport(report);

    if (shouldScroll) {
      requestAnimationFrame(() => {
        scrollToReport(report.id);
      });
    }
  }

  function openReportChat(report: ReportSummary) {
    setSelectedReport(null);
    setChatReport(report);
  }

  async function handleMarkedRead(reportId: string, timestamp: string) {
    const nextState = await markReportChatRead(reportId, timestamp);
    setChatReadState(nextState);
  }

  async function loadCleanupParticipantsForReport(reportId: string) {
    setIsLoadingCleanupParticipants(true);
    setCleanupErrorMessage("");

    try {
      const items = await listCleanupParticipants(reportId);
      setCleanupParticipants(items);
    } catch (error) {
      setCleanupErrorMessage(
        error instanceof Error ? error.message : cleanupLoadingLabel
      );
    } finally {
      setIsLoadingCleanupParticipants(false);
    }
  }

  async function handleJoinCleanup() {
    if (!selectedReport) {
      return;
    }

    setIsSavingCleanupParticipation(true);
    setCleanupErrorMessage("");
    try {
      const items = await joinCleanup(selectedReport.id);
      setCleanupParticipants(items);
    } catch (error) {
      setCleanupErrorMessage(
        error instanceof Error ? error.message : cleanupJoinFailedLabel
      );
    } finally {
      setIsSavingCleanupParticipation(false);
    }
  }

  async function handleLeaveCleanup() {
    if (!selectedReport) {
      return;
    }

    setIsSavingCleanupParticipation(true);
    setCleanupErrorMessage("");
    try {
      const items = await leaveCleanup(selectedReport.id);
      setCleanupParticipants(items);
    } catch (error) {
      setCleanupErrorMessage(
        error instanceof Error ? error.message : cleanupLeaveFailedLabel
      );
    } finally {
      setIsSavingCleanupParticipation(false);
    }
  }

  function updateReportInState(updatedReport: ReportSummary) {
    setReports((current) =>
      current.map((item) => (item.id === updatedReport.id ? updatedReport : item))
    );
    setSelectedReport(updatedReport);
  }

  async function uploadCleanupMedia(
    mode: "camera" | "video" | "gallery"
  ) {
    if (!selectedReport) {
      return;
    }

    setCleanupErrorMessage("");
    setCleanupUploadMessage("");
    setIsUploadingCleanupMedia(true);

    try {
      let assets: ImagePicker.ImagePickerAsset[] = [];

      if (mode === "gallery") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          setCleanupErrorMessage(t.reports.mediaLibraryPermissionRequired);
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.8,
          videoMaxDuration: 60
        });

        if (!result.canceled) {
          assets = result.assets;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          setCleanupErrorMessage(t.reports.cameraPermissionRequired);
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes:
            mode === "video"
              ? ImagePicker.MediaTypeOptions.Videos
              : ImagePicker.MediaTypeOptions.All,
          quality: 0.8,
          videoMaxDuration: 60
        });

        if (!result.canceled && result.assets[0]) {
          assets = [result.assets[0]];
        }
      }

      if (assets.length === 0) {
        return;
      }

      const uploadedMedia = [];
      for (const asset of assets) {
        uploadedMedia.push(await uploadReportMedia(toPendingReportMedia(asset)));
      }

      const updatedReport = await appendReportMedia(selectedReport.id, uploadedMedia);
      updateReportInState(updatedReport);
      setCleanupUploadMessage(t.reports.cleanupUploadSuccess);
    } catch (error) {
      setCleanupErrorMessage(
        error instanceof Error ? error.message : t.reports.cleanupUploadFailed
      );
    } finally {
      setIsUploadingCleanupMedia(false);
    }
  }

  function getPublicCommentCount(report: ReportSummary) {
    return report.commentSummary?.publicCommentCount ?? 0;
  }

  function hasUnreadComments(report: ReportSummary) {
    const latestPublicCommentAt = report.commentSummary?.latestPublicCommentAt;
    const publicCommentCount = report.commentSummary?.publicCommentCount ?? 0;
    const lastReadAt = chatReadState[report.id];

    if (!latestPublicCommentAt || publicCommentCount === 0) {
      return false;
    }

    if (!lastReadAt) {
      return true;
    }

    return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime()
      ? true
      : false;
  }

  function handleMarkerPress(reportId: string) {
    const report = filteredReports.find((item) => item.id === reportId);
    if (!report) {
      return;
    }

    openReportDetails(report, true);
  }

  useEffect(() => {
    void loadReports("initial");
  }, [refreshKey]);

  useEffect(() => {
    void loadCurrentLocation();
  }, []);

  useEffect(() => {
    void getChatReadState().then(setChatReadState);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        (previousState === "background" || previousState === "inactive") &&
        nextState === "active"
      ) {
        void loadReports("silent");
      }

      previousState = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadReports("silent");
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (selectedReport) {
      const freshMatch = reports.find((report) => report.id === selectedReport.id) ?? null;
      setSelectedReport(freshMatch);
    }
  }, [reports, selectedReport]);

  useEffect(() => {
    if (chatReport) {
      const freshMatch = reports.find((report) => report.id === chatReport.id) ?? null;
      setChatReport(freshMatch);
    }
  }, [chatReport, reports]);

  useEffect(() => {
    if (statusFilter === "all") {
      return;
    }

    if (selectedReport && !filteredReports.some((report) => report.id === selectedReport.id)) {
      setSelectedReport(null);
    }
  }, [filteredReports, selectedReport, statusFilter]);

  useEffect(() => {
    onVisibleCountChange?.(filteredReports.length);
  }, [filteredReports.length, onVisibleCountChange]);

  useEffect(() => {
    onUnreadStateChange?.(unreadThreadCount);
  }, [onUnreadStateChange, unreadThreadCount]);

  useEffect(() => {
    if (!focusReportId || !focusReportNonce) {
      return;
    }

    const report = reports.find((item) => item.id === focusReportId);
    if (!report) {
      return;
    }

    setStatusFilter("all");
    openReportDetails(report, true);
    onFocusedReportHandled?.();
  }, [focusReportId, focusReportNonce, onFocusedReportHandled, reports]);

  useEffect(() => {
    if (!selectedReport || selectedReport.status !== "planned_cleanup") {
      setCleanupParticipants([]);
      setIsLoadingCleanupParticipants(false);
      setCleanupErrorMessage("");
      setCleanupUploadMessage("");
      return;
    }

    void loadCleanupParticipantsForReport(selectedReport.id);
  }, [selectedReport?.id, selectedReport?.status]);
  useEffect(() => {
    const hasUnreadInView = reports.some((report) => hasUnreadComments(report));

    if (!hasUnreadInView) {
      unreadPulse.stopAnimation();
      unreadPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(unreadPulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true
        }),
        Animated.timing(unreadPulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true
        })
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      unreadPulse.setValue(1);
    };
  }, [reports, chatReadState, unreadPulse]);

  const canUploadCleanupEvidence =
    selectedReport?.status === "planned_cleanup" &&
    Boolean(
      selectedReport &&
        currentUserId &&
        (selectedReport.createdBy?.userId === currentUserId ||
          cleanupParticipants.some((item) => item.userId === currentUserId))
    );

  return (
    <>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!isMapInteracting}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadReports("manual")}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {filterOptions.map((option) => {
            const isActive = option.key === statusFilter;
            return (
              <Pressable
                key={option.key}
                style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                onPress={() => setStatusFilter(option.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive ? styles.filterChipTextActive : null
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.mapCard}>
          {mapMarkers.length > 0 ? (
            <OpenStreetMapPreview
              markers={mapMarkers}
              height={340}
              onMarkerPress={handleMarkerPress}
              onInteractionChange={setIsMapInteracting}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.mapFallbackTitle}>{t.reports.mapNoMarkersTitle}</Text>
              <Text style={styles.mapFallbackText}>
                {reports.length > 0 ? t.reports.emptyFiltered : t.reports.mapNoMarkersText}
              </Text>
            </View>
          )}
        </View>

        {isLoading ? <ActivityIndicator size="large" /> : null}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {!isLoading && !errorMessage && filteredReports.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{t.reports.emptyFiltered}</Text>
          </View>
        ) : null}

        {filteredReports.map((report) => (
          <Pressable
            key={report.id}
            style={[
              styles.reportCard,
              selectedReport?.id === report.id ? styles.reportCardSelected : null
            ]}
            onPress={() => openReportDetails(report)}
            onLayout={(event) => {
              reportOffsets.current[report.id] = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: getStatusPalette(report.status).backgroundColor }
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: getStatusPalette(report.status).textColor }
                  ]}
                >
                  {t.statuses[report.status as keyof typeof t.statuses] ?? report.status}
                </Text>
              </View>
              <Text style={styles.sourceChip}>
                {report.source === "mobile"
                  ? t.common.sourceMobile
                  : report.source === "web"
                    ? t.common.sourceWeb
                    : t.common.sourceChat}
              </Text>
            </View>

            <Text style={styles.reportDescription}>{report.description}</Text>

            {report.media.length > 0 ? (
              <View style={styles.mediaSection}>
                <Text style={styles.mediaSectionTitle}>
                  {t.reports.mediaAttached}: {report.media.length}
                </Text>
                <MediaPreview
                  media={report.media}
                  openLabel={t.reports.openMedia}
                  videoLabel={t.reports.videoLabel}
                />
              </View>
            ) : null}

            <View style={styles.metaBlock}>
              <Text style={styles.reportMeta}>
                {t.reports.reporterLabel}:{" "}
                {report.createdBy?.displayName ?? t.reports.reporterUnknown}
              </Text>
              <Text style={styles.reportMeta}>
                {report.location.latitude.toFixed(5)}, {report.location.longitude.toFixed(5)}
              </Text>
              <Text style={styles.reportMeta}>
                {new Date(report.createdAt).toLocaleString()}
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.button, styles.buttonGhost]}
                onPress={() => openReportDetails(report)}
              >
                <Text style={styles.buttonGhostText}>{t.reports.viewDetails}</Text>
              </Pressable>
              <Animated.View
                style={[
                  styles.chatButtonWrapper,
                  hasUnreadComments(report) ? styles.buttonChatUnread : null,
                  hasUnreadComments(report) ? { opacity: unreadPulse } : null
                ]}
              >
                <Pressable
                  style={[styles.button, styles.buttonChat]}
                  onPress={() => openReportChat(report)}
                >
                  <View style={styles.chatButtonContent}>
                    <Text
                      style={[
                        styles.buttonChatText,
                        hasUnreadComments(report) ? styles.buttonChatTextUnread : null
                      ]}
                    >
                      {t.chat.open}
                    </Text>
                    {getPublicCommentCount(report) > 0 ? (
                      <View
                        style={[
                          styles.chatBadge,
                          hasUnreadComments(report) ? styles.chatBadgeUnread : null
                        ]}
                      >
                        <Text style={styles.chatBadgeText}>
                          {getPublicCommentCount(report)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => openExternalMap(report)}
              >
                <Text style={styles.buttonSecondaryText}>{t.reports.openInMap}</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={Boolean(selectedReport)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedReport ? (
              <ScrollView
                scrollEnabled={!isModalMapInteracting}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t.reports.detailsTitle}</Text>
                  <Pressable
                    style={styles.modalCloseButton}
                    onPress={() => setSelectedReport(null)}
                  >
                    <Text style={styles.modalCloseText}>{t.common.close}</Text>
                  </Pressable>
                </View>

                <View style={styles.modalMetaRow}>
                  <View
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor: getStatusPalette(selectedReport.status).backgroundColor
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: getStatusPalette(selectedReport.status).textColor }
                      ]}
                    >
                      {t.statuses[
                        selectedReport.status as keyof typeof t.statuses
                      ] ?? selectedReport.status}
                    </Text>
                  </View>
                  <Text style={styles.sourceChip}>
                    {selectedReport.source === "mobile"
                      ? t.common.sourceMobile
                      : selectedReport.source === "web"
                        ? t.common.sourceWeb
                        : t.common.sourceChat}
                  </Text>
                </View>

                <Text style={styles.modalDescription}>{selectedReport.description}</Text>

                <OpenStreetMapPreview
                  markers={[
                    {
                      id: selectedReport.id,
                      latitude: selectedReport.location.latitude,
                      longitude: selectedReport.location.longitude,
                      label: selectedReport.description,
                      color: getStatusPalette(selectedReport.status).markerColor,
                      isSelected: true
                    }
                  ]}
                  height={260}
                  onInteractionChange={setIsModalMapInteracting}
                />

                <View style={styles.modalInfoBlock}>
                  <Text style={styles.modalInfoLabel}>{t.reports.reporterLabel}</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedReport.createdBy?.displayName ?? t.reports.reporterUnknown}
                  </Text>
                  <Text style={styles.modalInfoLabel}>{t.reports.coordinatesLabel}</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedReport.location.latitude.toFixed(6)}, {selectedReport.location.longitude.toFixed(6)}
                  </Text>
                  <Text style={styles.modalInfoLabel}>{t.reports.createdAtLabel}</Text>
                  <Text style={styles.modalInfoValue}>
                    {new Date(selectedReport.createdAt).toLocaleString()}
                  </Text>
                </View>

                {selectedReport.status === "planned_cleanup" ? (
                  <View style={styles.cleanupCard}>
                    <View style={styles.cleanupHeader}>
                      <Text style={styles.cleanupTitle}>{cleanupTitle}</Text>
                      <Text style={styles.cleanupCount}>
                        {cleanupParticipantsLabel}: {cleanupParticipants.length}
                      </Text>
                    </View>

                    <Pressable
                      style={[
                        styles.cleanupActionButton,
                        cleanupParticipants.some(
                          (item) => item.userId === currentUserId
                        )
                          ? styles.cleanupLeaveButton
                          : styles.cleanupJoinButton,
                        isSavingCleanupParticipation
                          ? styles.cleanupActionButtonDisabled
                          : null
                      ]}
                      disabled={isSavingCleanupParticipation}
                      onPress={() =>
                        cleanupParticipants.some((item) => item.userId === currentUserId)
                          ? void handleLeaveCleanup()
                          : void handleJoinCleanup()
                      }
                    >
                      <Text style={styles.cleanupActionButtonText}>
                        {isSavingCleanupParticipation
                          ? t.common.save
                          : cleanupParticipants.some(
                                (item) => item.userId === currentUserId
                              )
                            ? cleanupLeaveLabel
                            : cleanupJoinLabel}
                      </Text>
                    </Pressable>

                    {cleanupErrorMessage ? (
                      <Text style={styles.cleanupError}>{cleanupErrorMessage}</Text>
                    ) : null}

                    {isLoadingCleanupParticipants ? (
                      <Text style={styles.cleanupMeta}>{cleanupLoadingLabel}</Text>
                    ) : cleanupParticipants.length === 0 ? (
                      <Text style={styles.cleanupMeta}>{cleanupNoParticipantsLabel}</Text>
                    ) : (
                      <View style={styles.cleanupList}>
                        {cleanupParticipants.map((participant) => (
                          <View key={participant.id} style={styles.cleanupParticipantRow}>
                            <Text style={styles.cleanupParticipantName}>
                              {participant.displayName ?? t.reports.reporterUnknown}
                            </Text>
                            <Text style={styles.cleanupParticipantMeta}>
                              {new Date(participant.joinedAt).toLocaleString()}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {selectedReport.cleanupEvent ? (
                      cleanupParticipants.some((item) => item.userId === currentUserId) ? (
                        <View style={styles.cleanupEventCard}>
                          <Text style={styles.cleanupEventTitle}>{cleanupScheduleTitle}</Text>
                          <Text style={styles.cleanupEventLabel}>{cleanupScheduledAtLabel}</Text>
                          <Text style={styles.cleanupEventValue}>
                            {new Date(selectedReport.cleanupEvent.scheduledAt).toLocaleString()}
                          </Text>
                          <Text style={styles.cleanupEventLabel}>{cleanupMeetingAddressLabel}</Text>
                          <Text style={styles.cleanupEventValue}>
                            {selectedReport.cleanupEvent.meetingAddress}
                          </Text>
                          {selectedReport.cleanupEvent.meetingLocation ? (
                            <View style={styles.cleanupMeetingMap}>
                              <OpenStreetMapPreview
                                height={180}
                                markers={[
                                  {
                                    latitude: selectedReport.cleanupEvent.meetingLocation.latitude,
                                    longitude: selectedReport.cleanupEvent.meetingLocation.longitude,
                                    label: selectedReport.cleanupEvent.meetingAddress,
                                    color: "#7c3aed"
                                  }
                                ]}
                              />
                            </View>
                          ) : null}
                          <Text style={styles.cleanupEventLabel}>{cleanupInstructionsLabel}</Text>
                          <Text style={styles.cleanupEventBody}>
                            {selectedReport.cleanupEvent.instructionsText}
                          </Text>
                          {selectedReport.cleanupEvent.toolsNote ? (
                            <>
                              <Text style={styles.cleanupEventLabel}>{cleanupToolsLabel}</Text>
                              <Text style={styles.cleanupEventBody}>
                                {selectedReport.cleanupEvent.toolsNote}
                              </Text>
                            </>
                          ) : null}
                          <Pressable
                            style={[styles.button, styles.buttonSecondary, styles.cleanupMapButton]}
                            onPress={() => openCleanupMeeting(selectedReport)}
                          >
                            <Text style={styles.buttonSecondaryText}>
                              {cleanupOpenMeetingLabel}
                            </Text>
                          </Pressable>

                          {canUploadCleanupEvidence ? (
                            <View style={styles.cleanupUploadCard}>
                              <Text style={styles.cleanupEventTitle}>
                                {t.reports.cleanupUploadTitle}
                              </Text>
                              <Text style={styles.cleanupMeta}>
                                {t.reports.cleanupUploadHint}
                              </Text>

                              <View style={styles.cleanupUploadActions}>
                                <Pressable
                                  style={[styles.button, styles.cleanupUploadButton]}
                                  onPress={() => void uploadCleanupMedia("camera")}
                                  disabled={isUploadingCleanupMedia}
                                >
                                  {isUploadingCleanupMedia ? (
                                    <ActivityIndicator color="#ffffff" />
                                  ) : (
                                    <Text style={styles.buttonText}>{t.reports.useCamera}</Text>
                                  )}
                                </Pressable>
                                <Pressable
                                  style={[styles.button, styles.cleanupUploadButton]}
                                  onPress={() => void uploadCleanupMedia("video")}
                                  disabled={isUploadingCleanupMedia}
                                >
                                  {isUploadingCleanupMedia ? (
                                    <ActivityIndicator color="#ffffff" />
                                  ) : (
                                    <Text style={styles.buttonText}>{t.reports.recordVideo}</Text>
                                  )}
                                </Pressable>
                              </View>
                              <Pressable
                                style={[styles.button, styles.buttonSecondary]}
                                onPress={() => void uploadCleanupMedia("gallery")}
                                disabled={isUploadingCleanupMedia}
                              >
                                <Text style={styles.buttonSecondaryText}>
                                  {t.reports.chooseFromGallery}
                                </Text>
                              </Pressable>

                              {cleanupUploadMessage ? (
                                <Text style={styles.cleanupSuccess}>
                                  {cleanupUploadMessage}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={styles.cleanupMeta}>{cleanupDetailsLockedLabel}</Text>
                      )
                    ) : null}
                  </View>
                ) : null}

                {selectedReport.media.length > 0 ? (
                  <View style={styles.modalMediaSection}>
                    {splitReportMedia(selectedReport.media).original.length > 0 ? (
                      <View style={styles.mediaGroupSection}>
                        <Text style={styles.mediaSectionTitle}>
                          {t.reports.originalReportMedia}:{" "}
                          {splitReportMedia(selectedReport.media).original.length}
                        </Text>
                        <MediaPreview
                          media={splitReportMedia(selectedReport.media).original}
                          openLabel={t.reports.openMedia}
                          videoLabel={t.reports.videoLabel}
                        />
                      </View>
                    ) : null}

                    {splitReportMedia(selectedReport.media).cleanupEvidence.length > 0 ? (
                      <View style={styles.mediaGroupSection}>
                        <Text style={styles.mediaSectionTitle}>
                          {t.reports.cleanupEvidenceMedia}:{" "}
                          {splitReportMedia(selectedReport.media).cleanupEvidence.length}
                        </Text>
                        <MediaPreview
                          media={splitReportMedia(selectedReport.media).cleanupEvidence}
                          openLabel={t.reports.openMedia}
                          videoLabel={t.reports.videoLabel}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.modalActionsRow}>
                  <Animated.View
                    style={[
                      styles.chatButtonWrapper,
                      hasUnreadComments(selectedReport) ? styles.buttonChatUnread : null,
                      hasUnreadComments(selectedReport) ? { opacity: unreadPulse } : null
                    ]}
                  >
                    <Pressable
                      style={[styles.button, styles.buttonChat]}
                      onPress={() => openReportChat(selectedReport)}
                    >
                      <View style={styles.chatButtonContent}>
                        <Text
                          style={[
                            styles.buttonChatText,
                            hasUnreadComments(selectedReport)
                              ? styles.buttonChatTextUnread
                              : null
                          ]}
                        >
                          {t.chat.open}
                        </Text>
                        {getPublicCommentCount(selectedReport) > 0 ? (
                          <View
                            style={[
                              styles.chatBadge,
                              hasUnreadComments(selectedReport)
                                ? styles.chatBadgeUnread
                                : null
                            ]}
                          >
                            <Text style={styles.chatBadgeText}>
                              {getPublicCommentCount(selectedReport)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  </Animated.View>
                  <Pressable
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={() => openExternalMap(selectedReport)}
                  >
                    <Text style={styles.buttonSecondaryText}>{t.reports.openInMap}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <ReportChatModal
        visible={Boolean(chatReport)}
        report={chatReport}
        onMarkedRead={(reportId, timestamp) => {
          void handleMarkedRead(reportId, timestamp);
        }}
        onClose={() => setChatReport(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 14,
    backgroundColor: "#f5f6f8",
    flexGrow: 1
  },
  filterScroll: {
    marginTop: 5,
    marginBottom: 8
  },
  filterRow: {
    paddingRight: 8
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginRight: 7,
    alignSelf: "flex-start"
  },
  filterChipActive: {
    backgroundColor: "#0b6bcb",
    borderColor: "#0b6bcb"
  },
  filterChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: "#ffffff"
  },
  mapCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 6,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginBottom: 12,
    overflow: "hidden"
  },
  mapFallback: {
    height: 340,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  mapFallbackTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center"
  },
  mapFallbackText: {
    color: "#475569",
    fontSize: 14,
    textAlign: "center"
  },
  emptyState: {
    paddingVertical: 10,
    alignItems: "center"
  },
  emptyStateText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600"
  },
  reportCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginBottom: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 2
  },
  reportCardSelected: {
    borderColor: "#0b6bcb",
    borderWidth: 1.5
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden"
  },
  statusChipText: {
    fontWeight: "700",
    fontSize: 12
  },
  sourceChip: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "#eef2f7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden"
  },
  reportDescription: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 10
  },
  mediaSection: {
    marginBottom: 8
  },
  mediaSectionTitle: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8
  },
  mediaRow: {
    paddingRight: 6
  },
  mediaScroll: {
    width: "100%"
  },
  mediaTile: {
    width: 148,
    height: 148,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  mediaImage: {
    width: "100%",
    height: "100%"
  },
  videoTile: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    padding: 12
  },
  videoTileLabel: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8
  },
  videoTileLink: {
    color: "#bfdbfe",
    fontSize: 14,
    fontWeight: "600"
  },
  metaBlock: {
    marginBottom: 2
  },
  reportMeta: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 3
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6
  },
  button: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonHalf: {
    flex: 1
  },
  chatButtonWrapper: {
    flex: 1,
    borderRadius: 12
  },
  buttonChat: {
    backgroundColor: "#e8fff4",
    borderWidth: 1,
    borderColor: "#bce8d1"
  },
  buttonChatUnread: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5"
  },
  buttonChatText: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 13
  },
  buttonChatTextUnread: {
    color: "#b91c1c"
  },
  chatButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  chatBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#166534",
    alignItems: "center"
  },
  chatBadgeUnread: {
    backgroundColor: "#b91c1c"
  },
  chatBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700"
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  buttonSecondaryText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  buttonGhost: {
    flex: 1,
    backgroundColor: "#eaf3ff"
  },
  buttonGhostText: {
    color: "#0b6bcb",
    fontWeight: "700",
    fontSize: 13
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end"
  },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden"
  },
  modalContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 22
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
    marginRight: 8
  },
  modalCloseButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  modalCloseText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 12
  },
  modalMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  modalDescription: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 10
  },
  modalInfoBlock: {
    marginTop: 10,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  modalInfoLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4
  },
  modalInfoValue: {
    color: "#0f172a",
    fontSize: 14,
    marginBottom: 8
  },
  modalMediaSection: {
    marginBottom: 10
  },
  mediaGroupSection: {
    marginBottom: 10
  },
  cleanupCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  cleanupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  cleanupTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700"
  },
  cleanupCount: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  cleanupActionButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    alignItems: "center"
  },
  cleanupJoinButton: {
    backgroundColor: "#0b6bcb"
  },
  cleanupLeaveButton: {
    backgroundColor: "#475569"
  },
  cleanupActionButtonDisabled: {
    opacity: 0.7
  },
  cleanupActionButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  },
  cleanupMeta: {
    color: "#64748b",
    fontSize: 13
  },
  cleanupError: {
    color: "#b91c1c",
    fontSize: 13,
    marginBottom: 10
  },
  cleanupList: {
    gap: 8
  },
  cleanupParticipantRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  },
  cleanupParticipantName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700"
  },
  cleanupParticipantMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  cleanupEventCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  },
  cleanupEventTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10
  },
  cleanupEventLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4
  },
  cleanupEventValue: {
    color: "#0f172a",
    fontSize: 14,
    marginBottom: 10
  },
  cleanupEventBody: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10
  },
  cleanupMapButton: {
    alignSelf: "flex-start",
    marginTop: 4
  },
  cleanupMeetingMap: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden"
  },
  cleanupUploadCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0"
  },
  cleanupUploadActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    marginBottom: 10
  },
  cleanupUploadButton: {
    flex: 1,
    backgroundColor: "#0b6bcb",
    marginBottom: 0
  },
  cleanupSuccess: {
    color: "#166534",
    fontSize: 13,
    marginTop: 10
  },
  modalActionsRow: {
    marginTop: 4
  },
  error: {
    color: "#b91c1c",
    marginBottom: 8
  }
});

