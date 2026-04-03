"use client";

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createInitiativeComment,
  fetchMe,
  listInitiativeComments,
  listInitiatives,
  moderateInitiativeComment,
  updateInitiative,
  type InitiativeCommentItem,
  type InitiativeItem
} from "../../../lib/api";
import { useWebI18n } from "../../../lib/i18n";
import { supabase } from "../../../lib/supabase";

type InitiativeFilter = "all" | InitiativeItem["status"];

export default function InitiativeModerationPage() {
  return (
    <Suspense fallback={<ModerationInitiativesLoading />}>
      <InitiativeModerationPageInner />
    </Suspense>
  );
}

function InitiativeModerationPageInner() {
  const { t } = useWebI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedInitiativeId = searchParams.get("initiativeId") ?? "";
  const requestedCommentId = searchParams.get("commentId") ?? "";
  const [accessState, setAccessState] = useState<
    "unknown" | "anonymous" | "forbidden" | "allowed"
  >("unknown");
  const [currentRole, setCurrentRole] = useState<"citizen" | "moderator" | "admin">("citizen");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [filter, setFilter] = useState<InitiativeFilter>("all");
  const [items, setItems] = useState<InitiativeItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [implementationPlan, setImplementationPlan] = useState("");
  const [implementationReport, setImplementationReport] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"public" | "internal">("public");
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<InitiativeCommentItem[]>([]);
  const [highlightedCommentId, setHighlightedCommentId] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [commentActionId, setCommentActionId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setAccessState("anonymous");
        }
        return;
      }

      try {
        const me = await fetchMe();
        if (me.role !== "moderator" && me.role !== "admin") {
          if (!cancelled) {
            setAccessState("forbidden");
          }
          return;
        }

        if (!cancelled) {
          setCurrentRole(me.role);
          setAccessState("allowed");
        }
      } catch {
        if (!cancelled) {
          setAccessState("anonymous");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accessState !== "allowed") {
      return;
    }

    let cancelled = false;

    async function loadItems() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const nextItems = await listInitiatives(filter);
        if (!cancelled) {
          setItems(nextItems);
          const deepLinkedItem = requestedInitiativeId
            ? nextItems.find((item) => item.id === requestedInitiativeId) ?? null
            : null;

          if (deepLinkedItem) {
            setSelectedId(deepLinkedItem.id);
            setReviewNote(deepLinkedItem.reviewNote ?? "");
            setImplementationPlan(deepLinkedItem.implementationPlan ?? "");
            setImplementationReport(deepLinkedItem.implementationReport ?? "");
          } else if (!selectedId && nextItems[0]) {
            setSelectedId(nextItems[0].id);
            setReviewNote(nextItems[0].reviewNote ?? "");
            setImplementationPlan(nextItems[0].implementationPlan ?? "");
            setImplementationReport(nextItems[0].implementationReport ?? "");
          } else if (selectedId) {
            const nextSelected = nextItems.find((item) => item.id === selectedId) ?? null;
            if (nextSelected) {
              setReviewNote(nextSelected.reviewNote ?? "");
              setImplementationPlan(nextSelected.implementationPlan ?? "");
              setImplementationReport(nextSelected.implementationReport ?? "");
            } else if (nextItems[0]) {
              setSelectedId(nextItems[0].id);
              setReviewNote(nextItems[0].reviewNote ?? "");
              setImplementationPlan(nextItems[0].implementationPlan ?? "");
              setImplementationReport(nextItems[0].implementationReport ?? "");
            } else {
              setSelectedId("");
              setReviewNote("");
              setImplementationPlan("");
              setImplementationReport("");
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load initiatives."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [accessState, filter, requestedInitiativeId, selectedId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const canEditInitiative = currentRole === "admin";

  useEffect(() => {
    if (accessState !== "allowed" || !selectedItem) {
      setComments([]);
      return;
    }

    let cancelled = false;
    const selectedInitiativeId = selectedItem.id;

    async function loadComments(mode: "initial" | "silent" = "initial") {
      if (mode === "initial") {
        setIsLoadingComments(true);
      }

      try {
        const nextComments = await listInitiativeComments(selectedInitiativeId);
        if (!cancelled) {
          setComments(nextComments);
          if (requestedCommentId) {
            const targetComment = nextComments.find((item) => item.id === requestedCommentId);
            if (targetComment) {
              setHighlightedCommentId(requestedCommentId);
              requestAnimationFrame(() => {
                document
                  .getElementById(`initiative-comment-${requestedCommentId}`)
                  ?.scrollIntoView({ block: "center", behavior: "smooth" });
              });
              router.replace(pathname);
            }
          }
        }
      } catch (error) {
        if (!cancelled && mode === "initial") {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load initiative comments."
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
  }, [accessState, pathname, requestedCommentId, router, selectedItem?.id]);

  useEffect(() => {
    if (!highlightedCommentId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedCommentId("");
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedCommentId]);

  async function onUpdate(payload: {
    status?: "approved" | "rejected" | "published" | "executed" | "inactive";
    implementationPlan?: string;
    implementationReport?: string;
  }) {
    if (!selectedItem) {
      return;
    }

    setSavingAction(payload.status ?? (payload.implementationPlan !== undefined
      ? "plan"
      : "report"));
    setErrorMessage("");

    try {
      const updated = await updateInitiative(selectedItem.id, {
        status: payload.status,
        reviewNote,
        implementationPlan: payload.implementationPlan,
        implementationReport: payload.implementationReport
      });

      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setReviewNote(updated.reviewNote ?? "");
      setImplementationPlan(updated.implementationPlan ?? "");
      setImplementationReport(updated.implementationReport ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update initiative."
      );
    } finally {
      setSavingAction("");
    }
  }

  async function onCreateComment() {
    if (!selectedItem) {
      return;
    }

    const message = commentDraft.trim();
    if (!message) {
      setErrorMessage("Message is required.");
      return;
    }

    setSavingAction("comment");
    setErrorMessage("");

    try {
      const created = await createInitiativeComment(selectedItem.id, {
        message,
        visibility: commentVisibility
      });
      setComments((current) => [...current, created]);
      setCommentDraft("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create comment."
      );
    } finally {
      setSavingAction("");
    }
  }

  async function onToggleCommentVisibility(comment: InitiativeCommentItem) {
    if (!selectedItem) {
      return;
    }

    setCommentActionId(comment.id);
    setErrorMessage("");

    try {
      const updated = await moderateInitiativeComment(selectedItem.id, comment.id, {
        isHidden: !comment.isHidden
      });

      setComments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to moderate comment."
      );
    } finally {
      setCommentActionId("");
    }
  }

  if (accessState === "anonymous") {
    return <main style={styles.page}>{t.common.loginRequired}</main>;
  }

  if (accessState === "forbidden") {
    return <main style={styles.page}>{t.common.moderatorRequired}</main>;
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>{t.initiatives.title}</h1>
      <p style={styles.subtitle}>{t.initiatives.subtitle}</p>

      <div style={styles.filterRow}>
        {(["all", "new", "approved", "executed", "inactive", "rejected", "published"] as InitiativeFilter[]).map(
          (item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              style={{
                ...styles.filterButton,
                ...(filter === item ? styles.filterButtonActive : null)
              }}
            >
              {t.initiatives[item]}
            </button>
          )
        )}
      </div>

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      <div style={styles.layout}>
        <div style={styles.sidebar}>
          {isLoading ? (
            <div style={styles.loadingBox}>{t.common.loading}</div>
          ) : items.length === 0 ? (
            <div style={styles.emptyBox}>{t.initiatives.empty}</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setReviewNote(item.reviewNote ?? "");
                  setImplementationPlan(item.implementationPlan ?? "");
                  setImplementationReport(item.implementationReport ?? "");
                }}
                style={{
                  ...styles.sidebarItem,
                  ...(selectedId === item.id ? styles.sidebarItemActive : null)
                }}
              >
                <div style={styles.sidebarMeta}>
                  <span style={styles.statusPill}>{t.initiatives[item.status]}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <div style={styles.sidebarTitle}>{item.title}</div>
                <div style={styles.sidebarAuthor}>{item.submitterName}</div>
              </button>
            ))
          )}
        </div>

        <div style={styles.detail}>
          {!selectedItem ? (
            <div style={styles.emptyBox}>{t.initiatives.empty}</div>
          ) : (
            <div style={styles.detailCard}>
              <div style={styles.detailTopRow}>
                <span style={styles.statusPill}>{t.initiatives[selectedItem.status]}</span>
                <span style={styles.detailDate}>
                  {t.initiatives.submittedAt}:{" "}
                  {new Date(selectedItem.createdAt).toLocaleString()}
                </span>
              </div>
              <h2 style={styles.detailTitle}>{selectedItem.title}</h2>
              <p style={styles.detailDescription}>{selectedItem.description}</p>

              <div style={styles.detailSection}>
                <strong>{t.initiatives.submittedBy}:</strong> {selectedItem.submitterName}
              </div>
              <div style={styles.detailSection}>
                <strong>{t.initiatives.contact}:</strong> {selectedItem.submitterEmail}
                {selectedItem.submitterPhone ? ` | ${selectedItem.submitterPhone}` : ""}
              </div>

              <div style={styles.detailSection}>
                <strong>{t.dashboard.category}:</strong>{" "}
                {selectedItem.category === "idea" ? t.dashboard.idea : t.dashboard.initiative}
              </div>

              <div style={styles.detailSection}>
                <label style={styles.label}>{t.initiatives.reviewNote}</label>
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder={t.initiatives.reviewPlaceholder}
                  style={styles.textarea}
                  disabled={!canEditInitiative}
                />
              </div>

              <div style={styles.detailSection}>
                <label style={styles.label}>{t.initiatives.implementationPlan}</label>
                <textarea
                  value={implementationPlan}
                  onChange={(event) => setImplementationPlan(event.target.value)}
                  placeholder={t.initiatives.implementationPlan}
                  style={styles.textarea}
                  disabled={!canEditInitiative}
                />
              </div>

              <div style={styles.detailSection}>
                <label style={styles.label}>{t.initiatives.implementationReport}</label>
                <textarea
                  value={implementationReport}
                  onChange={(event) => setImplementationReport(event.target.value)}
                  placeholder={t.initiatives.implementationReport}
                  style={styles.textarea}
                  disabled={!canEditInitiative}
                />
              </div>

              {!canEditInitiative ? (
                <div style={styles.readOnlyBox}>{t.initiatives.adminOnlyPlanNote}</div>
              ) : null}

              <div style={styles.actionRow}>
                {canEditInitiative ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ implementationPlan })}
                      style={{ ...styles.actionButton, ...styles.publishButton }}
                    >
                      {savingAction === "plan" ? t.moderation.saving : t.initiatives.savePlan}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ implementationReport })}
                      style={{ ...styles.actionButton, ...styles.publishButton }}
                    >
                      {savingAction === "report" ? t.moderation.saving : t.initiatives.saveReportDoc}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ status: "published" })}
                      style={{ ...styles.actionButton, ...styles.publishButton }}
                    >
                      {savingAction === "published"
                        ? t.moderation.saving
                        : t.initiatives.markForDiscussion}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ status: "approved" })}
                      style={{ ...styles.actionButton, ...styles.approveButton }}
                    >
                      {savingAction === "approved" ? t.moderation.saving : t.initiatives.approve}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ status: "executed" })}
                      style={{ ...styles.actionButton, ...styles.publishButton }}
                    >
                      {savingAction === "executed" ? t.moderation.saving : t.initiatives.markExecuted}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ status: "inactive" })}
                      style={{ ...styles.actionButton, ...styles.rejectButton }}
                    >
                      {savingAction === "inactive" ? t.moderation.saving : t.initiatives.markInactive}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdate({ status: "rejected" })}
                      style={{ ...styles.actionButton, ...styles.rejectButton }}
                    >
                      {savingAction === "rejected" ? t.moderation.saving : t.initiatives.reject}
                    </button>
                  </>
                ) : null}
              </div>

              <div style={styles.commentsSection}>
                <h3 style={styles.commentsTitle}>{t.initiatives.comments}</h3>
                {isLoadingComments ? (
                  <div style={styles.emptyBox}>{t.common.loading}</div>
                ) : comments.length === 0 ? (
                  <div style={styles.emptyBox}>{t.initiatives.noComments}</div>
                ) : (
                  <div style={styles.commentList}>
                    {[...comments]
                      .sort(
                        (left, right) =>
                          new Date(left.createdAt).getTime() -
                          new Date(right.createdAt).getTime()
                      )
                      .map((comment) => (
                        <div
                          key={comment.id}
                          id={`initiative-comment-${comment.id}`}
                          style={{
                            ...styles.commentCard,
                            ...(highlightedCommentId === comment.id
                              ? styles.commentCardHighlighted
                              : null)
                          }}
                        >
                          <div style={styles.commentMeta}>
                            <div style={styles.commentMetaLeft}>
                              <strong>
                                {comment.authorDisplayName ?? t.moderation.unknownUser}
                              </strong>
                              <span style={styles.commentVisibility}>
                                {comment.visibility === "public"
                                  ? t.initiatives.public
                                  : t.initiatives.internal}
                              </span>
                              {comment.isHidden ? (
                                <span style={styles.commentHiddenTag}>Hidden</span>
                              ) : null}
                            </div>
                            <span>{new Date(comment.createdAt).toLocaleString()}</span>
                          </div>
                          <div style={styles.commentMessage}>{comment.message}</div>
                          <div style={styles.commentActionRow}>
                            <button
                              type="button"
                              onClick={() => void onToggleCommentVisibility(comment)}
                              style={styles.commentActionButton}
                            >
                              {commentActionId === comment.id
                                ? t.moderation.saving
                                : comment.isHidden
                                  ? t.initiatives.unhideComment
                                  : t.initiatives.hideComment}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <div style={styles.detailSection}>
                  <label style={styles.label}>{t.initiatives.visibility}</label>
                  <select
                    value={commentVisibility}
                    onChange={(event) =>
                      setCommentVisibility(event.target.value as "public" | "internal")
                    }
                    style={styles.select}
                  >
                    <option value="public">{t.initiatives.public}</option>
                    <option value="internal">{t.initiatives.internal}</option>
                  </select>
                </div>

                <div style={styles.detailSection}>
                  <label style={styles.label}>{t.initiatives.comments}</label>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder={t.initiatives.commentPlaceholder}
                    style={styles.textarea}
                  />
                </div>

                <div style={styles.actionRow}>
                  <button
                    type="button"
                    onClick={() => void onCreateComment()}
                    style={{ ...styles.actionButton, ...styles.publishButton }}
                  >
                    {savingAction === "comment" ? t.moderation.saving : t.common.save}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ModerationInitiativesLoading() {
  return (
    <main style={styles.page}>
      <section style={styles.heroCard}>
        <h1 style={styles.title}>Loading...</h1>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1360,
    margin: "0 auto",
    padding: "24px"
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 36
  },
  subtitle: {
    color: "#475569",
    marginTop: 10,
    marginBottom: 18
  },
  filterRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16
  },
  filterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    background: "#ffffff",
    color: "#334155",
    padding: "9px 14px",
    fontWeight: 700,
    cursor: "pointer"
  },
  filterButtonActive: {
    background: "#0f172a",
    color: "#ffffff",
    borderColor: "#0f172a"
  },
  errorBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca"
  },
  readOnlyBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe"
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: 18
  },
  sidebar: {
    display: "grid",
    gap: 10,
    alignContent: "start"
  },
  loadingBox: {
    padding: 14,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #e2e8f0"
  },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#64748b"
  },
  sidebarItem: {
    textAlign: "left",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe5ec",
    background: "#ffffff",
    cursor: "pointer"
  },
  sidebarItemActive: {
    borderColor: "#0f766e",
    boxShadow: "0 0 0 2px rgba(15, 118, 110, 0.12)"
  },
  sidebarMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12,
    marginBottom: 8
  },
  sidebarTitle: {
    color: "#0f172a",
    fontWeight: 800,
    marginBottom: 8
  },
  sidebarAuthor: {
    color: "#475569",
    fontSize: 13
  },
  detail: {
    minWidth: 0
  },
  detailCard: {
    background: "#ffffff",
    border: "1px solid #dbe5ec",
    borderRadius: 22,
    padding: 18
  },
  detailTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 12
  },
  detailDate: {
    color: "#64748b",
    fontSize: 12
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  detailTitle: {
    marginTop: 0,
    marginBottom: 12,
    color: "#0f172a"
  },
  detailDescription: {
    color: "#334155",
    lineHeight: 1.7,
    marginBottom: 18
  },
  detailSection: {
    marginBottom: 14,
    color: "#0f172a"
  },
  label: {
    display: "block",
    marginBottom: 6,
    color: "#334155",
    fontWeight: 700
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
  select: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    padding: "11px 12px",
    fontSize: 14
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },
  actionButton: {
    border: "none",
    borderRadius: 14,
    padding: "11px 15px",
    fontWeight: 800,
    cursor: "pointer"
  },
  approveButton: {
    background: "#dcfce7",
    color: "#166534"
  },
  rejectButton: {
    background: "#fee2e2",
    color: "#b91c1c"
  },
  publishButton: {
    background: "#dbeafe",
    color: "#1d4ed8"
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
  commentList: {
    display: "grid",
    gap: 10,
    marginBottom: 14
  },
  commentCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    background: "#f8fafc",
    padding: 12
  },
  commentCardHighlighted: {
    borderColor: "#dc2626",
    boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.14)"
  },
  commentMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748b",
    fontSize: 12,
    marginBottom: 8
  },
  commentMetaLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  commentVisibility: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 8px",
    background: "#e2e8f0",
    color: "#334155",
    fontSize: 11,
    fontWeight: 700
  },
  commentHiddenTag: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 8px",
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 11,
    fontWeight: 700
  },
  commentMessage: {
    color: "#0f172a",
    lineHeight: 1.6
  },
  commentActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 10
  },
  commentActionButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
    color: "#0f172a",
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer"
  }
};
