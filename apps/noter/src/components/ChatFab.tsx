import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function ChatFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<Id<"chatConversations"> | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useQuery(
    api.chat.listMessages,
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
    if (messages && messages.length > 0 && messages[messages.length - 1].role === "assistant") {
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

    await sendMessage({ conversationId: convId, content: trimmed });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Chat Window — sized to fit well inside an iframe */}
      {isOpen && (
        <div
          className="fixed right-3 z-[9999] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-border bg-popover shadow-xl"
          style={{
            bottom: "calc(3.5rem + var(--bottom-inset, 0px))",
            height: "min(24rem, calc(100vh - 5rem - var(--bottom-inset, 0px)))",
          }}
        >
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
            {messages?.map((msg) => (
              <div
                key={msg._id}
                className={cn(
                  "mb-2 max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {msg.content}
              </div>
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
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB — z-index higher than TanStack devtools */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "fixed right-3 z-[9999] flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-colors",
          isOpen
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        style={{ bottom: "calc(0.75rem + var(--bottom-inset, 0px))" }}
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
