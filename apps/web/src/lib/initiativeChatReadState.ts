const STORAGE_KEY = "cleansea-web-initiative-chat-read-state";
const CHANGE_EVENT = "cleansea:web-initiative-chat-read-state-changed";

export function loadInitiativeChatReadState(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([key, value]) => Boolean(key) && typeof value === "string"
      )
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export function persistInitiativeChatReadState(nextState: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function markInitiativeChatRead(
  initiativeId: string,
  timestamp: string | null | undefined
) {
  if (!timestamp || typeof window === "undefined") {
    return;
  }

  const current = loadInitiativeChatReadState();
  const previous = current[initiativeId];
  if (previous && new Date(previous).getTime() >= new Date(timestamp).getTime()) {
    return;
  }

  persistInitiativeChatReadState({
    ...current,
    [initiativeId]: timestamp
  });
}

export function countUnreadInitiativeThreads(
  items: Array<{
    id: string;
    commentSummary?: {
      publicCommentCount: number;
      latestPublicCommentAt: string | null;
    };
  }>,
  readState: Record<string, string>
) {
  return items.reduce((count, item) => {
    const latestPublicCommentAt = item.commentSummary?.latestPublicCommentAt;
    const publicCommentCount = item.commentSummary?.publicCommentCount ?? 0;
    if (!latestPublicCommentAt || publicCommentCount <= 0) {
      return count;
    }

    const lastReadAt = readState[item.id];
    if (!lastReadAt) {
      return count + 1;
    }

    return new Date(latestPublicCommentAt).getTime() > new Date(lastReadAt).getTime()
      ? count + 1
      : count;
  }, 0);
}

export function subscribeInitiativeChatReadState(
  callback: () => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
