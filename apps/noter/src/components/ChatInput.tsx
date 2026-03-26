import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Annotation,
  EditorState,
  Prec,
  Compartment,
  Transaction,
} from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
  insertNewlineAndIndent,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { EditorHistoryControls } from "@/components/EditorHistoryControls";
import { useTheme } from "next-themes";
import { prosemarkDarkTheme } from "@/components/prosemarkSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  EMPTY_EDITOR_HISTORY_STATE,
  type EditorHistoryState,
} from "@/lib/editorHistory";

type ChatInputMode = "simple" | "prosemark";

export type ChatInputHandle = {
  focus: () => void;
};

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
  mode?: ChatInputMode;
  autoResize?: boolean;
};

type ChatInputBaseProps = Omit<ChatInputProps, "mode">;

const AUTO_RESIZE_MIN_HEIGHT = 72;
const AUTO_RESIZE_MAX_HEIGHT = 240;
const EXTERNAL_UPDATE = Annotation.define<boolean>();

/**
 * Mirror the active editor's native undo/redo availability into the shared
 * mobile controls without duplicating CodeMirror history state.
 */
function getCodeMirrorHistoryState(
  view: EditorView | null,
): EditorHistoryState {
  if (view === null) {
    return EMPTY_EDITOR_HISTORY_STATE;
  }

  return {
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
  };
}

function ChatInputActionCluster({
  canSend,
  onSend,
  sendButtonClassName,
  showHistoryControls,
  historyState,
  onUndo,
  onRedo,
}: {
  canSend: boolean;
  onSend: () => void;
  sendButtonClassName?: string;
  showHistoryControls: boolean;
  historyState: EditorHistoryState;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="flex shrink-0 items-end gap-1.5">
      {showHistoryControls ? (
        <EditorHistoryControls
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      ) : null}
      <button
        type="button"
        onClick={() => onSend()}
        disabled={!canSend}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center corner-notch-1 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40",
          sendButtonClassName,
        )}
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

const prosemarkInputTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-placeholder": {
    color: "hsl(var(--muted-foreground))",
  },
});

const SimpleChatInput = forwardRef<ChatInputHandle, ChatInputBaseProps>(
  function SimpleChatInput(
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
      autoResize = false,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isMobile = useIsMobile();
    const canSend = value.trim().length > 0 && !disabled;
    const [historyState, setHistoryState] = useState<EditorHistoryState>(
      EMPTY_EDITOR_HISTORY_STATE,
    );
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const lastAppliedValueRef = useRef(value);
    const syncHistoryState = useCallback(() => {
      setHistoryState({
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
      });
    }, []);

    const resizeTextarea = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      if (!autoResize) {
        el.style.height = "";
        return;
      }
      el.style.height = "auto";
      const nextHeight = Math.min(
        AUTO_RESIZE_MAX_HEIGHT,
        Math.max(AUTO_RESIZE_MIN_HEIGHT, el.scrollHeight),
      );
      el.style.height = `${nextHeight}px`;
    }, [autoResize]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          textareaRef.current?.focus();
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      resizeTextarea();
    }, [value, resizeTextarea]);

    useEffect(() => {
      if (value === lastAppliedValueRef.current) {
        return;
      }

      // Prop-driven resets such as send/clear should not become redoable steps.
      lastAppliedValueRef.current = value;
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryState();
    }, [syncHistoryState, value]);

    const handleUndo = useCallback(() => {
      const previousValue = undoStackRef.current.pop();
      if (typeof previousValue !== "string") {
        return;
      }

      redoStackRef.current.push(lastAppliedValueRef.current);
      lastAppliedValueRef.current = previousValue;
      onValueChange(previousValue);
      syncHistoryState();
      textareaRef.current?.focus();
    }, [onValueChange, syncHistoryState]);

    const handleRedo = useCallback(() => {
      const nextValue = redoStackRef.current.pop();
      if (typeof nextValue !== "string") {
        return;
      }

      undoStackRef.current.push(lastAppliedValueRef.current);
      lastAppliedValueRef.current = nextValue;
      onValueChange(nextValue);
      syncHistoryState();
      textareaRef.current?.focus();
    }, [onValueChange, syncHistoryState]);

    return (
      <div className={cn("flex items-end gap-2", className)}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            const previousValue = lastAppliedValueRef.current;
            if (nextValue !== previousValue) {
              undoStackRef.current.push(previousValue);
              redoStackRef.current = [];
              lastAppliedValueRef.current = nextValue;
              syncHistoryState();
            }
            onValueChange(nextValue);
          }}
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
          disabled={disabled}
          className={cn(
            "max-h-60 min-h-[4.5rem] flex-1 resize-none corner-notch-1 border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            textareaClassName,
          )}
        />
        <ChatInputActionCluster
          canSend={canSend}
          onSend={onSend}
          sendButtonClassName={sendButtonClassName}
          showHistoryControls={isMobile}
          historyState={historyState}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>
    );
  },
);

const ProsemarkChatInput = forwardRef<ChatInputHandle, ChatInputBaseProps>(
  function ProsemarkChatInput(
    {
      value,
      onValueChange,
      onSend,
      placeholder: placeholderText = "Type a message...",
      disabled = false,
      className,
      textareaClassName,
      sendButtonClassName,
      autoResize = false,
    },
    ref,
  ) {
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";
    const isMobile = useIsMobile();
    const canSend = value.trim().length > 0 && !disabled;
    const [historyState, setHistoryState] = useState<EditorHistoryState>(
      EMPTY_EDITOR_HISTORY_STATE,
    );

    const editorHostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const lastValueRef = useRef(value);
    const onValueChangeRef = useRef(onValueChange);
    const onSendRef = useRef(onSend);
    const canSendRef = useRef(canSend);
    const isDarkRef = useRef(isDark);
    const disabledRef = useRef(disabled);
    const placeholderRef = useRef(placeholderText);
    const resizeInputRef = useRef<() => void>(() => {});
    const themeCompartmentRef = useRef(new Compartment());
    const editableCompartmentRef = useRef(new Compartment());
    const placeholderCompartmentRef = useRef(new Compartment());
    const syncHistoryState = useCallback((view: EditorView | null) => {
      setHistoryState(getCodeMirrorHistoryState(view));
    }, []);

    useEffect(() => {
      onValueChangeRef.current = onValueChange;
    }, [onValueChange]);

    useEffect(() => {
      onSendRef.current = onSend;
    }, [onSend]);

    useEffect(() => {
      canSendRef.current = canSend;
    }, [canSend]);

    useEffect(() => {
      isDarkRef.current = isDark;
    }, [isDark]);

    useEffect(() => {
      disabledRef.current = disabled;
    }, [disabled]);

    useEffect(() => {
      placeholderRef.current = placeholderText;
    }, [placeholderText]);

    useEffect(() => {
      resizeInputRef.current = () => {
        const container = containerRef.current;
        const view = viewRef.current;
        if (!container || !view) return;
        if (!autoResize) {
          container.style.height = "";
          return;
        }
        const styles = window.getComputedStyle(container);
        const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
        const contentHeight = view.contentHeight;
        const nextHeight = Math.min(
          AUTO_RESIZE_MAX_HEIGHT,
          Math.max(
            AUTO_RESIZE_MIN_HEIGHT,
            contentHeight + paddingTop + paddingBottom,
          ),
        );
        container.style.height = `${nextHeight}px`;
      };
      resizeInputRef.current();
    }, [autoResize]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          viewRef.current?.focus();
        },
      }),
      [],
    );

    useEffect(() => {
      const host = editorHostRef.current;
      if (!host) return;

      const updateListener = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (
          !update.transactions.some((transaction) =>
            transaction.annotation(EXTERNAL_UPDATE),
          )
        ) {
          const nextValue = update.state.doc.toString();
          if (nextValue !== lastValueRef.current) {
            lastValueRef.current = nextValue;
            onValueChangeRef.current(nextValue);
            resizeInputRef.current();
          }
        }
        syncHistoryState(update.view);
      });

      const sendOnEnter = () => {
        if (!canSendRef.current) {
          return true;
        }
        onSendRef.current();
        return true;
      };

      const keymapExtension = Prec.high(
        keymap.of([
          {
            key: "Enter",
            run: () => sendOnEnter(),
          },
          {
            key: "Shift-Enter",
            run: insertNewlineAndIndent,
          },
        ]),
      );

      const state = EditorState.create({
        doc: lastValueRef.current,
        extensions: [
          EditorView.lineWrapping,
          markdown({
            codeLanguages: languages,
            extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
          }),
          prosemarkBasicSetup(),
          prosemarkBaseThemeSetup(),
          prosemarkInputTheme,
          updateListener,
          keymapExtension,
          themeCompartmentRef.current.of(
            isDarkRef.current ? prosemarkDarkTheme : [],
          ),
          editableCompartmentRef.current.of(
            EditorView.editable.of(!disabledRef.current),
          ),
          placeholderCompartmentRef.current.of(
            placeholder(placeholderRef.current),
          ),
        ],
      });

      const view = new EditorView({
        state,
        parent: host,
      });

      viewRef.current = view;
      resizeInputRef.current();
      syncHistoryState(view);

      return () => {
        view.destroy();
        viewRef.current = null;
        setHistoryState(EMPTY_EDITOR_HISTORY_STATE);
      };
    }, [syncHistoryState]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: [
          themeCompartmentRef.current.reconfigure(
            isDark ? prosemarkDarkTheme : [],
          ),
          editableCompartmentRef.current.reconfigure(
            EditorView.editable.of(!disabled),
          ),
          placeholderCompartmentRef.current.reconfigure(
            placeholder(placeholderText),
          ),
        ],
      });
    }, [isDark, disabled, placeholderText]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentValue = view.state.doc.toString();
      if (currentValue === value) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: [
          // Parent-driven draft updates should replace the visible value
          // without creating a fresh local history checkpoint.
          EXTERNAL_UPDATE.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
      lastValueRef.current = value;
      resizeInputRef.current();
      syncHistoryState(view);
    }, [syncHistoryState, value]);

    const handleUndo = useCallback(() => {
      const view = viewRef.current;
      if (view === null) {
        return;
      }

      if (undo(view)) {
        syncHistoryState(view);
      }
      view.focus();
    }, [syncHistoryState]);

    const handleRedo = useCallback(() => {
      const view = viewRef.current;
      if (view === null) {
        return;
      }

      if (redo(view)) {
        syncHistoryState(view);
      }
      view.focus();
    }, [syncHistoryState]);

    return (
      <div className={cn("flex items-end gap-2", className)}>
        <div
          className={cn(
            "max-h-60 min-h-[4.5rem] flex-1 overflow-y-auto corner-notch-1 border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",
            disabled && "opacity-60",
            textareaClassName,
          )}
          ref={containerRef}
        >
          <div ref={editorHostRef} />
        </div>
        <ChatInputActionCluster
          canSend={canSend}
          onSend={onSend}
          sendButtonClassName={sendButtonClassName}
          showHistoryControls={isMobile}
          historyState={historyState}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>
    );
  },
);

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ mode = "simple", ...props }, ref) {
    if (mode === "prosemark") {
      return <ProsemarkChatInput {...props} ref={ref} />;
    }
    return <SimpleChatInput {...props} ref={ref} />;
  },
);

ChatInput.displayName = "ChatInput";
