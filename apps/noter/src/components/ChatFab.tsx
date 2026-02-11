import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  GitCommitHorizontal,
  Check,
  Wrench,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useLocation } from "react-router-dom";
import { TOOL_CATALOG } from "../../convex/agent/toolCatalog";
import { EnhancedMarkdownRenderer } from "./EnhancedMarkdownRenderer";
import { InlineEditingContext } from "@/lib/codeBlockParser";

// --- Route context hook ---

// ChatFab is rendered outside <Routes>, so useParams() returns {}.
// Parse the URL manually via useLocation() instead.
const VAULT_PATH_RE = /^\/vault\/([^/]+)\/([^/]+)(?:\/(.*))?$/;

function useVaultContext() {
  const { pathname } = useLocation();

  const { branch, filePath, repositoryFullName } =
    useMemo(() => {
      const match = pathname.match(VAULT_PATH_RE);
      if (!match) {
        return {
          branch: "main",
          filePath: undefined,
          repositoryFullName: undefined,
        };
      }

      const _owner = match[1];
      const _repoName = match[2];
      const rest = match[3]; // "branch/path/to/file" or undefined

      let branch = "main";
      let filePath: string | undefined;
      if (rest) {
        const parts = rest.split("/");
        branch = parts[0] || "main";
        filePath = parts.slice(1).join("/") || undefined;
      }

      return {
        branch,
        filePath,
        repositoryFullName: `${_owner}/${_repoName}`,
      };
    }, [pathname]);

  const vault = useQuery(
    api.vault.getVaultByRepository,
    repositoryFullName ? { repositoryFullName } : "skip",
  );

  return {
    vaultId: vault?._id as Id<"vaults"> | undefined,
    branch,
    filePath,
    repositoryFullName,
  };
}

// --- Metadata parsing ---

type ToolActivity = {
  type: "tool_activity";
  tools: Array<{ tool: string; input: unknown }>;
};

type CommitProposal = {
  type: "commit_proposal";
  message: string;
  committed?: boolean;
  tools?: Array<{ tool: string; input: unknown }>;
};

type MessageMetadata = ToolActivity | CommitProposal;

function parseMetadata(metadata: string | undefined): MessageMetadata | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

// --- Simple markdown renderer (fallback) ---

function renderMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  let i = 0;

  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      parts.push(
        <span key={i++}>
          {renderInlineMarkdown(text.slice(lastIndex, match.index))}
        </span>,
      );
    }
    // Code block
    parts.push(
      <pre
        key={i++}
        className="my-1.5 overflow-x-auto rounded bg-background/80 p-2 text-xs"
      >
        <code>{match[2]}</code>
      </pre>,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={i++}>{renderInlineMarkdown(text.slice(lastIndex))}</span>,
    );
  }

  return <>{parts}</>;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Handle inline code, bold, and italic
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith("`")) {
      parts.push(
        <code
          key={i++}
          className="rounded bg-background/80 px-1 py-0.5 text-xs"
        >
          {m.slice(1, -1)}
        </code>,
      );
    } else if (m.startsWith("**")) {
      parts.push(<strong key={i++}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*")) {
      parts.push(<em key={i++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// --- Tool activity badge ---

function ToolActivityBadge({
  tools,
}: {
  tools: Array<{ tool: string; input: unknown }>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 rounded-md bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background/80"
      >
        <Wrench className="h-2.5 w-2.5" />
        {tools.length} tool{tools.length !== 1 ? "s" : ""} used
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
          {tools.map((t, idx) => {
            const meta = TOOL_CATALOG.find((c) => c.name === t.tool);
            const displayKey = meta?.inputDisplayKey;
            const displayValue = displayKey
              ? (t.input as Record<string, string>)[displayKey]
              : undefined;
            return (
              <div key={idx} className="flex items-center gap-1">
                <span className="font-mono">{t.tool}</span>
                {displayValue && (
                  <span className="truncate opacity-70">{displayValue}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Capabilities panel ---

function CapabilitiesPanel({
  repositoryFullName,
  vaultId,
  hasGithubToken,
  systemPrompt,
}: {
  repositoryFullName?: string;
  vaultId?: Id<"vaults">;
  hasGithubToken: boolean;
  systemPrompt?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const toolsEnabled = Boolean(repositoryFullName && vaultId && hasGithubToken);

  let statusLine = "Open a repository to enable tools.";
  if (repositoryFullName) {
    if (!vaultId) {
      statusLine = "Repository is not connected yet.";
    } else if (!hasGithubToken) {
      statusLine = "GitHub access is missing. Reconnect to enable tools.";
    } else {
      statusLine = `Tools are enabled for ${repositoryFullName}.`;
    }
  }

  return (
    <div className="mb-2 rounded-lg border border-border bg-muted/50 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="font-medium">Chat tools</span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
            toolsEnabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {toolsEnabled ? "Enabled" : "Disabled"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 text-muted-foreground">
          <div>{statusLine}</div>
          <div className="mt-2 text-foreground">Available tools</div>
          <div className="mt-1 space-y-0.5">
            {TOOL_CATALOG.map((toolInfo) => (
              <div key={toolInfo.name} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-foreground">
                  {toolInfo.name}
                </span>
                <span>{toolInfo.uiDescription}</span>
              </div>
            ))}
          </div>
          <div className="mt-2">
            Tool usage appears as a badge on assistant responses.
          </div>
          {systemPrompt && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                System prompt
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                {systemPrompt}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// --- Commit proposal card ---

function CommitProposalCard({
  metadata,
  conversationId,
}: {
  metadata: CommitProposal;
  conversationId: Id<"chatConversations">;
}) {
  const confirmCommit = useMutation(api.chat.confirmCommit);
  const [confirming, setConfirming] = useState(false);

  async function handleApprove() {
    setConfirming(true);
    try {
      await confirmCommit({ conversationId });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="my-1 rounded-lg border border-border bg-background p-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <GitCommitHorizontal className="h-3.5 w-3.5" />
        Commit proposal
      </div>
      <p className="mt-1 text-xs text-muted-foreground font-mono">
        {metadata.message}
      </p>
      {metadata.committed ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          Committed
        </div>
      ) : (
        <button
          onClick={() => void handleApprove()}
          disabled={confirming}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {confirming ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <GitCommitHorizontal className="h-3 w-3" />
          )}
          Approve & Push
        </button>
      )}
    </div>
  );
}

// --- Message bubble ---

function MessageBubble({
  msg,
  conversationId,
  inlineEditingContext,
}: {
  msg: {
    _id: Id<"chatMessages">;
    role: "user" | "assistant";
    content: string;
    metadata?: string;
  };
  conversationId: Id<"chatConversations">;
  inlineEditingContext?: InlineEditingContext;
}) {
  const metadata = parseMetadata(msg.metadata);

  if (msg.role === "user") {
    return (
      <div className="mb-2 ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
        {msg.content}
      </div>
    );
  }

  const isCommitProposal = metadata?.type === "commit_proposal";
  const toolsUsed =
    metadata?.type === "tool_activity"
      ? metadata.tools
      : metadata?.type === "commit_proposal"
        ? metadata.tools
        : null;

  return (
    <div className="mb-2 max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
      {toolsUsed && toolsUsed.length > 0 && (
        <ToolActivityBadge tools={toolsUsed} />
      )}
      <div className="whitespace-pre-wrap">
        <EnhancedMarkdownRenderer 
          text={msg.content} 
          context={inlineEditingContext}
          readOnly={false}
        />
      </div>
      {isCommitProposal && (
        <CommitProposalCard
          metadata={metadata}
          conversationId={conversationId}
        />
      )}
    </div>
  );
}

// --- localStorage persistence helpers ---

const STORAGE_KEY_SIZE = "noter-chat-size";
const STORAGE_KEY_OPEN = "noter-chat-open";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

// --- Main component ---

const DEFAULT_WIDTH = 28 * 16; // 28rem in px
const DEFAULT_HEIGHT = 32 * 16; // 32rem in px
const MIN_WIDTH = 20 * 16; // 20rem
const MIN_HEIGHT = 16 * 16; // 16rem

export function ChatFab() {
  const [isOpen, setIsOpen] = useState(() =>
    loadFromStorage(STORAGE_KEY_OPEN, false),
  );
  const [input, setInput] = useState("");
  // Local fallback for conversations without a vault context
  const [localConversationId, setLocalConversationId] =
    useState<Id<"chatConversations"> | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [size, setSize] = useState(() =>
    loadFromStorage(STORAGE_KEY_SIZE, { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT }),
  );
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
  }, [size]);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, startW, startH } = dragRef.current;
    // Dragging top-left corner: moving left increases width, moving up increases height
    const newW = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 24, startW + (startX - e.clientX)));
    const newH = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 80, startH + (startY - e.clientY)));
    setSize({ w: newW, h: newH });
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  const { vaultId, branch, filePath, repositoryFullName } = useVaultContext();
  const viewer = useQuery(api.users.viewer);

  // One conversation per user per vault — persisted in Convex
  const vaultConversation = useQuery(
    api.chat.getConversationForVault,
    vaultId ? { vaultId } : "skip",
  );
  const conversationId = vaultId
    ? (vaultConversation?._id ?? null)
    : localConversationId;

  const messages = useQuery(
    api.chat.listMessages,
    conversationId ? { conversationId } : "skip",
  );

  const conversation = useQuery(
    api.chat.getConversation,
    conversationId ? { conversationId } : "skip",
  );

  const createConversation = useMutation(api.chat.createConversation);
  const deleteConversation = useMutation(api.chat.deleteConversation);
  const sendMessage = useMutation(api.chat.sendMessage);

  // Create inline editing context
  const inlineEditingContext: InlineEditingContext = useMemo(() => ({
    vaultId,
    repositoryFullName,
    branch,
    currentFilePath: filePath,
  }), [vaultId, repositoryFullName, branch, filePath]);

  async function handleNewConversation() {
    if (!conversationId) return;
    await deleteConversation({ conversationId });
    setLocalConversationId(null);
  }

  // Persist UI state to localStorage (conversation itself lives in Convex)
  useEffect(() => {
    saveToStorage(STORAGE_KEY_OPEN, isOpen);
  }, [isOpen]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_SIZE, size);
  }, [size]);

  const isWaitingForResponse =
    messages &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Clear sending flag when we get the assistant response
  useEffect(() => {
    if (
      messages &&
      messages.length > 0 &&
      messages[messages.length - 1].role === "assistant"
    ) {
      setSending(false);
    }
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInput("");

    let convId = conversationId;
    if (!convId) {
      // get-or-create: if vaultId is provided the backend returns the
      // existing conversation for this user+vault, or creates a new one.
      convId = await createConversation({ vaultId: vaultId ?? undefined });
      if (!vaultId) {
        setLocalConversationId(convId);
      }
    }

    await sendMessage({
      conversationId: convId,
      content: trimmed,
      vaultId,
      filePath,
      branch,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-16 right-3 z-[9999] flex max-sm:!left-0 max-sm:!right-0 max-sm:!bottom-16 max-sm:!w-auto max-sm:!h-[calc(100%-5rem)] max-sm:rounded-none flex-col rounded-xl border border-border bg-popover shadow-xl"
          style={{ width: size.w, height: size.h, maxHeight: 'calc(100vh - 5rem)' }}
        >
          {/* Drag handle (top-left corner) */}
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            className="absolute -left-1.5 -top-1.5 h-6 w-6 cursor-nwse-resize max-sm:hidden z-10 flex items-end justify-end touch-none"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-muted-foreground/50 mr-0.5 mb-0.5">
              <path d="M0 10L10 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M0 6L6 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M0 2L2 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">Chat</span>
            <div className="flex items-center gap-0.5">
              {conversationId && (
                <button
                  onClick={() => void handleNewConversation()}
                  title="New conversation"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <CapabilitiesPanel
              repositoryFullName={repositoryFullName}
              vaultId={vaultId}
              hasGithubToken={Boolean(viewer?.githubAccessToken)}
              systemPrompt={conversation?.systemPrompt}
            />
            {conversationId &&
              messages?.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  conversationId={conversationId}
                  inlineEditingContext={inlineEditingContext}
                />
              ))}
            {isWaitingForResponse && (
              <div className="mb-2 flex max-w-[85%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-2.5 py-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="max-h-20 min-h-[2rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || sending}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-3 right-3 z-[9999] flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-colors",
          isOpen
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </button>
    </>
  );
}