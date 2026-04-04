import { useCallback, useEffect, useState, type ReactNode } from "react";
import * as Linking from "expo-linking";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { completeAuthSessionFromUrl, signOut } from "./lib/auth";
import { getChatReadState } from "./lib/chatReadState";
import { getInitiativeChatReadState } from "./lib/initiativeChatReadState";
import { LanguageProvider, useI18n } from "./lib/i18n";
import { listPublishedInitiatives } from "./lib/initiativesApi";
import { listUserNotifications } from "./lib/notificationsApi";
import { listReports } from "./lib/reportsApi";
import {
  clearSharedText,
  getInitialSharedText,
  subscribeToSharedText
} from "./lib/shareIntent";
import { fetchProfile } from "./lib/profileApi";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import { ForgotPasswordScreen } from "./screens/auth/ForgotPasswordScreen";
import { LoginScreen } from "./screens/auth/LoginScreen";
import { ResetPasswordScreen } from "./screens/auth/ResetPasswordScreen";
import { SignUpScreen } from "./screens/auth/SignUpScreen";
import { InitiativesScreen } from "./screens/initiatives/InitiativesScreen";
import { ProfileScreen } from "./screens/profile/ProfileScreen";
import { NewReportScreen } from "./screens/reports/NewReportScreen";
import { ReportsScreen } from "./screens/reports/ReportsScreen";

type AuthScreen = "login" | "signup" | "forgot" | "reset";
type AppTab = "reports" | "initiatives" | "new-report" | "profile";

function BulgarianFlagBadge() {
  return (
    <View style={styles.flagFrame}>
      <View style={[styles.flagStripe, { backgroundColor: "#ffffff" }]} />
      <View style={[styles.flagStripe, { backgroundColor: "#1fa34a" }]} />
      <View style={[styles.flagStripe, { backgroundColor: "#d62612" }]} />
    </View>
  );
}

function UkFlagBadge() {
  return (
    <View style={[styles.flagFrame, styles.ukFlag]}>
      <View style={styles.ukWhiteHorizontal} />
      <View style={styles.ukWhiteVertical} />
      <View style={styles.ukRedHorizontal} />
      <View style={styles.ukRedVertical} />
    </View>
  );
}

function AppShell() {
  const { language, setLanguage, t } = useI18n();
  const profileTabLabel = language === "bg" ? "\u041f\u0440\u043e\u0444\u0438\u043b" : "Profile";
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [activeTab, setActiveTab] = useState<AppTab>("reports");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);
  const [unreadReportThreadCount, setUnreadReportThreadCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadInitiativeThreadCount, setUnreadInitiativeThreadCount] = useState(0);
  const [currentNickname, setCurrentNickname] = useState("");
  const [pendingSharedText, setPendingSharedText] = useState("");
  const [pendingSharedNonce, setPendingSharedNonce] = useState(0);
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);
  const [focusedReportNonce, setFocusedReportNonce] = useState(0);
  const [focusedInitiativeId, setFocusedInitiativeId] = useState<string | null>(null);
  const [focusedInitiativeCommentId, setFocusedInitiativeCommentId] = useState<string | null>(null);
  const [focusedInitiativeNonce, setFocusedInitiativeNonce] = useState(0);
  const [authNotice, setAuthNotice] = useState("");

  const getBlockedAccountMessage = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("Account approval is pending.")) {
      return "Профилът ви очаква одобрение от администратор.";
    }

    if (message.includes("Account access was rejected.")) {
      return "Достъпът до профила ви не е одобрен.";
    }

    if (message.includes("Account is inactive.")) {
      return "Профилът е деактивиран.";
    }

    return null;
  }, []);

  const handleBlockedAccount = useCallback(async (message?: string) => {
    await signOut();
    setIsAuthenticated(false);
    setCurrentNickname("");
    setUnreadNotificationCount(0);
    setUnreadReportThreadCount(0);
    setUnreadInitiativeThreadCount(0);
    setScreen("login");
    setAuthNotice(message ?? "Профилът ви очаква одобрение от администратор.");
  }, []);

  const refreshUnreadNotificationCount = useCallback(async () => {
    try {
      const notifications = await listUserNotifications();
      setUnreadNotificationCount(
        notifications.filter((item) => !item.isRead).length
      );
    } catch {
      setUnreadNotificationCount(0);
    }
  }, []);

  const refreshUnreadReportThreadCount = useCallback(async () => {
    try {
      const [items, readState] = await Promise.all([listReports(), getChatReadState()]);

      const unreadCount = items.reduce((count, item) => {
        const latestPublicCommentAt = item.commentSummary?.latestPublicCommentAt;
        const publicCommentCount = item.commentSummary?.publicCommentCount ?? 0;
        const lastReadAt = readState[item.id];

        if (!latestPublicCommentAt || publicCommentCount === 0) {
          return count;
        }

        if (!lastReadAt) {
          return count + 1;
        }

        return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime()
          ? count + 1
          : count;
      }, 0);

      setUnreadReportThreadCount(unreadCount);
    } catch {
      setUnreadReportThreadCount(0);
    }
  }, []);

  const refreshUnreadInitiativeThreadCount = useCallback(async () => {
    try {
      const [items, readState] = await Promise.all([
        listPublishedInitiatives(),
        getInitiativeChatReadState()
      ]);

      const unreadCount = items.reduce((count, item) => {
        const latestPublicCommentAt = item.commentSummary?.latestPublicCommentAt;
        const publicCommentCount = item.commentSummary?.publicCommentCount ?? 0;
        const lastReadAt = readState[item.id];

        if (!latestPublicCommentAt || publicCommentCount === 0) {
          return count;
        }

        if (!lastReadAt) {
          return count + 1;
        }

        return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime()
          ? count + 1
          : count;
      }, 0);

      setUnreadInitiativeThreadCount(unreadCount);
    } catch {
      setUnreadInitiativeThreadCount(0);
    }
  }, []);

  useEffect(() => {
    async function applyAuthUrl(url: string) {
      const result = await completeAuthSessionFromUrl(url);

      if (result.flowType === "recovery" || url.includes("auth/reset-password")) {
        setScreen("reset");
      }

      if (result.completed) {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        setIsAuthenticated(Boolean(session?.user));
      }
    }

    const initialize = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await applyAuthUrl(initialUrl);
      }

      const initialSharedText = await getInitialSharedText();
      if (initialSharedText) {
        setPendingSharedText(initialSharedText);
        setPendingSharedNonce((value) => value + 1);
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      setIsAuthenticated(Boolean(session?.user));
      if (session?.user) {
        try {
          const profile = await fetchProfile();
          setCurrentNickname(
            profile.nickname ?? profile.displayName ?? profile.email ?? ""
          );
        } catch (error) {
          const blockedMessage = getBlockedAccountMessage(error);
          if (blockedMessage) {
            await handleBlockedAccount(blockedMessage);
            setIsBootstrapping(false);
            return;
          }
          setCurrentNickname("");
        }
        await refreshUnreadNotificationCount();
        await refreshUnreadReportThreadCount();
        await refreshUnreadInitiativeThreadCount();
      }
      setIsBootstrapping(false);
    };

    void initialize();

    const subscription = Linking.addEventListener("url", (event) => {
      void applyAuthUrl(event.url);
    });

    const unsubscribeShareIntent = subscribeToSharedText((sharedText) => {
      setPendingSharedText(sharedText);
      setPendingSharedNonce((value) => value + 1);
    });

    const {
      data: { subscription: authSubscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      if (!session?.user) {
        setCurrentNickname("");
        setUnreadNotificationCount(0);
        setUnreadReportThreadCount(0);
        setUnreadInitiativeThreadCount(0);
        return;
      }

      void fetchProfile()
        .then((profile) => {
          setCurrentNickname(
            profile.nickname ?? profile.displayName ?? profile.email ?? ""
          );
          setAuthNotice("");
        })
        .catch((error) => {
          const blockedMessage = getBlockedAccountMessage(error);
          if (blockedMessage) {
            void handleBlockedAccount(blockedMessage);
            return;
          }
          setCurrentNickname("");
        });
      void refreshUnreadNotificationCount();
      void refreshUnreadReportThreadCount();
      void refreshUnreadInitiativeThreadCount();
    });

    return () => {
      subscription.remove();
      unsubscribeShareIntent();
      authSubscription.unsubscribe();
    };
  }, [
    refreshUnreadInitiativeThreadCount,
    refreshUnreadNotificationCount,
    refreshUnreadReportThreadCount,
    getBlockedAccountMessage,
    handleBlockedAccount
  ]);

  useEffect(() => {
    if (isAuthenticated && pendingSharedText) {
      setActiveTab("new-report");
    }
  }, [isAuthenticated, pendingSharedText]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshUnreadNotificationCount();
    void refreshUnreadReportThreadCount();
    void refreshUnreadInitiativeThreadCount();

    const interval = setInterval(() => {
      void refreshUnreadNotificationCount();
      void refreshUnreadReportThreadCount();
      void refreshUnreadInitiativeThreadCount();
    }, 15000);

    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          void refreshUnreadNotificationCount();
          void refreshUnreadReportThreadCount();
          void refreshUnreadInitiativeThreadCount();
        }
      }
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [
    isAuthenticated,
    refreshUnreadInitiativeThreadCount,
    refreshUnreadNotificationCount,
    refreshUnreadReportThreadCount
  ]);

  let content: ReactNode;

  if (isBootstrapping) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (!hasSupabaseConfig) {
    content = (
      <View style={styles.centered}>
        <Text style={styles.envTitle}>{t.app.missingEnvTitle}</Text>
        <Text style={styles.envText}>{t.app.missingEnvText}</Text>
      </View>
    );
  } else if (screen === "reset") {
    content = (
      <ResetPasswordScreen
        onDone={() => {
          setScreen("login");
          setIsAuthenticated(false);
        }}
      />
    );
  } else if (!isAuthenticated) {
    if (screen === "signup") {
      content = (
        <SignUpScreen
          onBackToLogin={() => setScreen("login")}
        />
      );
    } else if (screen === "forgot") {
      content = <ForgotPasswordScreen onBackToLogin={() => setScreen("login")} />;
    } else {
      content = (
        <LoginScreen
          noticeMessage={authNotice}
          onOpenSignUp={() => {
            setAuthNotice("");
            setScreen("signup");
          }}
          onOpenForgotPassword={() => setScreen("forgot")}
          onLoggedIn={() => {
            setAuthNotice("");
            setIsAuthenticated(true);
            setActiveTab("reports");
          }}
        />
      );
    }
  } else {
    content = (
      <View style={styles.appContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t.app.title}</Text>
            {currentNickname ? (
              <Text style={styles.headerSubtitle}>{currentNickname}</Text>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[
                styles.languageButton,
                language === "bg" ? styles.languageButtonActive : null
              ]}
              onPress={() => setLanguage("bg")}
            >
              <BulgarianFlagBadge />
              <Text
                style={[
                  styles.languageText,
                  language === "bg" ? styles.languageTextActive : null
                ]}
              >
                {t.common.bg}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.languageButton,
                language === "en" ? styles.languageButtonActive : null
              ]}
              onPress={() => setLanguage("en")}
            >
              <UkFlagBadge />
              <Text
                style={[
                  styles.languageText,
                  language === "en" ? styles.languageTextActive : null
                ]}
              >
                {t.common.en}
              </Text>
            </Pressable>
            <Pressable
              style={styles.logoutButton}
              onPress={async () => {
                await signOut();
                setScreen("login");
              }}
            >
              <Text style={styles.logoutText}>{t.common.logout}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabBar}>
          <Pressable
            style={[
              styles.tab,
              activeTab === "reports" ? styles.tabActive : null,
              unreadReportThreadCount > 0 && activeTab !== "reports"
                ? styles.reportsTabAttention
                : null
            ]}
            onPress={() => setActiveTab("reports")}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === "reports" ? styles.tabTextActive : null,
                  unreadReportThreadCount > 0 && activeTab !== "reports"
                    ? styles.reportsTabAttentionText
                    : null
                ]}
              >
                {t.app.reportsTab}
              </Text>
              <View
                style={[
                  styles.tabBadge,
                  unreadReportThreadCount > 0 ? styles.reportsTabBadge : null,
                  activeTab === "reports" ? styles.tabBadgeActive : null
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    unreadReportThreadCount > 0 ? styles.reportsTabBadgeText : null,
                    activeTab === "reports" ? styles.tabBadgeTextActive : null
                  ]}
                >
                  {unreadReportThreadCount > 0 ? unreadReportThreadCount : reportsCount}
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              activeTab === "initiatives" ? styles.tabActive : null,
              unreadInitiativeThreadCount > 0 && activeTab !== "initiatives"
                ? styles.initiativesTabAttention
                : null
            ]}
            onPress={() => setActiveTab("initiatives")}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === "initiatives" ? styles.tabTextActive : null,
                  unreadInitiativeThreadCount > 0 && activeTab !== "initiatives"
                    ? styles.initiativesTabAttentionText
                    : null
                ]}
              >
                {t.app.initiativesTab}
              </Text>
              {unreadInitiativeThreadCount > 0 ? (
                <View
                  style={[
                    styles.tabBadge,
                    styles.initiativesTabBadge,
                    activeTab === "initiatives" ? styles.tabBadgeActive : null
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      styles.initiativesTabBadgeText,
                      activeTab === "initiatives" ? styles.tabBadgeTextActive : null
                    ]}
                  >
                    {unreadInitiativeThreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "new-report" ? styles.tabActive : null]}
            onPress={() => setActiveTab("new-report")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "new-report" ? styles.tabTextActive : null
              ]}
            >
              {t.app.newReportTab}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "profile" ? styles.tabActive : null]}
            onPress={() => setActiveTab("profile")}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === "profile" ? styles.tabTextActive : null
                ]}
              >
                {profileTabLabel}
              </Text>
              {unreadNotificationCount > 0 ? (
                <View
                  style={[
                    styles.tabBadge,
                    styles.profileTabBadge,
                    activeTab === "profile" ? styles.tabBadgeActive : null
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      styles.profileTabBadgeText,
                      activeTab === "profile" ? styles.tabBadgeTextActive : null
                    ]}
                  >
                    {unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>

        <View style={styles.content}>
          {activeTab === "reports" ? (
            <ReportsScreen
              refreshKey={reportsRefreshKey}
              focusReportId={focusedReportId}
              focusReportNonce={focusedReportNonce}
              onFocusedReportHandled={() => {
                setFocusedReportId(null);
              }}
              onVisibleCountChange={setReportsCount}
              onUnreadStateChange={setUnreadReportThreadCount}
            />
          ) : activeTab === "initiatives" ? (
            <InitiativesScreen
              focusInitiativeId={focusedInitiativeId}
              focusCommentId={focusedInitiativeCommentId}
              focusNonce={focusedInitiativeNonce}
              onUnreadStateChange={setUnreadInitiativeThreadCount}
              onFocusedInitiativeHandled={() => {
                setFocusedInitiativeId(null);
                setFocusedInitiativeCommentId(null);
              }}
            />
          ) : activeTab === "new-report" ? (
            <NewReportScreen
              onLogout={async () => {
                await signOut();
                setScreen("login");
              }}
              sharedText={pendingSharedText}
              sharedNonce={pendingSharedNonce}
              onSharedTextHandled={() => {
                clearSharedText();
                setPendingSharedText("");
              }}
              onReportCreated={() => {
                setReportsRefreshKey((value) => value + 1);
                setActiveTab("reports");
              }}
            />
          ) : (
            <ProfileScreen
              onUnreadCountChange={setUnreadNotificationCount}
              onOpenReport={(reportId) => {
                setFocusedReportId(reportId);
                setFocusedReportNonce((value) => value + 1);
                setReportsRefreshKey((value) => value + 1);
                setActiveTab("reports");
              }}
              onOpenInitiative={(initiativeId, commentId) => {
                setFocusedInitiativeId(initiativeId);
                setFocusedInitiativeCommentId(commentId ?? null);
                setFocusedInitiativeNonce((value) => value + 1);
                setActiveTab("initiatives");
              }}
            />
          )}
        </View>
      </View>
    );
  }

  return <View style={styles.root}>{content}</View>;
}

export default function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f5f6f8",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
    paddingBottom: Platform.OS === "android" ? 4 : 0
  },
  appContainer: {
    flex: 1,
    backgroundColor: "#f5f6f8"
  },
  content: {
    flex: 1
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  envTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8
  },
  envText: {
    textAlign: "center"
  },
  languageButton: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    marginRight: 6,
    flexDirection: "row",
    alignItems: "center"
  },
  languageButtonActive: {
    backgroundColor: "#0b6bcb",
    borderColor: "#0b6bcb"
  },
  languageText: {
    color: "#334155",
    fontWeight: "700",
    marginLeft: 5,
    fontSize: 11
  },
  languageTextActive: {
    color: "#ffffff"
  },
  flagFrame: {
    width: 18,
    height: 12,
    borderRadius: 3,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.15)",
    backgroundColor: "#ffffff"
  },
  flagStripe: {
    flex: 1
  },
  ukFlag: {
    backgroundColor: "#0a3d91",
    justifyContent: "center",
    alignItems: "center"
  },
  ukWhiteHorizontal: {
    position: "absolute",
    width: "100%",
    height: 5,
    backgroundColor: "#ffffff"
  },
  ukWhiteVertical: {
    position: "absolute",
    width: 5,
    height: "100%",
    backgroundColor: "#ffffff"
  },
  ukRedHorizontal: {
    position: "absolute",
    width: "100%",
    height: 3,
    backgroundColor: "#cf142b"
  },
  ukRedVertical: {
    position: "absolute",
    width: 3,
    height: "100%",
    backgroundColor: "#cf142b"
  },
  header: {
    paddingTop: 4,
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: "#0b1f2a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 19,
    fontWeight: "700"
  },
  headerSubtitle: {
    color: "#bfdbfe",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600"
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center"
  },
  logoutButton: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  logoutText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#dbe7ef"
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: "center"
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  tabActive: {
    backgroundColor: "#ffffff"
  },
  tabText: {
    color: "#486170",
    fontWeight: "600",
    fontSize: 13
  },
  tabTextActive: {
    color: "#0f172a"
  },
  tabBadge: {
    marginLeft: 6,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "#bfd3e2"
  },
  tabBadgeActive: {
    backgroundColor: "#dbe7ef"
  },
  tabBadgeText: {
    color: "#29465a",
    fontSize: 11,
    fontWeight: "700"
  },
  tabBadgeTextActive: {
    color: "#0f172a"
  },
  reportsTabAttention: {
    backgroundColor: "#fee2e2"
  },
  reportsTabAttentionText: {
    color: "#b91c1c"
  },
  reportsTabBadge: {
    backgroundColor: "#fecaca"
  },
  reportsTabBadgeText: {
    color: "#991b1b"
  },
  profileTabBadge: {
    backgroundColor: "#fee2e2"
  },
  profileTabBadgeText: {
    color: "#b91c1c"
  },
  initiativesTabAttention: {
    backgroundColor: "#fee2e2"
  },
  initiativesTabAttentionText: {
    color: "#b91c1c"
  },
  initiativesTabBadge: {
    backgroundColor: "#fecaca"
  },
  initiativesTabBadgeText: {
    color: "#991b1b"
  }
});
