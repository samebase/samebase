import { useState, useRef, useEffect, useMemo } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  GitCommitHorizontal,
  Check,
  Wrench,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useParams } from "react-router-dom";

// --- Route context hook ---

function useVaultContext() {
  const params = useParams<{ owner: string; repoName: string; "*": string }>();

  const owner = params.owner;
  const repoName = params.repoName;
  const repositoryFullName =
    owner && repoName ? `${owner}/${repoName}` : undefined;

  // Parse branch and file path from the wildcard parameter
  // URL structure: /vault/:owner/:repoName/:branch/:filePath
  const { branch, filePath } = useMemo(() => {
    const wildcard = params["*"];
    if (!wildcard) return { branch: "main", filePath: undefined };
    const parts = wildcard.split("/");
    const branch = parts[0] || "main";
    const filePath = parts.slice(1).join("/") || undefined;
    return { branch, filePath };
  }, [params]);

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

// --- Simple markdown renderer ---

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
          {tools.map((t, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className="font-mono">{t.tool}</span>
              {t.tool === "read_file" ||
              t.tool === "edit_file" ||
              t.tool === "create_file" ||
              t.tool === "delete_file" ? (
                <span className="truncate opacity-70">
                  {(t.input as Record<string, string>).path}
                </span>
              ) : t.tool === "github_api" ? (
                <span className="truncate opacity-70">
                  {(t.input as Record<string, string>).endpoint}
                </span>
              ) : null}
            </div>
          ))}
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
}: {
  msg: {
    _id: Id<"chatMessages">;
    role: "user" | "assistant";
    content: string;
    metadata?: string;
  };
  conversationId: Id<"chatConversations">;
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
      <div className="whitespace-pre-wrap">{renderMarkdown(msg.content)}</div>
      {isCommitProposal && (
        <CommitProposalCard
          metadata={metadata}
          conversationId={conversationId}
        />
      )}
    </div>
  );
}

// --- System prompt bubble ---

function SystemPromptBubble({ systemPrompt }: { systemPrompt: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2 rounded-lg border border-dashed border-border bg-muted/50 text-xs">
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
        <span className="font-medium">System prompt</span>
      </button>
      {expanded && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {systemPrompt}
        </pre>
      )}
    </div>
  );
}

// --- Main component ---

export function ChatFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] =
    useState<Id<"chatConversations"> | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { vaultId, branch, filePath } = useVaultContext();

  const messages = useQuery(
    api.chat.listMessages,
    conversationId ? { conversationId } : "skip",
  );

  const conversation = useQuery(
    api.chat.getConversation,
    conversationId ? { conversationId } : "skip",
  );

  const createConversation = useMutation(api.chat.createConversation);
  const sendMessage = useMutation(api.chat.sendMessage);

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
      convId = await createConversation();
      setConversationId(convId);
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
        <div className="fixed bottom-16 right-3 z-[9999] flex h-[min(24rem,calc(100%-5rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-border bg-popover shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">Chat</span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {conversation?.systemPrompt && (
              <SystemPromptBubble systemPrompt={conversation.systemPrompt} />
            )}
            {conversationId &&
              messages?.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  conversationId={conversationId}
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
