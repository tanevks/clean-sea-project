import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useI18n } from "../../lib/i18n";
import {
  createReportComment,
  listReportComments,
  type ReportComment,
  type ReportSummary
} from "../../lib/reportsApi";
import { supabase } from "../../lib/supabase";

type Props = {
  report: ReportSummary | null;
  visible: boolean;
  onClose: () => void;
  onMarkedRead?: (reportId: string, timestamp: string) => void;
};

export function ReportChatModal({
  report,
  visible,
  onClose,
  onMarkedRead
}: Props) {
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView | null>(null);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const orderedComments = useMemo(
    () =>
      [...comments].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
    [comments]
  );
  const isReadOnly = report?.status === "resolved";

  async function loadComments(mode: "initial" | "silent" = "initial") {
    if (!report) {
      return;
    }

    if (mode === "initial") {
      setIsLoading(true);
      setErrorMessage("");
    }

    try {
      const items = await listReportComments(report.id);
      setComments(items);

      const latestTimestamp = items.reduce<string | null>((latest, item) => {
        if (!latest) {
          return item.createdAt;
        }

        return new Date(item.createdAt).getTime() > new Date(latest).getTime()
          ? item.createdAt
          : latest;
      }, null);

      if (latestTimestamp) {
        onMarkedRead?.(report.id, latestTimestamp);
      }
    } catch (error) {
      if (mode === "initial") {
        setErrorMessage(
          error instanceof Error ? error.message : t.chat.loadCommentsFailed
        );
      }
    } finally {
      if (mode === "initial") {
        setIsLoading(false);
      }
    }
  }

  async function handleSend() {
    if (!report) {
      return;
    }

    const message = draftMessage.trim();
    if (!message) {
      setErrorMessage(t.chat.messageRequired);
      return;
    }

    setIsSending(true);
    setErrorMessage("");

    try {
      const created = await createReportComment(report.id, message);
      setComments((current) => [...current, created]);
      setDraftMessage("");
      onMarkedRead?.(report.id, created.createdAt);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.chat.sendMessageFailed
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleCancelDraft() {
    setDraftMessage("");
    setErrorMessage("");
  }

  useEffect(() => {
    if (!visible || !report) {
      return;
    }

    void loadComments("initial");

    const interval = setInterval(() => {
      void loadComments("silent");
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [report?.id, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [orderedComments.length, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>{t.chat.title}</Text>
              {report ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {report.description}
                </Text>
              ) : null}
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>{t.common.hide}</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {isLoading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" />
              </View>
            ) : (
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.messagesContent}
                style={styles.messagesList}
              >
                {orderedComments.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t.chat.empty}</Text>
                  </View>
                ) : (
                  orderedComments.map((comment) => {
                    const isOwnMessage =
                      Boolean(currentUserId) && comment.authorUserId === currentUserId;

                    return (
                      <View
                        key={comment.id}
                        style={[
                          styles.messageRow,
                          isOwnMessage ? styles.messageRowOwn : null
                        ]}
                      >
                        <View
                          style={[
                            styles.messageBubble,
                            isOwnMessage ? styles.messageBubbleOwn : null
                          ]}
                        >
                          <Text style={styles.messageAuthor}>
                            {isOwnMessage
                              ? t.chat.you
                              : comment.authorDisplayName ?? t.chat.anonymous}
                          </Text>
                          <Text
                            style={[
                              styles.messageText,
                              isOwnMessage ? styles.messageTextOwn : null
                            ]}
                          >
                            {comment.message}
                          </Text>
                          <Text style={styles.messageMeta}>
                            {new Date(comment.createdAt).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {isReadOnly ? (
            <View style={styles.readOnlyBox}>
              <Text style={styles.readOnlyText}>{t.chat.resolvedReadOnly}</Text>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                value={draftMessage}
                onChangeText={setDraftMessage}
                placeholder={t.chat.messagePlaceholder}
                placeholderTextColor="#94a3b8"
                style={styles.input}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />
              <View style={styles.inputActions}>
                <Pressable style={styles.cancelButton} onPress={handleCancelDraft}>
                  <Text style={styles.cancelButtonText}>{t.common.cancel}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.sendButton,
                    isSending ? styles.sendButtonDisabled : null
                  ]}
                  disabled={isSending}
                  onPress={() => void handleSend()}
                >
                  <Text style={styles.sendButtonText}>
                    {isSending ? t.chat.sending : t.chat.send}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  card: {
    flex: 1,
    backgroundColor: "#f8fafc",
    overflow: "hidden"
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d7dbe0",
    backgroundColor: "#ffffff"
  },
  headerTextBlock: {
    flex: 1,
    marginRight: 10
  },
  title: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 4
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 18
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  closeText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 12
  },
  body: {
    flex: 1,
    minHeight: 280
  },
  loadingBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32
  },
  messagesList: {
    flex: 1
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: "center"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center"
  },
  messageRow: {
    marginBottom: 10,
    alignItems: "flex-start"
  },
  messageRowOwn: {
    alignItems: "flex-end"
  },
  messageBubble: {
    maxWidth: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  messageBubbleOwn: {
    backgroundColor: "#eaf3ff",
    borderColor: "#bfd9ff"
  },
  messageAuthor: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4
  },
  messageText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20
  },
  messageTextOwn: {
    color: "#0b3f76"
  },
  messageMeta: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 6
  },
  error: {
    color: "#b91c1c",
    paddingHorizontal: 14,
    paddingBottom: 8
  },
  readOnlyBox: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#d7dbe0",
    backgroundColor: "#ffffff"
  },
  readOnlyText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600"
  },
  inputRow: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#d7dbe0",
    backgroundColor: "#ffffff"
  },
  input: {
    minHeight: 86,
    maxHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    marginBottom: 10
  },
  inputActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  cancelButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  cancelButtonText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 13
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0b6bcb"
  },
  sendButtonDisabled: {
    opacity: 0.7
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13
  }
});
