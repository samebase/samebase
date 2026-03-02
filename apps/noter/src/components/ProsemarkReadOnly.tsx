import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
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

function isBlankLineText(text: string): boolean {
  return text.trim().length === 0;
}

function findFirstBlankLineAnchorInString(docText: string): number {
  let lineStart = 0;
  for (let i = 0; i <= docText.length; i++) {
    const isLineEnd = i === docText.length || docText.charCodeAt(i) === 10;
    if (!isLineEnd) continue;

    const lineText = docText.slice(lineStart, i);
    if (isBlankLineText(lineText)) return lineStart;

    lineStart = i + 1;
  }
  return docText.length;
}

function findFirstBlankLineAnchorInDoc(doc: EditorState["doc"]): number {
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (isBlankLineText(line.text)) return line.from;
  }
  return doc.length;
}

function findInitialSafeSelectionAnchor(docText: string): number {
  // Prefer the start of the first blank line so markdown stays folded by
  // default (avoids revealing markers at document start).
  return findFirstBlankLineAnchorInString(docText);
}

const blurOnOutsidePointerDownExtension = ViewPlugin.fromClass(
  class {
    private blurTimeout: number | null = null;

    private onPointerDown = (event: PointerEvent) => {
      // If we click/tap on a non-focusable element (for example whitespace),
      // contenteditable won't necessarily blur by default. Mirror the common
      // "tap outside to dismiss" behavior so we always refold on blur.
      if (!this.view.hasFocus) return;
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.view.dom.contains(target)) return;

      // Defer to avoid browsers immediately restoring focus during the pointer
      // event sequence when no other focusable target exists.
      if (this.blurTimeout !== null) return;
      this.blurTimeout = window.setTimeout(() => {
        this.blurTimeout = null;
        if (!this.view.hasFocus) return;
        this.view.contentDOM.blur();
      }, 0);
    };

    constructor(private view: EditorView) {
      document.addEventListener("pointerdown", this.onPointerDown, true);
    }

    destroy() {
      if (this.blurTimeout !== null) {
        window.clearTimeout(this.blurTimeout);
        this.blurTimeout = null;
      }
      document.removeEventListener("pointerdown", this.onPointerDown, true);
    }
  },
);

const collapseSelectionOnBlurExtension = ViewPlugin.fromClass(
  class {
    private isScheduled = false;

    update(update: ViewUpdate) {
      if (!update.focusChanged || update.view.hasFocus) return;

      const view = update.view;
      if (this.isScheduled) return;

      const safeAnchor = () => findFirstBlankLineAnchorInDoc(view.state.doc);

      const shouldCollapse = () => {
        const anchor = safeAnchor();
        const main = view.state.selection.main;
        return !(
          view.state.selection.ranges.length === 1 &&
          main.anchor === anchor &&
          main.head === anchor
        );
      };

      if (!shouldCollapse()) return;

      this.isScheduled = true;
      // Defer dispatch to avoid "Calls to EditorView.update are not allowed
      // while an update is in progress".
      setTimeout(() => {
        this.isScheduled = false;
        if (view.hasFocus || !view.dom.isConnected) return;
        if (!shouldCollapse()) return;

        // Collapse selection on a markdown-neutral line so Prosemark re-folds
        // list markers (`-`) into bullets and heading markers (`##`) into
        // headings.
        view.dispatch({
          selection: EditorSelection.single(safeAnchor()),
          scrollIntoView: false,
        });
      }, 0);
    }
  },
);

const prosemarkReadOnlyTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
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
  "& .cm-rendered-list-mark": {
    display: "inline-block",
    width: "1ch !important",
    margin: "0 !important",
    textAlign: "center",
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

  const resizeToContent = useCallback(() => {
    const container = containerRef.current;
    const view = viewRef.current;
    if (!container || !view) return;
    view.requestMeasure({
      read: () => view.scrollDOM.scrollHeight,
      write: (height) => {
        container.style.height = `${height}px`;
      },
    });
  }, []);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: lastValueRef.current,
      selection: EditorSelection.single(
        findInitialSafeSelectionAnchor(lastValueRef.current),
      ),
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        blurOnOutsidePointerDownExtension,
        collapseSelectionOnBlurExtension,
        prosemarkReadOnlyTheme,
        EditorState.readOnly.of(true),
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
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
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
    } = {
      changes: { from: 0, to: view.state.doc.length, insert: value },
      scrollIntoView: false,
    };
    view.dispatch(transaction);
    resizeToContent();
  }, [value, resizeToContent]);

  return (
    <div ref={containerRef} className={cn("min-h-[1rem]", className)}>
      <div ref={hostRef} />
    </div>
  );
}
