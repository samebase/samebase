import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { Send } from "lucide-react";
import { cn } from "#src/lib/utils.ts";
import { Annotation, EditorState, Prec, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { useTheme } from "next-themes";
import { prosemarkDarkTheme } from "#src/components/prosemarkSurface.ts";

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
    const canSend = value.trim().length > 0 && !disabled;

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

    return (
      <div className={cn("flex items-end gap-2", className)}>
        <textarea
          ref={textareaRef}
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
          disabled={disabled}
          className={cn(
            "max-h-60 min-h-[4.5rem] flex-1 resize-none corner-notch-1 border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            textareaClassName,
          )}
        />
        <button
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
    const canSend = value.trim().length > 0 && !disabled;

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
          update.transactions.some((transaction) =>
            transaction.annotation(EXTERNAL_UPDATE),
          )
        ) {
          return;
        }
        const nextValue = update.state.doc.toString();
        if (nextValue === lastValueRef.current) return;
        lastValueRef.current = nextValue;
        onValueChangeRef.current(nextValue);
        resizeInputRef.current();
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

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

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
        annotations: EXTERNAL_UPDATE.of(true),
      });
      lastValueRef.current = value;
      resizeInputRef.current();
    }, [value]);

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
        <button
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
