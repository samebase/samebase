import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorChatPanel } from "@/components/EditorChatPanel";

const STORAGE_KEY_OPEN = "noter-chat-open";

function loadStoredOpenState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPEN);
    if (raw === null) {
      return false;
    }
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

function saveStoredOpenState(isOpen: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_OPEN, JSON.stringify(isOpen));
  } catch {
    // ignore quota errors
  }
}

export function ChatFab() {
  const [isOpen, setIsOpen] = useState(() => loadStoredOpenState());
  const [shouldAutoFocusInput, setShouldAutoFocusInput] = useState(false);

  useEffect(() => {
    saveStoredOpenState(isOpen);
  }, [isOpen]);

  return (
    <>
      {isOpen ? (
        <div className="fixed bottom-16 right-3 z-[9999] h-[32rem] w-[28rem] max-w-[calc(100vw-1.5rem)] max-sm:bottom-16 max-sm:left-0 max-sm:right-0 max-sm:h-[calc(100%-5rem)] max-sm:w-auto">
          <EditorChatPanel
            className="h-full shadow-xl"
            autoFocusInput={shouldAutoFocusInput}
            onClose={() => {
              setShouldAutoFocusInput(false);
              setIsOpen(false);
            }}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          const nextOpenState = !isOpen;
          setShouldAutoFocusInput(nextOpenState);
          setIsOpen(nextOpenState);
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        title={isOpen ? "Close chat" : "Open chat"}
        className={cn(
          "fixed bottom-3 right-3 z-[9999] flex h-11 w-11 items-center justify-center corner-notch-1 shadow-lg transition-colors",
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
