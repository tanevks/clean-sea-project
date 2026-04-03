import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { OpenStreetMapPreview } from "../../components/OpenStreetMapPreview";
import {
  deleteUserNotification,
  getNotificationMetadataString,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification
} from "../../lib/notificationsApi";
import { fetchProfile, updateProfile } from "../../lib/profileApi";
import {
  fetchResolvedReportSummary,
  type ReportMedia,
  type ReportSummary
} from "../../lib/reportsApi";
import { useI18n } from "../../lib/i18n";

const copy = {
  bg: {
    title: "\u041f\u0440\u043e\u0444\u0438\u043b",
    subtitle:
      "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u0430\u0439 \u043f\u0440\u044f\u043a\u043e\u0440\u0430 \u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u0437\u0430 \u0432\u0440\u044a\u0437\u043a\u0430.",
    nickname: "\u041f\u0440\u044f\u043a\u043e\u0440",
    phone: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d \u0437\u0430 \u0432\u0440\u044a\u0437\u043a\u0430",
    email: "\u0418\u043c\u0435\u0439\u043b",
    role: "\u0420\u043e\u043b\u044f",
    save: "\u0417\u0430\u043f\u0430\u0437\u0438",
    saving: "\u0417\u0430\u043f\u0430\u0437\u0432\u0430\u043d\u0435...",
    saved: "\u041f\u0440\u043e\u0444\u0438\u043b\u044a\u0442 \u0435 \u043e\u0431\u043d\u043e\u0432\u0435\u043d.",
    loading: "\u0417\u0430\u0440\u0435\u0436\u0434\u0430\u043d\u0435 \u043d\u0430 \u043f\u0440\u043e\u0444\u0438\u043b...",
    nicknameRequired: "\u041f\u0440\u044f\u043a\u043e\u0440\u044a\u0442 \u0435 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u0435\u043d.",
    unknown: "\u041d\u044f\u043c\u0430 \u0434\u0430\u043d\u043d\u0438",
    citizen: "\u041f\u043e\u0442\u0440\u0435\u0431\u0438\u0442\u0435\u043b",
    moderator: "\u041c\u043e\u0434\u0435\u0440\u0430\u0442\u043e\u0440",
    admin: "\u0410\u0434\u043c\u0438\u043d",
    notificationsTitle: "\u0418\u0437\u0432\u0435\u0441\u0442\u0438\u044f",
    notificationsSubtitle:
      "\u0422\u0443\u043a \u0438\u0434\u0432\u0430\u0442 \u0430\u043a\u0442\u0443\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438\u0442\u0435 \u043f\u043e \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0438\u044f\u0442\u0430 \u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0438\u0442\u0435, \u043a\u044a\u043c \u043a\u043e\u0438\u0442\u043e \u0438\u043c\u0430\u0448 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0435.",
    notificationsEmpty: "\u041e\u0449\u0435 \u043d\u044f\u043c\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044f.",
    markAllRead: "\u041c\u0430\u0440\u043a\u0438\u0440\u0430\u0439 \u0432\u0441\u0438\u0447\u043a\u043e \u043a\u0430\u0442\u043e \u043f\u0440\u043e\u0447\u0435\u0442\u0435\u043d\u043e",
    markingAllRead: "\u041c\u0430\u0440\u043a\u0438\u0440\u0430\u043d\u0435...",
    cleanupScheduledTitle: "\u041d\u0430\u0441\u0440\u043e\u0447\u0432\u0430\u043d\u0435 \u043d\u0430 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
    cleanupUpdatedTitle: "\u041f\u0440\u043e\u043c\u044f\u043d\u0430 \u0432 \u043d\u0430\u0441\u0440\u043e\u0447\u0432\u0430\u043d\u0435\u0442\u043e",
    cleanupResolvedTitle: "\u041f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435\u0442\u043e \u0435 \u043f\u0440\u0438\u043a\u043b\u044e\u0447\u0438\u043b\u043e",
    initiativeCommentTitle: "\u041d\u043e\u0432 \u043a\u043e\u043c\u0435\u043d\u0442\u0430\u0440 \u043f\u043e \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0430",
    initiativePlanReadyTitle: "\u0413\u043e\u0442\u043e\u0432 \u043f\u043b\u0430\u043d \u0437\u0430 \u0440\u0435\u0430\u043b\u0438\u0437\u0438\u0440\u0430\u043d\u0435",
    initiativeReportReadyTitle: "\u0413\u043e\u0442\u043e\u0432 \u0434\u043e\u043a\u043b\u0430\u0434 \u0437\u0430 \u0440\u0435\u0430\u043b\u0438\u0437\u0438\u0440\u0430\u043d\u0435",
    webOnlyNotice: "\u0427\u0435\u0442\u0435 \u0441\u0435 \u0441\u0430\u043c\u043e \u043f\u0440\u0435\u0437 web.",
    reportLabel: "\u0421\u0438\u0433\u043d\u0430\u043b",
    initiativeLabel: "\u0418\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0430",
    openItem: "\u041e\u0442\u0432\u043e\u0440\u0438",
    scheduledAtLabel: "\u0414\u0430\u0442\u0430 \u0438 \u0447\u0430\u0441",
    meetingAddressLabel: "\u0421\u0431\u043e\u0440\u0435\u043d \u043f\u0443\u043d\u043a\u0442",
    instructionsLabel: "\u0423\u043a\u0430\u0437\u0430\u043d\u0438\u044f",
    toolsLabel: "\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u0438 \u0438 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0438",
    resolutionNoteLabel: "\u0424\u0438\u043d\u0430\u043b\u043d\u0430 \u0431\u0435\u043b\u0435\u0436\u043a\u0430",
    openReport: "\u041e\u0442\u0432\u043e\u0440\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u0430",
    deleteNotification: "\u0418\u0437\u0442\u0440\u0438\u0439",
    unread: "\u041d\u0435\u043f\u0440\u043e\u0447\u0435\u0442\u0435\u043d\u043e",
    read: "\u041f\u0440\u043e\u0447\u0435\u0442\u0435\u043d\u043e",
    resolvedSummaryTitle: "\u0420\u0435\u0437\u0443\u043b\u0442\u0430\u0442 \u0441\u043b\u0435\u0434 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
    closeSummary: "\u0421\u043a\u0440\u0438\u0439",
    originalMedia: "\u041f\u044a\u0440\u0432\u043e\u043d\u0430\u0447\u0430\u043b\u043d\u0438 \u0444\u0430\u0439\u043b\u043e\u0432\u0435",
    cleanupEvidenceMedia: "\u0421\u043b\u0435\u0434 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
    openMedia: "\u041e\u0442\u0432\u043e\u0440\u0438",
    videoLabel: "\u0412\u0438\u0434\u0435\u043e",
    resultMap: "\u041a\u0430\u0440\u0442\u0430 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0430",
    meetingMap: "\u041a\u0430\u0440\u0442\u0430 \u043d\u0430 \u0441\u0431\u043e\u0440\u043d\u0438\u044f \u043f\u0443\u043d\u043a\u0442",
    noCleanupMedia: "\u041e\u0449\u0435 \u043d\u044f\u043c\u0430 \u043a\u0430\u0447\u0435\u043d\u0438 \u0444\u0430\u0439\u043b\u043e\u0432\u0435 \u0441\u043b\u0435\u0434 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435.",
    loadingSummary: "\u0417\u0430\u0440\u0435\u0436\u0434\u0430\u043d\u0435 \u043d\u0430 \u0440\u0435\u0437\u0443\u043b\u0442\u0430\u0442\u0430...",
    summaryUnavailable: "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445\u043c\u0435 \u0434\u0430 \u0437\u0430\u0440\u0435\u0434\u0438\u043c \u0440\u0435\u0437\u0443\u043b\u0442\u0430\u0442\u0430."
  },
  en: {
    title: "Profile",
    subtitle: "Edit nickname and contact details.",
    nickname: "Nickname",
    phone: "Contact phone",
    email: "Email",
    role: "Role",
    save: "Save",
    saving: "Saving...",
    saved: "Profile updated.",
    loading: "Loading profile...",
    nicknameRequired: "Nickname is required.",
    unknown: "No data",
    citizen: "Citizen",
    moderator: "Moderator",
    admin: "Admin",
    notificationsTitle: "Notifications",
    notificationsSubtitle:
      "Updates for cleanups and initiatives you are involved in appear here.",
    notificationsEmpty: "No notifications yet.",
    markAllRead: "Mark all as read",
    markingAllRead: "Marking...",
    cleanupScheduledTitle: "Cleanup scheduled",
    cleanupUpdatedTitle: "Cleanup updated",
    cleanupResolvedTitle: "Cleanup completed",
    initiativeCommentTitle: "New initiative comment",
    initiativePlanReadyTitle: "Implementation plan ready",
    initiativeReportReadyTitle: "Implementation report ready",
    webOnlyNotice: "Available only in the web app.",
    reportLabel: "Report",
    initiativeLabel: "Initiative",
    openItem: "Open",
    scheduledAtLabel: "Date and time",
    meetingAddressLabel: "Meeting point",
    instructionsLabel: "Instructions",
    toolsLabel: "Tools and materials",
    resolutionNoteLabel: "Final note",
    openReport: "Open report",
    deleteNotification: "Delete",
    unread: "Unread",
    read: "Read",
    resolvedSummaryTitle: "Resolved cleanup summary",
    closeSummary: "Close",
    originalMedia: "Original media",
    cleanupEvidenceMedia: "After cleanup",
    openMedia: "Open",
    videoLabel: "Video",
    resultMap: "Report map",
    meetingMap: "Meeting point map",
    noCleanupMedia: "No after-cleanup files uploaded yet.",
    loadingSummary: "Loading summary...",
    summaryUnavailable: "Failed to load the resolved summary."
  }
} as const;

function splitReportMedia(media: ReportMedia[]) {
  return {
    original: media.filter((item) => (item.mediaContext ?? "report") !== "cleanup_evidence"),
    cleanupEvidence: media.filter(
      (item) => (item.mediaContext ?? "report") === "cleanup_evidence"
    )
  };
}

function openMedia(media: ReportMedia) {
  void Linking.openURL(media.url);
}

function openExternalMap(latitude: number, longitude: number) {
  void Linking.openURL(
    `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
  );
}

function MediaRow({
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

export function ProfileScreen({
  onUnreadCountChange,
  onOpenReport,
  onOpenInitiative
}: {
  onUnreadCountChange?: (count: number) => void;
  onOpenReport?: (reportId: string) => void;
  onOpenInitiative?: (initiativeId: string, commentId?: string | null) => void;
}) {
  const { language } = useI18n();
  const text = copy[language];
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMarkingNotifications, setIsMarkingNotifications] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"citizen" | "moderator" | "admin">("citizen");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [resolvedSummary, setResolvedSummary] = useState<ReportSummary | null>(null);
  const [isResolvedSummaryVisible, setIsResolvedSummaryVisible] = useState(false);
  const [isLoadingResolvedSummary, setIsLoadingResolvedSummary] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  useEffect(() => {
    async function loadProfileData() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [profile, notificationItems] = await Promise.all([
          fetchProfile(),
          listUserNotifications()
        ]);
        setEmail(profile.email ?? null);
        setRole(profile.role);
        setNickname(profile.nickname ?? profile.displayName ?? "");
        setPhone(profile.contactPhone ?? profile.phone ?? "");
        setNotifications(notificationItems);
        onUnreadCountChange?.(
          notificationItems.filter((item) => !item.isRead).length
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load profile."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfileData();
  }, [onUnreadCountChange]);

  async function onSave() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!nickname.trim()) {
      setErrorMessage(text.nicknameRequired);
      return;
    }

    setIsSaving(true);

    try {
      const profile = await updateProfile({
        nickname,
        phone
      });
      setNickname(profile.nickname ?? profile.displayName ?? "");
      setPhone(profile.contactPhone ?? profile.phone ?? "");
      setSuccessMessage(text.saved);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function onMarkAllNotificationsRead() {
    setIsMarkingNotifications(true);
    setErrorMessage("");

    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt ?? new Date().toISOString()
        }))
      );
      onUnreadCountChange?.(0);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to mark notifications as read."
      );
    } finally {
      setIsMarkingNotifications(false);
    }
  }

  function canDeleteNotification(item: UserNotification) {
    const scheduledAt = getNotificationMetadataString(item, "scheduledAt");
    if (!scheduledAt) {
      return false;
    }

    return new Date(scheduledAt).getTime() < Date.now();
  }

  async function handleDeleteNotification(notificationId: string) {
    try {
      await deleteUserNotification(notificationId);
      setNotifications((current) => {
        const next = current.filter((item) => item.id !== notificationId);
        onUnreadCountChange?.(next.filter((item) => !item.isRead).length);
        return next;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete notification."
      );
    }
  }

  async function onOpenNotification(notificationId: string) {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target) {
      return;
    }

    try {
      if (!target.isRead) {
        const updated = await markNotificationRead(notificationId);
        setNotifications((current) => {
          const next = current.map((item) =>
            item.id === notificationId ? updated : item
          );
          onUnreadCountChange?.(next.filter((item) => !item.isRead).length);
          return next;
        });
      }

      if (target.type === "cleanup_resolved" && target.reportId) {
        setIsResolvedSummaryVisible(true);
        setIsLoadingResolvedSummary(true);
        setResolvedSummary(null);

        try {
          const summary = await fetchResolvedReportSummary(target.reportId);
          setResolvedSummary(summary);
        } catch (error) {
          setResolvedSummary(null);
          setErrorMessage(
            error instanceof Error ? error.message : text.summaryUnavailable
          );
        } finally {
          setIsLoadingResolvedSummary(false);
        }
        return;
      }

      if (target.reportId) {
        onOpenReport?.(target.reportId);
        return;
      }

      const initiativeId = getNotificationMetadataString(target, "initiativeId");
      if (
        target.type === "initiative_plan_ready" ||
        target.type === "initiative_report_ready"
      ) {
        return;
      }

      if (initiativeId) {
        onOpenInitiative?.(
          initiativeId,
          getNotificationMetadataString(target, "commentId")
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to mark notification as read."
      );
    }
  }

  function formatDateTime(value: string | null) {
    if (!value) {
      return text.unknown;
    }

    return new Date(value).toLocaleString(language === "bg" ? "bg-BG" : "en-US");
  }

  const roleLabel = text[role];
  const resolvedSummaryMedia = resolvedSummary
    ? splitReportMedia(resolvedSummary.media)
    : { original: [], cleanupEvidence: [] };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.subtitle}>{text.subtitle}</Text>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      ) : (
        <>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          <View style={styles.infoCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{text.email}</Text>
              <Text style={styles.staticValue}>{email || text.unknown}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{text.role}</Text>
              <Text style={styles.staticValue}>{roleLabel}</Text>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.nickname}</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder={text.nickname}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.phone}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder={text.phone}
              keyboardType="phone-pad"
            />
          </View>

          <Pressable
            style={[styles.button, isSaving ? styles.buttonDisabled : null]}
            onPress={() => void onSave()}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>
              {isSaving ? text.saving : text.save}
            </Text>
          </Pressable>

          <View style={styles.notificationsSection}>
            <View style={styles.notificationsHeader}>
              <View style={styles.notificationsHeadingWrap}>
                <Text style={styles.sectionTitle}>{text.notificationsTitle}</Text>
                <Text style={styles.sectionSubtitle}>{text.notificationsSubtitle}</Text>
              </View>
              {unreadCount > 0 ? (
                <Pressable
                  style={[
                    styles.secondaryButton,
                    isMarkingNotifications ? styles.buttonDisabled : null
                  ]}
                  onPress={() => void onMarkAllNotificationsRead()}
                  disabled={isMarkingNotifications}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isMarkingNotifications ? text.markingAllRead : text.markAllRead}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {notifications.length === 0 ? (
              <Text style={styles.emptyNotifications}>{text.notificationsEmpty}</Text>
            ) : (
              notifications.map((item) => {
                const reportLabel =
                  getNotificationMetadataString(item, "reportLabel") ??
                  getNotificationMetadataString(item, "reportDescription");
                const initiativeLabel = getNotificationMetadataString(item, "initiativeTitle");
                const scheduledAt = getNotificationMetadataString(item, "scheduledAt");
                const meetingAddress = getNotificationMetadataString(item, "meetingAddress");
                const instructionsText = getNotificationMetadataString(item, "instructionsText");
                const toolsNote = getNotificationMetadataString(item, "toolsNote");
                const resolutionNote = getNotificationMetadataString(item, "resolutionNote");
                const headline =
                  item.type === "cleanup_event_updated"
                    ? text.cleanupUpdatedTitle
                    : item.type === "cleanup_event_scheduled"
                      ? text.cleanupScheduledTitle
                      : item.type === "cleanup_resolved"
                        ? text.cleanupResolvedTitle
                        : item.type === "initiative_public_comment"
                          ? text.initiativeCommentTitle
                          : item.type === "initiative_plan_ready"
                            ? text.initiativePlanReadyTitle
                            : item.type === "initiative_report_ready"
                              ? text.initiativeReportReadyTitle
                              : item.title;
                const isWebOnlyInitiativeDocument =
                  item.type === "initiative_plan_ready" ||
                  item.type === "initiative_report_ready";

                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.notificationCard,
                      !item.isRead ? styles.notificationCardUnread : null
                    ]}
                    onPress={() => void onOpenNotification(item.id)}
                  >
                    <View style={styles.notificationTitleRow}>
                      <Text style={styles.notificationTitle}>{headline}</Text>
                      <View
                        style={[
                          styles.notificationStatusChip,
                          item.isRead
                            ? styles.notificationStatusChipRead
                            : styles.notificationStatusChipUnread
                        ]}
                      >
                        <Text
                          style={[
                            styles.notificationStatusText,
                            item.isRead
                              ? styles.notificationStatusTextRead
                              : styles.notificationStatusTextUnread
                          ]}
                        >
                          {item.isRead ? text.read : text.unread}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.notificationMeta}>{formatDateTime(item.createdAt)}</Text>
                    <Text style={styles.notificationBody}>{item.body}</Text>
                    {isWebOnlyInitiativeDocument ? (
                      <Text style={styles.notificationMeta}>{text.webOnlyNotice}</Text>
                    ) : null}

                    <View style={styles.notificationActionsRow}>
                      {(item.reportId || initiativeLabel) && !isWebOnlyInitiativeDocument ? (
                        <Pressable
                          style={[styles.notificationActionButton, styles.notificationOpenButton]}
                          onPress={() => void onOpenNotification(item.id)}
                        >
                          <Text style={styles.notificationOpenButtonText}>{text.openItem}</Text>
                        </Pressable>
                      ) : null}
                      {canDeleteNotification(item) ? (
                        <Pressable
                          style={[styles.notificationActionButton, styles.notificationDeleteButton]}
                          onPress={() => void handleDeleteNotification(item.id)}
                        >
                          <Text style={styles.notificationDeleteButtonText}>{text.deleteNotification}</Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {reportLabel ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.reportLabel}</Text>
                        <Text style={styles.notificationValue}>{reportLabel}</Text>
                      </View>
                    ) : null}

                    {initiativeLabel ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.initiativeLabel}</Text>
                        <Text style={styles.notificationValue}>{initiativeLabel}</Text>
                      </View>
                    ) : null}

                    {scheduledAt ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.scheduledAtLabel}</Text>
                        <Text style={styles.notificationValue}>{formatDateTime(scheduledAt)}</Text>
                      </View>
                    ) : null}

                    {meetingAddress ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.meetingAddressLabel}</Text>
                        <Text style={styles.notificationValue}>{meetingAddress}</Text>
                      </View>
                    ) : null}

                    {instructionsText ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.instructionsLabel}</Text>
                        <Text style={styles.notificationValue}>{instructionsText}</Text>
                      </View>
                    ) : null}

                    {toolsNote ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.toolsLabel}</Text>
                        <Text style={styles.notificationValue}>{toolsNote}</Text>
                      </View>
                    ) : null}

                    {resolutionNote ? (
                      <View style={styles.notificationDetailBlock}>
                        <Text style={styles.notificationLabel}>{text.resolutionNoteLabel}</Text>
                        <Text style={styles.notificationValue}>{resolutionNote}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      )}
      </ScrollView>

      <Modal
        visible={isResolvedSummaryVisible}
        animationType="slide"
        onRequestClose={() => {
          setIsResolvedSummaryVisible(false);
          setResolvedSummary(null);
        }}
      >
        <View style={styles.summaryModalRoot}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderTextWrap}>
              <Text style={styles.summaryTitle}>{text.resolvedSummaryTitle}</Text>
              {resolvedSummary?.description ? (
                <Text style={styles.summarySubtitle}>{resolvedSummary.description}</Text>
              ) : null}
            </View>
            <Pressable
              style={styles.summaryCloseButton}
              onPress={() => {
                setIsResolvedSummaryVisible(false);
                setResolvedSummary(null);
              }}
            >
              <Text style={styles.summaryCloseButtonText}>{text.closeSummary}</Text>
            </Pressable>
          </View>

          {isLoadingResolvedSummary ? (
            <View style={styles.summaryLoadingWrap}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>{text.loadingSummary}</Text>
            </View>
          ) : resolvedSummary ? (
            <ScrollView
              style={styles.summaryScroll}
              contentContainerStyle={styles.summaryContent}
            >
              <View style={styles.summaryCard}>
                <Text style={styles.notificationLabel}>{text.reportLabel}</Text>
                <Text style={styles.summaryBody}>{resolvedSummary.description}</Text>
                <Text style={styles.summaryMeta}>
                  {formatDateTime(resolvedSummary.createdAt)}
                </Text>
              </View>

              {resolvedSummary.resolutionNote?.note ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.summarySectionTitle}>{text.resolutionNoteLabel}</Text>
                  <Text style={styles.summaryBody}>{resolvedSummary.resolutionNote.note}</Text>
                  {resolvedSummary.resolutionNote.createdAt ? (
                    <Text style={styles.summaryMeta}>
                      {formatDateTime(resolvedSummary.resolutionNote.createdAt)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.summaryCard}>
                <Text style={styles.summarySectionTitle}>{text.resultMap}</Text>
                <OpenStreetMapPreview
                  height={220}
                  markers={[
                    {
                      latitude: resolvedSummary.location.latitude,
                      longitude: resolvedSummary.location.longitude,
                      label: resolvedSummary.description
                    }
                  ]}
                />
                <Pressable
                  style={styles.summaryMapButton}
                  onPress={() =>
                    openExternalMap(
                      resolvedSummary.location.latitude,
                      resolvedSummary.location.longitude
                    )
                  }
                >
                  <Text style={styles.summaryMapButtonText}>{text.openReport}</Text>
                </Pressable>
              </View>

              {resolvedSummary.cleanupEvent ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.summarySectionTitle}>{text.cleanupScheduledTitle}</Text>

                  <View style={styles.notificationDetailBlock}>
                    <Text style={styles.notificationLabel}>{text.scheduledAtLabel}</Text>
                    <Text style={styles.notificationValue}>
                      {formatDateTime(resolvedSummary.cleanupEvent.scheduledAt)}
                    </Text>
                  </View>

                  <View style={styles.notificationDetailBlock}>
                    <Text style={styles.notificationLabel}>{text.meetingAddressLabel}</Text>
                    <Text style={styles.notificationValue}>
                      {resolvedSummary.cleanupEvent.meetingAddress}
                    </Text>
                  </View>

                  <View style={styles.notificationDetailBlock}>
                    <Text style={styles.notificationLabel}>{text.instructionsLabel}</Text>
                    <Text style={styles.notificationValue}>
                      {resolvedSummary.cleanupEvent.instructionsText}
                    </Text>
                  </View>

                  {resolvedSummary.cleanupEvent.toolsNote ? (
                    <View style={styles.notificationDetailBlock}>
                      <Text style={styles.notificationLabel}>{text.toolsLabel}</Text>
                      <Text style={styles.notificationValue}>
                        {resolvedSummary.cleanupEvent.toolsNote}
                      </Text>
                    </View>
                  ) : null}

                  {resolvedSummary.cleanupEvent.meetingLocation ? (
                    <>
                      <Text style={styles.summarySectionTitle}>{text.meetingMap}</Text>
                      <OpenStreetMapPreview
                        height={220}
                        markers={[
                          {
                            latitude: resolvedSummary.cleanupEvent.meetingLocation.latitude,
                            longitude: resolvedSummary.cleanupEvent.meetingLocation.longitude,
                            label: resolvedSummary.cleanupEvent.meetingAddress
                          }
                        ]}
                      />
                      <Pressable
                        style={styles.summaryMapButton}
                        onPress={() =>
                          openExternalMap(
                            resolvedSummary.cleanupEvent!.meetingLocation!.latitude,
                            resolvedSummary.cleanupEvent!.meetingLocation!.longitude
                          )
                        }
                      >
                        <Text style={styles.summaryMapButtonText}>{text.meetingAddressLabel}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.summaryCard}>
                <Text style={styles.summarySectionTitle}>{text.originalMedia}</Text>
                {resolvedSummaryMedia.original.length > 0 ? (
                  <MediaRow
                    media={resolvedSummaryMedia.original}
                    openLabel={text.openMedia}
                    videoLabel={text.videoLabel}
                  />
                ) : (
                  <Text style={styles.summaryEmptyText}>{text.unknown}</Text>
                )}
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summarySectionTitle}>{text.cleanupEvidenceMedia}</Text>
                {resolvedSummaryMedia.cleanupEvidence.length > 0 ? (
                  <MediaRow
                    media={resolvedSummaryMedia.cleanupEvidence}
                    openLabel={text.openMedia}
                    videoLabel={text.videoLabel}
                  />
                ) : (
                  <Text style={styles.summaryEmptyText}>{text.noCleanupMedia}</Text>
                )}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.summaryLoadingWrap}>
              <Text style={styles.error}>{text.summaryUnavailable}</Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f8"
  },
  content: {
    padding: 16,
    paddingBottom: 28
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6
  },
  subtitle: {
    color: "#475569",
    marginBottom: 16
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center"
  },
  loadingText: {
    marginTop: 12,
    color: "#475569"
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14
  },
  fieldGroup: {
    marginBottom: 12
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6
  },
  staticValue: {
    color: "#0f172a",
    fontSize: 15
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  button: {
    backgroundColor: "#0b6bcb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  error: {
    color: "#b91c1c",
    marginBottom: 10
  },
  success: {
    color: "#166534",
    marginBottom: 10
  },
  notificationsSection: {
    marginTop: 22
  },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12
  },
  notificationsHeadingWrap: {
    flex: 1,
    paddingRight: 10
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4
  },
  sectionSubtitle: {
    color: "#475569",
    fontSize: 13
  },
  emptyNotifications: {
    color: "#64748b",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 14,
    padding: 14
  },
  notificationCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  notificationCardUnread: {
    borderColor: "#dc2626"
  },
  notificationTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  notificationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    paddingRight: 8
  },
  notificationMeta: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 8
  },
  notificationBody: {
    color: "#334155",
    marginBottom: 10,
    lineHeight: 20
  },
  notificationActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4
  },
  notificationActionButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  notificationOpenButton: {
    backgroundColor: "#e8fff4",
    borderWidth: 1,
    borderColor: "#bce8d1"
  },
  notificationOpenButtonText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700"
  },
  notificationDeleteButton: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5"
  },
  notificationDeleteButtonText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "700"
  },
  notificationStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  notificationStatusChipUnread: {
    backgroundColor: "#fee2e2"
  },
  notificationStatusChipRead: {
    backgroundColor: "#e2e8f0"
  },
  notificationStatusText: {
    fontSize: 11,
    fontWeight: "700"
  },
  notificationStatusTextUnread: {
    color: "#b91c1c"
  },
  notificationStatusTextRead: {
    color: "#475569"
  },
  notificationDetailBlock: {
    marginTop: 8
  },
  notificationLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 3
  },
  notificationValue: {
    color: "#0f172a",
    lineHeight: 20
  },
  summaryModalRoot: {
    flex: 1,
    backgroundColor: "#f5f6f8"
  },
  summaryHeader: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0b1f2a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  summaryHeaderTextWrap: {
    flex: 1,
    paddingRight: 12
  },
  summaryTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700"
  },
  summarySubtitle: {
    color: "#cbd5e1",
    marginTop: 4,
    lineHeight: 20
  },
  summaryCloseButton: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  summaryCloseButtonText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 12
  },
  summaryLoadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  summaryScroll: {
    flex: 1
  },
  summaryContent: {
    padding: 16,
    paddingBottom: 28
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14
  },
  summarySectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10
  },
  summaryBody: {
    color: "#0f172a",
    lineHeight: 22
  },
  summaryMeta: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 12
  },
  summaryMapButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#e8fff4",
    borderWidth: 1,
    borderColor: "#bce8d1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  summaryMapButtonText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700"
  },
  mediaScroll: {
    marginTop: 4
  },
  mediaRow: {
    paddingRight: 4
  },
  mediaTile: {
    width: 140,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    marginRight: 10
  },
  mediaImage: {
    width: "100%",
    height: "100%"
  },
  videoTile: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12
  },
  videoTileLabel: {
    color: "#0f172a",
    fontWeight: "700",
    marginBottom: 6
  },
  videoTileLink: {
    color: "#0b6bcb",
    fontWeight: "600"
  },
  summaryEmptyText: {
    color: "#64748b"
  }
});
