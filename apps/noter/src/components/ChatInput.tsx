import { forwardRef } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  textareaClassName?: string;
  sendButtonClassName?: string;
};

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    {
      value,
      onValueChange,
      onSend,
      placeholder = "Type a message...",
      disabled = false,
      rows = 3,
      className,
      textareaClassName,
      sendButtonClassName,
    },
    ref,
  ) {
    const canSend = value.trim().length > 0 && !disabled;

    return (
      <div className={cn("flex items-end gap-2", className)}>
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }
          }}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "max-h-60 min-h-[4.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            textareaClassName,
          )}
        />
        <button
          onClick={() => onSend()}
          disabled={!canSend}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40",
            sendButtonClassName,
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
