import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Compartment,
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
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
  editable?: boolean;
  highlightedLineNumbers?: number[];
  lineHighlightTone?: "add" | "remove";
};

function getHighlightClassName(lineHighlightTone: "add" | "remove"): string {
  return lineHighlightTone === "remove"
    ? "cm-line-highlight-remove"
    : "cm-line-highlight-add";
}

function buildLineHighlights(
  doc: EditorState["doc"],
  highlightedLineNumbers: readonly number[],
  lineClassName: string,
): DecorationSet {
  if (highlightedLineNumbers.length === 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();

  for (const lineNumber of highlightedLineNumbers) {
    if (lineNumber < 1 || lineNumber > doc.lines) continue;
    const line = doc.line(lineNumber);
    builder.add(
      line.from,
      line.from,
      Decoration.line({ class: lineClassName }),
    );
  }

  return builder.finish();
}

function createLineHighlightExtension(
  highlightedLineNumbers: readonly number[],
  lineHighlightTone: "add" | "remove",
): Extension {
  if (highlightedLineNumbers.length === 0) {
    return [];
  }

  const lineClassName = getHighlightClassName(lineHighlightTone);

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLineHighlights(
          view.state.doc,
          highlightedLineNumbers,
          lineClassName,
        );
      }

      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        this.decorations = buildLineHighlights(
          update.state.doc,
          highlightedLineNumbers,
          lineClassName,
        );
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

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
    private collapseTimeout: number | null = null;

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
      this.collapseTimeout = window.setTimeout(() => {
        this.collapseTimeout = null;
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

    destroy() {
      if (this.collapseTimeout !== null) {
        window.clearTimeout(this.collapseTimeout);
        this.collapseTimeout = null;
      }
      this.isScheduled = false;
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
  ".cm-line.cm-line-highlight-add": {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: "4px",
  },
  ".cm-line.cm-line-highlight-remove": {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderRadius: "4px",
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
  "& .cm-rendered-list-mark": {
    display: "inline-block",
    width: "1ch !important",
    margin: "0 !important",
    textAlign: "center",
  },
});

const prosemarkHiddenCursorTheme = EditorView.theme({
  ".cm-cursor": {
    display: "none",
  },
});

export function ProsemarkReadOnly({
  value,
  className,
  editable = false,
  highlightedLineNumbers = [],
  lineHighlightTone = "add",
}: ProsemarkReadOnlyProps) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef(value);
  const editableRef = useRef(editable);
  const isDarkRef = useRef(isDark);
  const themeCompartmentRef = useRef(new Compartment());
  const interactionCompartmentRef = useRef(new Compartment());
  const cursorCompartmentRef = useRef(new Compartment());
  const lineHighlightsCompartmentRef = useRef(new Compartment());
  const lineHighlightToneRef = useRef(lineHighlightTone);
  const lastWidthRef = useRef<number | null>(null);
  const normalizedHighlightedLineNumbers = useMemo(() => {
    const deduped = Array.from(
      new Set(
        highlightedLineNumbers.filter(
          (lineNumber) => Number.isInteger(lineNumber) && lineNumber > 0,
        ),
      ),
    );
    deduped.sort((left, right) => left - right);
    return deduped;
  }, [highlightedLineNumbers]);
  const normalizedHighlightedLineNumbersRef = useRef(
    normalizedHighlightedLineNumbers,
  );

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

  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  useEffect(() => {
    lineHighlightToneRef.current = lineHighlightTone;
  }, [lineHighlightTone]);

  useEffect(() => {
    normalizedHighlightedLineNumbersRef.current =
      normalizedHighlightedLineNumbers;
  }, [normalizedHighlightedLineNumbers]);

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
        interactionCompartmentRef.current.of([
          EditorState.readOnly.of(!editableRef.current),
          EditorView.editable.of(editableRef.current),
        ]),
        cursorCompartmentRef.current.of(
          !editableRef.current ? prosemarkHiddenCursorTheme : [],
        ),
        lineHighlightsCompartmentRef.current.of(
          createLineHighlightExtension(
            normalizedHighlightedLineNumbersRef.current,
            lineHighlightToneRef.current,
          ),
        ),
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
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        interactionCompartmentRef.current.reconfigure([
          EditorState.readOnly.of(!editable),
          EditorView.editable.of(editable),
        ]),
        cursorCompartmentRef.current.reconfigure(
          !editable ? prosemarkHiddenCursorTheme : [],
        ),
      ],
    });
  }, [editable]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineHighlightsCompartmentRef.current.reconfigure(
        createLineHighlightExtension(
          normalizedHighlightedLineNumbers,
          lineHighlightTone,
        ),
      ),
    });
    resizeToContent();
  }, [lineHighlightTone, normalizedHighlightedLineNumbers, resizeToContent]);

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
