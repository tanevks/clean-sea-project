"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createInitiativeComment,
  fetchMe,
  listInitiativeComments,
  listPublicInitiativeComments,
  listPublishedInitiatives,
  submitInitiative,
  type InitiativeCommentItem,
  type PublicInitiativeItem
} from "../../lib/api";
import {
  loadInitiativeChatReadState,
  markInitiativeChatRead
} from "../../lib/initiativeChatReadState";
import { useWebI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

export default function PublicInitiativesPage() {
  const { t } = useWebI18n();
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<PublicInitiativeItem[]>([]);
  const [chatReadState, setChatReadState] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState("");
  const [comments, setComments] = useState<InitiativeCommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [profileDefaults, setProfileDefaults] = useState({
    submitterName: "",
    submitterEmail: "",
    submitterPhone: ""
  });
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterPhone, setSubmitterPhone] = useState("");
  const [category, setCategory] = useState<"idea" | "initiative">("idea");
  const [initiativeTitle, setInitiativeTitle] = useState("");
  const [initiativeDescription, setInitiativeDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [openDocument, setOpenDocument] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const isGuest = !hasSession;

  useEffect(() => {
    setChatReadState(loadInitiativeChatReadState());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!cancelled) {
        setHasSession(Boolean(session));
      }
    }

    void loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSession) {
      setProfileDefaults({
        submitterName: "",
        submitterEmail: "",
        submitterPhone: ""
      });
      return;
    }

    let cancelled = false;

    async function loadProfileDefaults() {
      try {
        const me = await fetchMe();
        if (cancelled) {
          return;
        }

        const nextDefaults = {
          submitterName: me.nickname ?? me.displayName ?? me.email ?? "",
          submitterEmail: me.email ?? "",
          submitterPhone: me.contactPhone ?? me.phone ?? ""
        };

        setProfileDefaults(nextDefaults);
        setSubmitterName(nextDefaults.submitterName);
        setSubmitterEmail(nextDefaults.submitterEmail);
        setSubmitterPhone(nextDefaults.submitterPhone);
      } catch {
        if (!cancelled) {
          setProfileDefaults({
            submitterName: "",
            submitterEmail: "",
            submitterPhone: ""
          });
        }
      }
    }

    void loadProfileDefaults();

    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems(mode: "initial" | "silent" = "initial") {
      if (mode === "initial") {
        setIsLoading(true);
        setErrorMessage("");
      }

      try {
        const nextItems = await listPublishedInitiatives();
        if (!cancelled) {
          setItems(nextItems);
          setSelectedId((current) => {
            if (current && nextItems.some((item) => item.id === current)) {
              return current;
            }
            return nextItems[0]?.id ?? "";
          });
        }
      } catch (error) {
        if (!cancelled && mode === "initial") {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load initiatives."
          );
        }
      } finally {
        if (!cancelled && mode === "initial") {
          setIsLoading(false);
        }
      }
    }

    void loadItems("initial");

    const intervalId = window.setInterval(() => {
      void loadItems("silent");
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  function getPublicCommentCount(item: PublicInitiativeItem) {
    return item.commentSummary?.publicCommentCount ?? 0;
  }

  function hasUnreadComments(item: PublicInitiativeItem) {
    const latestPublicCommentAt = item.commentSummary?.latestPublicCommentAt;
    if (!latestPublicCommentAt) {
      return false;
    }

    const lastReadAt = chatReadState[item.id];
    if (!lastReadAt) {
      return getPublicCommentCount(item) > 0;
    }

    return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime();
  }

  useEffect(() => {
    if (!selectedItem) {
      setComments([]);
      return;
    }

    let cancelled = false;
    const selectedInitiativeId = selectedItem.id;
    const selectedLatestPublicCommentAt =
      selectedItem.commentSummary?.latestPublicCommentAt ?? null;

    async function loadComments(mode: "initial" | "silent" = "initial") {
      if (mode === "initial") {
        setIsLoadingComments(true);
        setCommentError("");
      }

      try {
        const nextComments = hasSession
          ? await listInitiativeComments(selectedInitiativeId)
          : await listPublicInitiativeComments(selectedInitiativeId);
        if (!cancelled) {
          setComments(nextComments);
          const latestCommentAt =
            nextComments.reduce<string | null>((latest, item) => {
              if (!latest || new Date(item.createdAt).getTime() > new Date(latest).getTime()) {
                return item.createdAt;
              }
              return latest;
            }, null) ?? selectedLatestPublicCommentAt;

          markInitiativeChatRead(selectedInitiativeId, latestCommentAt);
          setChatReadState(loadInitiativeChatReadState());
        }
      } catch (error) {
        if (!cancelled && mode === "initial") {
          setCommentError(
            error instanceof Error ? error.message : "Failed to load comments."
          );
        }
      } finally {
        if (!cancelled && mode === "initial") {
          setIsLoadingComments(false);
        }
      }
    }

    void loadComments("initial");

    const intervalId = window.setInterval(() => {
      void loadComments("silent");
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasSession, selectedItem?.commentSummary?.latestPublicCommentAt, selectedItem?.id]);

  async function onSubmitInitiative() {
    setIsSubmitting(true);
    setErrorMessage("");
    setSubmitSuccess("");

    try {
      await submitInitiative({
        submitterName,
        submitterEmail,
        submitterPhone,
        category,
        title: initiativeTitle,
        description: initiativeDescription
      });

      if (hasSession) {
        setSubmitterName(profileDefaults.submitterName);
        setSubmitterEmail(profileDefaults.submitterEmail);
        setSubmitterPhone(profileDefaults.submitterPhone);
      } else {
        setSubmitterName("");
        setSubmitterEmail("");
        setSubmitterPhone("");
      }
      setCategory("idea");
      setInitiativeTitle("");
      setInitiativeDescription("");
      setSubmitSuccess(t.dashboard.submitted);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit initiative."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSendComment() {
    if (!selectedItem) {
      return;
    }

    const message = draftComment.trim();
    if (!message) {
      setCommentError(t.initiatives.messageRequired);
      return;
    }

    setIsSendingComment(true);
    setCommentError("");

    try {
      const created = await createInitiativeComment(selectedItem.id, {
        message,
        visibility: "public"
      });
      setComments((current) => [...current, created]);
      setItems((current) =>
        current.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                commentSummary: {
                  publicCommentCount: (item.commentSummary?.publicCommentCount ?? 0) + 1,
                  latestPublicCommentAt: created.createdAt
                }
              }
            : item
        )
      );
      markInitiativeChatRead(selectedItem.id, created.createdAt);
      setChatReadState(loadInitiativeChatReadState());
      setDraftComment("");
    } catch (error) {
      setCommentError(
        error instanceof Error ? error.message : "Failed to send comment."
      );
    } finally {
      setIsSendingComment(false);
    }
  }

  function focusSubmitForm() {
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 160);
  }

  useEffect(() => {
    if (!openDocument) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "c" || key === "p" || key === "s") {
        event.preventDefault();
      }
    };

    const preventDefault = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("contextmenu", preventDefault);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("contextmenu", preventDefault);
    };
  }, [openDocument]);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>Clean Sea</div>
          <h1 style={styles.title}>{t.initiatives.title}</h1>
          <p style={styles.subtitle}>{t.initiatives.publicSubtitle}</p>
        </div>
        <div style={styles.heroActions}>
          <button
            type="button"
            disabled={isGuest}
            onClick={focusSubmitForm}
            style={{
              ...styles.primaryButton,
              ...(isGuest ? styles.buttonDisabled : null)
            }}
          >
            {t.dashboard.createInitiative}
          </button>
        </div>
      </section>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      <section style={styles.layout}>
        <div style={styles.listCard}>
          <h2 style={styles.sectionTitle}>{t.dashboard.publishedInitiatives}</h2>
          {isLoading ? (
            <div style={styles.emptyState}>{t.common.loading}</div>
          ) : items.length === 0 ? (
            <div style={styles.emptyState}>{t.dashboard.noPublishedInitiatives}</div>
          ) : (
            <div style={styles.listWrap}>
              {items.map((item) => {
                const isActive = selectedId === item.id;
                const commentCount = getPublicCommentCount(item);
                const unread = hasUnreadComments(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      ...styles.listItem,
                      ...(isActive ? styles.listItemActive : null)
                    }}
                  >
                    <div style={styles.itemMetaRow}>
                      <div style={styles.metaPills}>
                        <span style={styles.categoryPill}>
                          {item.category === "idea"
                            ? t.dashboard.idea
                            : t.dashboard.initiative}
                        </span>
                        <span style={styles.statusPill}>{t.initiatives[item.status]}</span>
                      </div>
                      <span style={styles.itemDate}>
                        {new Date(item.publishedAt ?? item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={styles.itemTitle}>{item.title}</div>
                    <div style={styles.itemAuthor}>{item.submitterName}</div>
                    <div style={styles.itemFooter}>
                      <span
                        style={{
                          ...styles.chatBadge,
                          ...(unread ? styles.chatBadgeUnread : null)
                        }}
                      >
                        {t.initiatives.comments}: {commentCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.detailColumn}>
          <div style={styles.detailCard}>
            <h2 style={styles.sectionTitle}>{t.initiatives.selectedInitiative}</h2>
            {!selectedItem ? (
              <div style={styles.emptyState}>{t.dashboard.noPublishedInitiatives}</div>
            ) : (
              <>
                <div style={styles.itemMetaRow}>
                  <div style={styles.metaPills}>
                    <span style={styles.categoryPill}>
                      {selectedItem.category === "idea"
                        ? t.dashboard.idea
                        : t.dashboard.initiative}
                    </span>
                    <span style={styles.statusPill}>{t.initiatives[selectedItem.status]}</span>
                  </div>
                  <span style={styles.itemDate}>
                    {t.initiatives.publishedAt}:{" "}
                    {new Date(selectedItem.publishedAt ?? selectedItem.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 style={styles.detailTitle}>{selectedItem.title}</h3>
                <p style={styles.detailBody}>{selectedItem.description}</p>
                <div style={styles.detailMeta}>
                  {t.initiatives.submittedBy}: {selectedItem.submitterName}
                </div>

                {selectedItem.implementationPlan || selectedItem.implementationReport ? (
                  <div style={styles.documentActionRow}>
                    {selectedItem.implementationPlan ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenDocument({
                            title: t.initiatives.implementationPlan,
                            body: selectedItem.implementationPlan ?? ""
                          })
                        }
                        style={styles.secondaryButton}
                      >
                        {t.initiatives.openPlan}
                      </button>
                    ) : null}
                    {selectedItem.implementationReport ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenDocument({
                            title: t.initiatives.implementationReport,
                            body: selectedItem.implementationReport ?? ""
                          })
                        }
                        style={styles.secondaryButton}
                      >
                        {t.initiatives.openReportDoc}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div style={styles.commentsSection}>
                  <h3 style={styles.commentsTitle}>{t.initiatives.comments}</h3>
                  {isLoadingComments ? (
                    <div style={styles.emptyState}>{t.common.loading}</div>
                  ) : comments.length === 0 ? (
                    <div style={styles.emptyState}>{t.initiatives.noComments}</div>
                  ) : (
                    <div style={styles.commentsList}>
                      {[...comments]
                        .sort(
                          (left, right) =>
                            new Date(left.createdAt).getTime() -
                            new Date(right.createdAt).getTime()
                        )
                        .map((comment) => (
                          <div key={comment.id} style={styles.commentCard}>
                            <div style={styles.commentMeta}>
                              <strong>
                                {comment.authorDisplayName ?? t.dashboard.unknownUser}
                              </strong>
                              <span>
                                {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div style={styles.commentMessage}>{comment.message}</div>
                          </div>
                        ))}
                    </div>
                  )}

                  {hasSession ? (
                    <>
                      {commentError ? <div style={styles.commentError}>{commentError}</div> : null}
                      <textarea
                        value={draftComment}
                        onChange={(event) => setDraftComment(event.target.value)}
                        placeholder={t.initiatives.commentPlaceholder}
                        style={styles.textarea}
                      />
                      <div style={styles.actionRow}>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftComment("");
                            setCommentError("");
                          }}
                          style={styles.secondaryButton}
                        >
                          {t.common.close}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onSendComment()}
                          style={styles.primaryButton}
                        >
                          {isSendingComment ? t.dashboard.submitting : t.initiatives.sendComment}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={styles.readOnlyInfo}>{t.initiatives.readOnlyGuestComments}</div>
                  )}
                </div>
              </>
            )}
          </div>

          <div ref={formCardRef} style={styles.formCard}>
            <h2 style={styles.sectionTitle}>{t.dashboard.submitInitiative}</h2>
            {submitSuccess ? <div style={styles.successBox}>{submitSuccess}</div> : null}
            {isGuest ? <div style={styles.readOnlyInfo}>{t.common.loginRequired}</div> : null}
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.submitterName}</label>
              <input
                type="text"
                disabled={isGuest}
                value={submitterName}
                onChange={(event) => setSubmitterName(event.target.value)}
                style={{ ...styles.input, ...(isGuest ? styles.disabledField : null) }}
              />
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.submitterEmail}</label>
              <input
                type="email"
                disabled={isGuest}
                value={submitterEmail}
                onChange={(event) => setSubmitterEmail(event.target.value)}
                style={{ ...styles.input, ...(isGuest ? styles.disabledField : null) }}
              />
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.submitterPhone}</label>
              <input
                type="text"
                disabled={isGuest}
                value={submitterPhone}
                onChange={(event) => setSubmitterPhone(event.target.value)}
                style={{ ...styles.input, ...(isGuest ? styles.disabledField : null) }}
              />
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.category}</label>
              <select
                disabled={isGuest}
                value={category}
                onChange={(event) => setCategory(event.target.value as "idea" | "initiative")}
                style={{ ...styles.select, ...(isGuest ? styles.disabledField : null) }}
              >
                <option value="idea">{t.dashboard.idea}</option>
                <option value="initiative">{t.dashboard.initiative}</option>
              </select>
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.initiativeTitle}</label>
              <input
                ref={titleInputRef}
                type="text"
                disabled={isGuest}
                value={initiativeTitle}
                onChange={(event) => setInitiativeTitle(event.target.value)}
                style={{ ...styles.input, ...(isGuest ? styles.disabledField : null) }}
              />
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>{t.dashboard.initiativeDescription}</label>
              <textarea
                disabled={isGuest}
                value={initiativeDescription}
                onChange={(event) => setInitiativeDescription(event.target.value)}
                style={{ ...styles.textarea, ...(isGuest ? styles.disabledField : null) }}
              />
            </div>
            <button
              type="button"
              disabled={isGuest || isSubmitting}
              onClick={() => void onSubmitInitiative()}
              style={{
                ...styles.primaryButton,
                ...(isGuest ? styles.disabledButton : null)
              }}
            >
              {isSubmitting ? t.dashboard.submitting : t.dashboard.submit}
            </button>
          </div>
        </div>
      </section>

      {openDocument ? (
        <>
          <style>{`@media print { .initiative-document-modal { display: none !important; } }`}</style>
          <div
            className="initiative-document-modal"
            style={styles.modalOverlay}
            onClick={() => setOpenDocument(null)}
          >
            <div
              style={styles.modalCard}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>{openDocument.title}</h2>
                <button
                  type="button"
                  onClick={() => setOpenDocument(null)}
                  style={styles.secondaryButton}
                >
                  {t.initiatives.closeDocument}
                </button>
              </div>
              <div style={styles.modalHint}>{t.initiatives.webOnlyDocumentHint}</div>
              <div style={styles.modalBody}>{openDocument.body}</div>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "24px 24px 56px"
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    marginBottom: 22,
    padding: 24,
    borderRadius: 24,
    background:
      "linear-gradient(135deg, #082f49 0%, #155e75 46%, #f0fdf4 140%)",
    color: "#f8fafc"
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 8
  },
  title: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.05
  },
  subtitle: {
    maxWidth: 720,
    marginTop: 12,
    marginBottom: 0,
    color: "rgba(255,255,255,0.82)",
    fontSize: 16,
    lineHeight: 1.6
  },
  heroActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0
  },
  errorBox: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "380px minmax(0, 1fr)",
    gap: 18
  },
  listCard: {
    padding: 18,
    borderRadius: 22,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  detailColumn: {
    display: "grid",
    gap: 16,
    alignContent: "start"
  },
  detailCard: {
    padding: 18,
    borderRadius: 22,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  formCard: {
    padding: 18,
    borderRadius: 22,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 16,
    color: "#0f172a",
    fontSize: 20
  },
  listWrap: {
    display: "grid",
    gap: 10
  },
  listItem: {
    textAlign: "left",
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe5ec",
    background: "#f8fafc",
    padding: 14,
    cursor: "pointer"
  },
  listItemActive: {
    borderColor: "#0f766e",
    boxShadow: "0 0 0 2px rgba(15, 118, 110, 0.12)"
  },
  itemMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8
  },
  metaPills: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  categoryPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#ecfccb",
    color: "#3f6212",
    fontSize: 12,
    fontWeight: 800
  },
  itemDate: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600
  },
  itemTitle: {
    color: "#0f172a",
    fontWeight: 800,
    marginBottom: 8
  },
  itemAuthor: {
    color: "#475569",
    fontSize: 13
  },
  itemFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 10
  },
  chatBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 800
  },
  chatBadgeUnread: {
    background: "#fee2e2",
    color: "#b91c1c"
  },
  detailTitle: {
    marginTop: 0,
    marginBottom: 8,
    color: "#0f172a",
    fontSize: 24
  },
  detailBody: {
    color: "#334155",
    lineHeight: 1.7,
    marginBottom: 14
  },
  detailMeta: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700
  },
  documentActionRow: {
    display: "flex",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
    flexWrap: "wrap"
  },
  commentsSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #e2e8f0"
  },
  commentsTitle: {
    marginTop: 0,
    marginBottom: 12,
    color: "#0f172a",
    fontSize: 18
  },
  commentsList: {
    display: "grid",
    gap: 10,
    marginBottom: 12
  },
  commentCard: {
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: 12
  },
  commentMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12,
    marginBottom: 6
  },
  commentMessage: {
    color: "#0f172a",
    lineHeight: 1.6
  },
  commentError: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    background: "#fee2e2",
    color: "#991b1b"
  },
  readOnlyInfo: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe"
  },
  disabledField: {
    opacity: 0.6,
    cursor: "not-allowed",
    background: "#f8fafc"
  },
  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  formRow: {
    marginBottom: 12
  },
  formLabel: {
    display: "block",
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6
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
    minHeight: 120,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: 12,
    resize: "vertical",
    fontSize: 14,
    fontFamily: "inherit"
  },
  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10
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
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    background: "#ffffff",
    color: "#0f172a",
    padding: "12px 16px",
    fontWeight: 800,
    cursor: "pointer"
  },
  successBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #86efac"
  },
  emptyState: {
    color: "#64748b"
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.6)",
    display: "grid",
    placeItems: "center",
    padding: 24,
    zIndex: 50
  },
  modalCard: {
    width: "min(860px, 100%)",
    maxHeight: "88vh",
    overflow: "auto",
    borderRadius: 24,
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
    padding: 22
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12
  },
  modalTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 24
  },
  modalHint: {
    marginBottom: 14,
    padding: 10,
    borderRadius: 12,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe"
  },
  modalBody: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.8,
    color: "#0f172a",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 18,
    userSelect: "none",
    WebkitUserSelect: "none"
  }
};
