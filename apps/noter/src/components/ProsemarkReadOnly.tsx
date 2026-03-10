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
import {
  blurOnOutsidePointerDownExtension,
  collapseSelectionOnBlurExtension,
  findInitialSafeSelectionAnchor,
  prosemarkHiddenCursorTheme,
  prosemarkSurfaceTheme,
} from "@/components/prosemarkSurface";

type ProsemarkReadOnlyProps = {
  value: string;
  className?: string;
  editable?: boolean;
  highlightedLineNumbers?: number[];
  lineHighlightTone?: "add" | "remove";
  onChange?: (value: string) => void;
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

const prosemarkReadOnlyTheme = EditorView.theme({
  ".cm-line.cm-line-highlight-add": {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  ".cm-line.cm-line-highlight-remove": {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
  },
});

export function ProsemarkReadOnly({
  value,
  className,
  editable = false,
  highlightedLineNumbers = [],
  lineHighlightTone = "add",
  onChange,
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
  const decorationsCompartmentRef = useRef(new Compartment());
  const lineHighlightToneRef = useRef(lineHighlightTone);
  const lastWidthRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
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
    onChangeRef.current = onChange;
  }, [onChange]);

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
        prosemarkSurfaceTheme,
        prosemarkReadOnlyTheme,
        interactionCompartmentRef.current.of([
          EditorState.readOnly.of(!editableRef.current),
          EditorView.editable.of(editableRef.current),
        ]),
        cursorCompartmentRef.current.of(
          !editableRef.current ? prosemarkHiddenCursorTheme : [],
        ),
        decorationsCompartmentRef.current.of(
          createLineHighlightExtension(
            normalizedHighlightedLineNumbersRef.current,
            lineHighlightToneRef.current,
          ),
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          lastValueRef.current = update.state.doc.toString();
          resizeToContent();
          onChangeRef.current?.(lastValueRef.current);
        }),
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
      effects: decorationsCompartmentRef.current.reconfigure(
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
