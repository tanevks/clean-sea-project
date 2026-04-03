import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { InitiativeChatModal } from "./InitiativeChatModal";
import {
  getInitiativeChatReadState,
  markInitiativeChatRead,
  type InitiativeChatReadState
} from "../../lib/initiativeChatReadState";
import { useI18n } from "../../lib/i18n";
import {
  listPublishedInitiatives,
  type InitiativeSummary
} from "../../lib/initiativesApi";

export function InitiativesScreen({
  focusInitiativeId,
  focusCommentId,
  focusNonce,
  onUnreadStateChange,
  onFocusedInitiativeHandled
}: {
  focusInitiativeId?: string | null;
  focusCommentId?: string | null;
  focusNonce?: number;
  onUnreadStateChange?: (count: number) => void;
  onFocusedInitiativeHandled?: () => void;
}) {
  const { t } = useI18n();
  const unreadPulse = useRef(new Animated.Value(1)).current;
  const [items, setItems] = useState<InitiativeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedItem, setSelectedItem] = useState<InitiativeSummary | null>(null);
  const [chatReadState, setChatReadState] = useState<InitiativeChatReadState>({});

  async function loadItems(mode: "initial" | "manual" | "silent" = "initial") {
    if (mode === "initial") {
      setIsLoading(true);
    }
    if (mode === "manual") {
      setIsRefreshing(true);
    }

    try {
      const nextItems = await listPublishedInitiatives();
      setItems(nextItems);
      setErrorMessage("");
    } catch (error) {
      if (mode !== "silent") {
        setErrorMessage(
          error instanceof Error ? error.message : t.initiatives.loadFailed
        );
      }
    } finally {
      if (mode === "initial") {
        setIsLoading(false);
      }
      if (mode === "manual") {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadItems("initial");
    void getInitiativeChatReadState().then(setChatReadState);

    const interval = setInterval(() => {
      void loadItems("silent");
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!focusInitiativeId || items.length === 0) {
      return;
    }

    const target = items.find((item) => item.id === focusInitiativeId);
    if (!target) {
      return;
    }

    setSelectedItem(target);
    onFocusedInitiativeHandled?.();
  }, [focusInitiativeId, focusNonce, items, onFocusedInitiativeHandled]);

  function getPublicCommentCount(item: InitiativeSummary) {
    return item.commentSummary?.publicCommentCount ?? 0;
  }

  function hasUnreadComments(item: InitiativeSummary) {
    const latestPublicCommentAt = item.commentSummary?.latestPublicCommentAt;
    const publicCommentCount = item.commentSummary?.publicCommentCount ?? 0;
    const lastReadAt = chatReadState[item.id];

    if (!latestPublicCommentAt || publicCommentCount === 0) {
      return false;
    }

    if (!lastReadAt) {
      return true;
    }

    return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime();
  }

  const hasAnyUnreadComments = useMemo(
    () => items.some((item) => hasUnreadComments(item)),
    [items, chatReadState]
  );

  const unreadThreadCount = useMemo(
    () => items.filter((item) => hasUnreadComments(item)).length,
    [items, chatReadState]
  );

  useEffect(() => {
    if (!hasAnyUnreadComments) {
      unreadPulse.stopAnimation();
      unreadPulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(unreadPulse, {
          toValue: 0.55,
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

    animation.start();

    return () => {
      animation.stop();
      unreadPulse.setValue(1);
    };
  }, [hasAnyUnreadComments, unreadPulse]);

  useEffect(() => {
    onUnreadStateChange?.(unreadThreadCount);
  }, [onUnreadStateChange, unreadThreadCount]);

  async function handleMarkedRead(initiativeId: string, timestamp: string) {
    const nextState = await markInitiativeChatRead(initiativeId, timestamp);
    setChatReadState(nextState);
  }

  return (
    <View style={styles.screen}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadItems("manual")}
            />
          }
          contentContainerStyle={styles.content}
        >
          <Text style={styles.title}>{t.initiatives.title}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.initiatives.empty}</Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.metaRow}>
                  <View style={styles.metaPills}>
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryText}>
                        {item.category === "idea" ? "IDEA" : "INIT"}
                      </Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{t.initiatives[item.status]}</Text>
                    </View>
                  </View>
                  <Text style={styles.dateText}>
                    {t.initiatives.publishedAt}:{" "}
                    {new Date(item.publishedAt ?? item.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
                <Text style={styles.authorText}>
                  {t.initiatives.submittedBy}: {item.submitterName}
                </Text>

                <View style={styles.actionRow}>
                  <Animated.View
                    style={
                      hasUnreadComments(item)
                        ? { opacity: unreadPulse, transform: [{ scale: unreadPulse }] }
                        : undefined
                    }
                  >
                  <Pressable
                    style={[
                      styles.chatButton,
                      hasUnreadComments(item) ? styles.chatButtonUnread : null
                    ]}
                    onPress={() => setSelectedItem(item)}
                  >
                    <Text style={styles.chatButtonText}>{t.chat.open}</Text>
                    {getPublicCommentCount(item) > 0 ? (
                      <View style={styles.chatBadge}>
                        <Text style={styles.chatBadgeText}>
                          {getPublicCommentCount(item)}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  </Animated.View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <InitiativeChatModal
        initiative={selectedItem}
        focusCommentId={focusCommentId}
        visible={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onMarkedRead={handleMarkedRead}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    padding: 14,
    paddingBottom: 22
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 14
  },
  error: {
    color: "#b91c1c",
    marginBottom: 12
  },
  emptyBox: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    padding: 18
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center"
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    padding: 16,
    marginBottom: 12
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  },
  metaPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1
  },
  categoryPill: {
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  categoryText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "800"
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "800"
  },
  dateText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right"
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
  },
  cardBody: {
    color: "#334155",
    lineHeight: 20,
    marginBottom: 12
  },
  authorText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600"
  },
  actionRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  chatButton: {
    borderRadius: 14,
    backgroundColor: "#0b6bcb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center"
  },
  chatButtonUnread: {
    backgroundColor: "#b91c1c"
  },
  chatButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  chatBadge: {
    marginLeft: 8,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "#ffffff"
  },
  chatBadgeText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800"
  }
});
