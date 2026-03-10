import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  rectangularSelection,
} from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { unifiedMergeView } from "@codemirror/merge";
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

export type ProsemarkMergeEditorOptions = {
  allowInlineDiffs: boolean;
  syntaxHighlightDeletions: boolean;
};

type ProsemarkMergeEditorProps = {
  value: string;
  baseValue: string;
  className?: string;
  editable?: boolean;
  options: ProsemarkMergeEditorOptions;
  onChange?: (value: string) => void;
};

const externalValueSyncAnnotation = Annotation.define<boolean>();

function buildMergeExtensions(
  baseValue: string,
  options: ProsemarkMergeEditorOptions,
) {
  return [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    unifiedMergeView({
      original: baseValue,
      allowInlineDiffs: options.allowInlineDiffs,
      gutter: false,
      highlightChanges: true,
      mergeControls: false,
      syntaxHighlightDeletions: options.syntaxHighlightDeletions,
    }),
  ];
}

const prosemarkMergeTheme = EditorView.theme({
  "&.cm-merge-b .cm-changedLine, & .cm-inlineChangedLine": {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  "&.cm-merge-b .cm-changedText": {
    background: "rgba(16, 185, 129, 0.18)",
  },
  "&.cm-merge-b .cm-deletedText": {
    background: "rgba(244, 63, 94, 0.16)",
    color: "rgb(190 24 93)",
  },
  ".cm-deletedChunk": {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    margin: "0",
    paddingLeft: "0",
  },
  ".cm-deletedChunk .cm-line": {
    padding: "0",
  },
  ".cm-deletedChunk .cm-deletedLine, .cm-deletedChunk .cm-deletedText, .cm-deletedChunk .cm-deletedLine del":
    {
      color: "rgb(190 24 93)",
      textDecoration: "none",
    },
  ".cm-deletedChunk .cm-chunkButtons": {
    display: "none",
  },
});

export function ProsemarkMergeEditor({
  value,
  baseValue,
  className,
  editable = false,
  options,
  onChange,
}: ProsemarkMergeEditorProps) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";
  const { allowInlineDiffs, syntaxHighlightDeletions } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef(value);
  const lastBaseValueRef = useRef(baseValue);
  const lastThemeIsDarkRef = useRef(isDark);
  const lastOptionsRef = useRef<ProsemarkMergeEditorOptions>(options);
  const editableRef = useRef(editable);
  const themeCompartmentRef = useRef(new Compartment());
  const interactionCompartmentRef = useRef(new Compartment());
  const cursorCompartmentRef = useRef(new Compartment());
  const mergeCompartmentRef = useRef(new Compartment());
  const lastWidthRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);

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
    editableRef.current = editable;
  }, [editable]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    lastBaseValueRef.current = baseValue;
  }, [baseValue]);

  useEffect(() => {
    lastThemeIsDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    lastOptionsRef.current = options;
  }, [options]);

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
        EditorView.lineWrapping,
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        blurOnOutsidePointerDownExtension,
        collapseSelectionOnBlurExtension,
        prosemarkSurfaceTheme,
        prosemarkMergeTheme,
        interactionCompartmentRef.current.of([
          EditorState.readOnly.of(!editableRef.current),
          EditorView.editable.of(editableRef.current),
        ]),
        cursorCompartmentRef.current.of(
          !editableRef.current ? prosemarkHiddenCursorTheme : [],
        ),
        mergeCompartmentRef.current.of(
          buildMergeExtensions(
            lastBaseValueRef.current,
            lastOptionsRef.current,
          ),
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (
            update.transactions.some((transaction) =>
              transaction.annotation(externalValueSyncAnnotation),
            )
          ) {
            resizeToContent();
            return;
          }
          lastValueRef.current = update.state.doc.toString();
          resizeToContent();
          onChangeRef.current?.(lastValueRef.current);
        }),
        themeCompartmentRef.current.of(
          lastThemeIsDarkRef.current ? oneDark : [],
        ),
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
      effects: mergeCompartmentRef.current.reconfigure(
        buildMergeExtensions(baseValue, {
          allowInlineDiffs,
          syntaxHighlightDeletions,
        }),
      ),
    });
    resizeToContent();
  }, [baseValue, allowInlineDiffs, syntaxHighlightDeletions, resizeToContent]);

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

    view.dispatch({
      annotations: externalValueSyncAnnotation.of(true),
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
      scrollIntoView: false,
    });
    resizeToContent();
  }, [resizeToContent, value]);

  return (
    <div ref={containerRef} className={cn("min-h-[1rem]", className)}>
      <div ref={hostRef} />
    </div>
  );
}
