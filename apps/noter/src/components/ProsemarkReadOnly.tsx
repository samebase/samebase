import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { EditorSelection, EditorState, Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type ProsemarkReadOnlyProps = {
  value: string;
  className?: string;
};

const BLOCK_TOKEN_RE = /^\\s*(#{1,6}\\s|>\\s|[-*+]\\s|\\d+\\.\\s|```|\\|)/;

function findSelectionAnchor(text: string): number {
  const lines = text.split(/\\r?\\n/);
  let offset = 0;
  for (const line of lines) {
    if (!BLOCK_TOKEN_RE.test(line)) {
      return offset + line.length;
    }
    offset += line.length + 1;
  }
  return text.length;
}

const prosemarkReadOnlyTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
    color: "inherit",
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
    height: "auto",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-cursor": {
    display: "none",
  },
});

export function ProsemarkReadOnly({
  value,
  className,
}: ProsemarkReadOnlyProps) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef(value);
  const isDarkRef = useRef(isDark);
  const themeCompartmentRef = useRef(new Compartment());
  const lastWidthRef = useRef<number | null>(null);

  const resizeToContent = useMemo(
    () => () => {
      const container = containerRef.current;
      const view = viewRef.current;
      if (!container || !view) return;
      view.requestMeasure({
        read: () => view.scrollDOM.scrollHeight,
        write: (height) => {
          container.style.height = `${height}px`;
        },
      });
    },
    [],
  );

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: lastValueRef.current,
      selection: EditorSelection.single(
        findSelectionAnchor(lastValueRef.current),
      ),
      extensions: [
        EditorView.updateListener.of((update) => {
          if (!update.focusChanged || update.view.hasFocus) {
            return;
          }
          const anchor = findSelectionAnchor(update.state.doc.toString());
          if (update.state.selection.main.head === anchor) {
            return;
          }
          update.view.dispatch({
            selection: EditorSelection.single(anchor),
            scrollIntoView: false,
          });
        }),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        prosemarkReadOnlyTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        themeCompartmentRef.current.of(isDarkRef.current ? oneDark : []),
      ],
    });

    const view = new EditorView({
      state,
      parent: host,
    });
    viewRef.current = view;
    resizeToContent();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [resizeToContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (view.dom.contains(target)) return;
      const anchor = findSelectionAnchor(view.state.doc.toString());
      if (view.state.selection.main.head !== anchor) {
        view.dispatch({
          selection: EditorSelection.single(anchor),
          scrollIntoView: false,
        });
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (view.dom.contains(target)) return;
      const anchor = findSelectionAnchor(view.state.doc.toString());
      if (view.state.selection.main.head === anchor) return;
      requestAnimationFrame(() => {
        const currentView = viewRef.current;
        if (!currentView) return;
        currentView.dispatch({
          selection: EditorSelection.single(anchor),
          scrollIntoView: false,
        });
      });
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (lastWidthRef.current === width) return;
      lastWidthRef.current = width;
      resizeToContent();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeToContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    lastValueRef.current = value;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      resizeToContent();
      return;
    }
    const transaction: {
      changes: { from: number; to: number; insert: string };
      scrollIntoView: boolean;
      selection?: EditorSelection;
    } = {
      changes: { from: 0, to: view.state.doc.length, insert: value },
      scrollIntoView: false,
    };
    if (!view.hasFocus) {
      transaction.selection = EditorSelection.single(
        findSelectionAnchor(value),
      );
    }
    view.dispatch(transaction);
    resizeToContent();
  }, [value, resizeToContent]);

  return (
    <div ref={containerRef} className={cn("min-h-[1rem]", className)}>
      <div ref={hostRef} />
    </div>
  );
}
