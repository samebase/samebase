import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { X, Loader2, GitCommitHorizontal, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInput, type ChatInputHandle } from "@/components/ChatInput";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME } from "@/components/editorChatLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import {
  messageMetadataSchema,
  type CommitProposalPayload as CommitProposal,
  type MessageMetadata,
  type ProdReadProposalPayload as ProdReadProposal,
} from "../../shared/chatMetadata";
import { usePageLeaveGuard } from "@/lib/pageLeaveGuard";

// --- Metadata parsing ---

type ChatUIMessage = UIMessage & { metadata?: unknown };

function parseMetadata(metadata: unknown): MessageMetadata | null {
  const result = messageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

// --- Commit proposal card ---

function CommitProposalCard({
  metadata,
  threadId,
  messageId,
}: {
  metadata: CommitProposal;
  threadId: string;
  messageId: string;
}) {
  const confirmCommit = useMutation(api.chat.index.confirmCommit);
  const [confirming, setConfirming] = useState(false);

  async function handleApprove() {
    setConfirming(true);
    try {
      await confirmCommit({ threadId, messageId });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="my-1 corner-notch-1 border border-border bg-background p-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <GitCommitHorizontal className="h-3.5 w-3.5" />
        Commit proposal
      </div>
      <p className="mt-1 text-xs text-muted-foreground font-mono">{metadata.message}</p>
      {metadata.committed ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          Committed
        </div>
      ) : metadata.committing ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Committing...
        </div>
      ) : (
        <>
          <button
            onClick={() => void handleApprove()}
            disabled={confirming}
            className="mt-2 inline-flex items-center gap-1.5 corner-notch-1 bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {confirming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <GitCommitHorizontal className="h-3 w-3" />
            )}
            Approve & Push
          </button>
          {metadata.error ? (
            <div className="mt-2 text-xs text-red-600">Commit failed: {metadata.error}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

function renderProdReadLabel(metadata: { resourceKind: ProdReadProposal["resourceKind"] }) {
  const labels: Record<ProdReadProposal["resourceKind"], string> = {
    deployment_status: "Deployment status",
    logs: "Logs",
    data_query: "Data sample",
    project_inventory: "Project inventory",
    account_inventory: "Account inventory",
    workers_inventory: "Workers inventory",
  };
  return labels[metadata.resourceKind];
}

function renderProviderLabel(provider: ProdReadProposal["provider"]) {
  if (provider === "convex") return "Convex";
  return "Cloudflare";
}

function ProdReadProposalCard({
  metadata,
  threadId,
  messageId,
}: {
  metadata: ProdReadProposal;
  threadId: string;
  messageId: string;
}) {
  const confirmProdRead = useMutation(api.chat.index.confirmProdRead);
  const rejectProdRead = useMutation(api.chat.index.rejectProdRead);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  const status = metadata.status ?? "proposed";
  const isPending = status === "proposed";

  async function handleApprove() {
    setAction("approve");
    try {
      await confirmProdRead({
        requestId: metadata.requestId,
        threadId,
        messageId,
      });
    } finally {
      setAction(null);
    }
  }

  async function handleReject() {
    setAction("reject");
    try {
      await rejectProdRead({
        requestId: metadata.requestId,
        threadId,
        messageId,
      });
    } finally {
      setAction(null);
    }
  }

  const providerLabel = renderProviderLabel(metadata.provider);
  const scopeLabel = metadata.scope === "vault" ? "Vault scope" : "Global scope";

  return (
    <div className="my-1 corner-notch-1 border border-border bg-background p-2.5">
      <div className="text-xs font-medium text-foreground">Production read approval</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {providerLabel} • {renderProdReadLabel(metadata)} • {scopeLabel}
      </div>
      <div className="mt-1 text-xs text-muted-foreground font-mono">{metadata.paramsPreview}</div>

      {status === "approved" && (
        <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Approved. Executing request...
        </div>
      )}
      {status === "executed" && (
        <div className="mt-2 text-xs text-green-600 dark:text-green-400">Executed.</div>
      )}
      {status === "rejected" && <div className="mt-2 text-xs text-muted-foreground">Rejected.</div>}
      {status === "failed" && (
        <div className="mt-2 text-xs text-red-600">
          Failed: {metadata.error ?? "Execution failed"}
        </div>
      )}
      {status === "expired" && (
        <div className="mt-2 text-xs text-muted-foreground">
          Expired: {metadata.error ?? "Approval window expired"}
        </div>
      )}

      {isPending && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void handleApprove()}
            disabled={action !== null}
            className="inline-flex items-center gap-1.5 corner-notch-1 bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {action === "approve" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Approve
          </button>
          <button
            onClick={() => void handleReject()}
            disabled={action !== null}
            className="inline-flex items-center gap-1.5 corner-notch-1 border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {action === "reject" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// --- Message bubble ---

function MessageBubble({ msg, threadId }: { msg: ChatUIMessage; threadId: string }) {
  const metadata = parseMetadata(msg.metadata);

  if (msg.role === "user") {
    return (
      <div className="mb-2 ml-auto max-w-[85%] corner-notch-1 bg-primary px-3 py-2 text-sm text-primary-foreground">
        <ProsemarkReadOnly value={msg.text} className="text-sm" />
      </div>
    );
  }

  const isCommitProposal = metadata?.type === "commit_proposal";
  const isProdReadProposal = metadata?.type === "prod_read_proposal";

  return (
    <div className="mb-2 max-w-[85%] corner-notch-1 bg-muted px-3 py-2 text-sm text-foreground">
      <ProsemarkReadOnly value={msg.text} className="text-sm" />
      {isCommitProposal && (
        <CommitProposalCard metadata={metadata} threadId={threadId} messageId={msg.id} />
      )}
      {isProdReadProposal && (
        <ProdReadProposalCard metadata={metadata} threadId={threadId} messageId={msg.id} />
      )}
    </div>
  );
}

type EditorChatPanelProps = {
  vaultId?: Id<"vaults">;
  repositoryFullName?: string;
  branch?: string;
  filePath?: string;
  className?: string;
  autoFocusInput?: boolean;
  headerResizeHandle?: ReactNode;
  onBusyStateChange?: (isBusy: boolean) => void;
  onClose?: () => void;
  shellMode?: "embedded" | "standalone";
};

const STORAGE_KEY_LOCAL_THREAD = "samebase-chat-thread";

function loadStoredLocalThreadId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_THREAD);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredLocalThreadId(threadId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY_LOCAL_THREAD, JSON.stringify(threadId));
  } catch {
    // ignore quota errors
  }
}

// --- Main component ---

export function EditorChatPanel({
  vaultId,
  repositoryFullName,
  branch,
  filePath,
  className,
  autoFocusInput = false,
  headerResizeHandle,
  onBusyStateChange,
  onClose,
  shellMode = "standalone",
}: EditorChatPanelProps) {
  const [input, setInput] = useState("");
  const [localThreadId, setLocalThreadId] = useState<string | null>(() =>
    loadStoredLocalThreadId(),
  );
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const lastHydratedThreadRef = useRef<string | null>(null);
  const lastHydratedDraftRef = useRef<string>("");
  const lastSavedDraftRef = useRef<string | null>(null);
  const isDirtyDraftRef = useRef(false);
  const creatingThreadRef = useRef<Promise<string> | null>(null);
  const flushDraftRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const flushDraftPromiseRef = useRef<Promise<void> | null>(null);

  // Vault pages use the per-vault thread; non-vault pages fall back to the old local thread id.
  const vaultThread = useQuery(api.chat.index.getThreadForVault, vaultId ? { vaultId } : "skip");
  const threadId = vaultId ? (vaultThread?.threadId ?? pendingThreadId) : localThreadId;

  const threadContext = useQuery(api.chat.index.getThreadContext, threadId ? { threadId } : "skip");
  const threadContextLoaded = threadContext !== undefined;

  const messages = useUIMessages(
    api.chat.index.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const createThread = useMutation(api.chat.index.createThread);
  const deleteThread = useMutation(api.chat.index.deleteThread);
  const sendMessage = useMutation(api.chat.index.sendMessage);
  const updateThreadDraft = useMutation(api.chat.index.updateThreadDraft);

  const inputMode = "prosemark";

  usePageLeaveGuard({
    enabled: hasUnsavedDraft || sending,
    reason: "Pending chat draft or message",
  });

  const draftNeedsSave = useCallback((draft: string) => {
    const lastSavedDraft = lastSavedDraftRef.current;
    return lastSavedDraft === null ? draft.trim().length > 0 : draft !== lastSavedDraft;
  }, []);

  const ensureThreadId = useCallback(async () => {
    if (threadId) return threadId;
    if (creatingThreadRef.current) {
      return await creatingThreadRef.current;
    }

    const createPromise = (async () => {
      const createdId = await createThread({
        vaultId: vaultId ?? undefined,
        repositoryFullName,
        branch,
        filePath,
      });
      if (vaultId) {
        setPendingThreadId(createdId);
      } else {
        setLocalThreadId(createdId);
      }
      return createdId;
    })();

    creatingThreadRef.current = createPromise;
    try {
      return await createPromise;
    } finally {
      creatingThreadRef.current = null;
    }
  }, [threadId, createThread, vaultId, repositoryFullName, branch, filePath]);

  async function handleNewConversation() {
    if (!threadId || isDeleting || sending) return;
    setIsDeleting(true);
    try {
      await deleteThread({ threadId });
      if (!vaultId) {
        setLocalThreadId(null);
      }
      setPendingThreadId(null);
      setInput("");
      lastHydratedThreadRef.current = null;
      lastHydratedDraftRef.current = "";
      lastSavedDraftRef.current = null;
      isDirtyDraftRef.current = false;
      setHasUnsavedDraft(false);
    } finally {
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    if (!vaultId) {
      saveStoredLocalThreadId(localThreadId);
    }
  }, [localThreadId, vaultId]);

  useEffect(() => {
    setPendingThreadId(null);
    setInput("");
    setSending(false);
    setIsDeleting(false);
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    lastHydratedThreadRef.current = null;
    lastHydratedDraftRef.current = "";
    lastSavedDraftRef.current = null;
    isDirtyDraftRef.current = false;
    flushDraftPromiseRef.current = null;
    setHasUnsavedDraft(false);
  }, [vaultId]);

  useEffect(() => {
    if (vaultThread?.threadId) {
      setPendingThreadId(null);
    }
  }, [vaultThread?.threadId]);

  const messageResults: ChatUIMessage[] = messages.results;
  const hasStreaming = messageResults.some(
    (msg) => msg.role === "assistant" && msg.status === "streaming",
  );
  const isWaitingForResponse =
    !hasStreaming &&
    messageResults.length > 0 &&
    messageResults[messageResults.length - 1].role === "user";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageResults]);

  useEffect(() => {
    if (autoFocusInput) {
      inputRef.current?.focus();
    }
  }, [autoFocusInput]);

  useEffect(() => {
    onBusyStateChange?.(sending || isDeleting);
  }, [isDeleting, onBusyStateChange, sending]);

  useEffect(() => {
    return () => {
      onBusyStateChange?.(false);
    };
  }, [onBusyStateChange]);

  // Clear sending flag when we get the assistant response
  useEffect(() => {
    if (messageResults.length > 0) {
      const last = messageResults[messageResults.length - 1];
      if (last.role === "assistant") {
        setSending(false);
      }
    }
  }, [messageResults]);

  useEffect(() => {
    if (hasStreaming) {
      setSending(false);
    }
  }, [hasStreaming]);

  useEffect(() => {
    if (!input.trim()) return;
    if (threadId) return;
    void ensureThreadId();
  }, [input, threadId, ensureThreadId]);

  useEffect(() => {
    if (!threadId || !threadContextLoaded) return;
    const remoteDraft = threadContext.draftMessage ?? "";
    if (lastHydratedThreadRef.current !== threadId) {
      lastHydratedThreadRef.current = threadId;
      lastHydratedDraftRef.current = remoteDraft;
      lastSavedDraftRef.current = remoteDraft;
      if (!isDirtyDraftRef.current) {
        setInput(remoteDraft);
        isDirtyDraftRef.current = false;
        setHasUnsavedDraft(false);
      }
      return;
    }
    if (isDirtyDraftRef.current) return;
    if (remoteDraft === lastHydratedDraftRef.current) return;
    setInput(remoteDraft);
    lastHydratedDraftRef.current = remoteDraft;
    lastSavedDraftRef.current = remoteDraft;
    setHasUnsavedDraft(false);
  }, [threadId, threadContextLoaded, threadContext?.draftMessage]);

  const flushDraftImmediately = useCallback(() => {
    const draft = input;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!threadId && draft.trim().length === 0) {
      setHasUnsavedDraft(false);
      return Promise.resolve();
    }
    if (draft === lastSavedDraftRef.current) {
      isDirtyDraftRef.current = false;
      setHasUnsavedDraft(false);
      return Promise.resolve();
    }
    if (flushDraftPromiseRef.current) {
      return flushDraftPromiseRef.current;
    }
    const savePromise = (async () => {
      const activeThreadId = threadId ?? (draft.trim().length > 0 ? await ensureThreadId() : null);
      if (!activeThreadId) {
        return;
      }
      await updateThreadDraft({
        threadId: activeThreadId,
        draftMessage: draft,
      });
      lastSavedDraftRef.current = draft;
      lastHydratedDraftRef.current = draft;
      isDirtyDraftRef.current = false;
      setHasUnsavedDraft(false);
    })()
      .catch(() => {
        // keep dirty flag for a future retry
        setHasUnsavedDraft(true);
      })
      .finally(() => {
        if (flushDraftPromiseRef.current === savePromise) {
          flushDraftPromiseRef.current = null;
        }
      });
    flushDraftPromiseRef.current = savePromise;
    return savePromise;
  }, [ensureThreadId, input, threadId, updateThreadDraft]);

  useEffect(() => {
    flushDraftRef.current = flushDraftImmediately;
  }, [flushDraftImmediately]);

  useEffect(() => {
    return () => {
      void flushDraftRef.current();
    };
  }, []);

  useEffect(() => {
    if (!threadId) return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      const draft = input;
      if (draft === lastSavedDraftRef.current) {
        isDirtyDraftRef.current = false;
        setHasUnsavedDraft(false);
        return;
      }
      void updateThreadDraft({ threadId, draftMessage: draft })
        .then(() => {
          lastSavedDraftRef.current = draft;
          lastHydratedDraftRef.current = draft;
          isDirtyDraftRef.current = false;
          setHasUnsavedDraft(false);
        })
        .catch(() => {
          // keep dirty flag for a future retry
          setHasUnsavedDraft(true);
        });
    }, 400);

    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [input, threadId, updateThreadDraft]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending || isDeleting) return;

    setSending(true);
    setInput("");
    lastSavedDraftRef.current = "";
    lastHydratedDraftRef.current = "";
    isDirtyDraftRef.current = false;
    setHasUnsavedDraft(false);

    try {
      const activeThreadId = await ensureThreadId();
      await sendMessage({
        threadId: activeThreadId,
        content: trimmed,
        vaultId: vaultId ?? undefined,
        filePath,
        branch,
      });
    } catch {
      setInput(trimmed);
      isDirtyDraftRef.current = true;
      setHasUnsavedDraft(true);
    } finally {
      setSending(false);
    }
  }

  const handleClose = useCallback(() => {
    if (sending || isDeleting) {
      return;
    }
    void flushDraftImmediately();
    onClose?.();
  }, [flushDraftImmediately, isDeleting, onClose, sending]);

  const newConversationButton = threadId ? (
    <button
      onClick={() => void handleNewConversation()}
      title={isDeleting ? "Removing..." : "New conversation"}
      aria-label={isDeleting ? "Removing conversation" : "New conversation"}
      disabled={isDeleting || sending}
      aria-disabled={isDeleting || sending}
      className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
    </button>
  ) : null;

  return (
    <div
      className={cn(
        shellMode === "embedded"
          ? "flex h-full min-h-0 flex-col bg-background"
          : "flex h-full min-h-0 flex-col corner-notch-1 border border-border bg-background",
        className,
      )}
    >
      {shellMode === "standalone" ? (
        <div className="border-b border-border">
          <div className={cn("flex items-center gap-1 py-0", EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME)}>
            <div className="min-w-0 flex-1">{headerResizeHandle}</div>
            <div className="flex shrink-0 items-center gap-0">
              {newConversationButton}
              {onClose ? (
                <button
                  onClick={handleClose}
                  disabled={sending || isDeleting}
                  aria-disabled={sending || isDeleting}
                  className="corner-notch-1 p-0 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close chat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto py-2">
        <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
          {threadId
            ? messageResults.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} threadId={threadId} />
              ))
            : null}
          {isWaitingForResponse ? (
            <div className="mb-2 flex max-w-[85%] items-center gap-2 corner-notch-1 bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border">
        <div className={EDITOR_CHAT_CONTENT_FRAME_CLASS_NAME}>
          {shellMode === "embedded" && newConversationButton ? (
            <div className="flex justify-end border-b border-border/60 py-1">
              {newConversationButton}
            </div>
          ) : null}
          <ChatInput
            ref={inputRef}
            value={input}
            onValueChange={(value) => {
              setInput(value);
              isDirtyDraftRef.current = true;
              setHasUnsavedDraft(draftNeedsSave(value));
            }}
            onSend={() => void handleSend()}
            disabled={sending || isWaitingForResponse || isDeleting}
            mode={inputMode}
            autoResize
            sendButtonClassName="mr-2 mt-2 mb-2 p-2"
          />
        </div>
      </div>
    </div>
  );
}
