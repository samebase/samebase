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
import { unifiedMergeView } from "@codemirror/merge";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  prosemarkMergeViewConfigsEqual,
  resolveProsemarkMergeViewConfig,
  type ProsemarkMergeViewConfig,
} from "@/lib/prosemarkMergeViewConfig";
import {
  blurOnOutsidePointerDownExtension,
  collapseSelectionOnBlurExtension,
  findInitialSafeSelectionAnchor,
  getProsemarkFileThemeExtensions,
  prosemarkHiddenCursorTheme,
  prosemarkSurfaceTheme,
} from "@/components/prosemarkSurface";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";
import {
  getCodeMirrorFileLanguageKind,
  getInitialCodeMirrorLanguageExtension,
  loadCodeMirrorLanguageExtension,
  type CodeMirrorFileLanguageKind,
} from "@/lib/codemirrorLanguage";

export type ProsemarkMergeEditorOptions = {
  allowInlineDiffs: boolean;
  syntaxHighlightDeletions: boolean;
};

type ProsemarkMergeEditorProps = {
  value: string;
  baseValue: string;
  className?: string;
  editable?: boolean;
  filePath?: string;
  mobilePaneDragEnabled?: boolean;
  options: ProsemarkMergeEditorOptions;
  onChange?: (value: string) => void;
};

const externalValueSyncAnnotation = Annotation.define<boolean>();

function buildMergeExtensions(mergeConfig: ProsemarkMergeViewConfig) {
  return [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    mergeConfig.hideSyntheticTrailingNewlineDeletion
      ? EditorView.editorAttributes.of({
          class: "cm-merge-hide-synthetic-trailing-newline",
        })
      : [],
    unifiedMergeView({
      original: mergeConfig.original,
      allowInlineDiffs: mergeConfig.allowInlineDiffs,
      gutter: false,
      highlightChanges: true,
      mergeControls: false,
      syntaxHighlightDeletions: mergeConfig.syntaxHighlightDeletions,
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
  ".cm-deletedChunk .cm-url, .cm-deletedChunk .cm-rendered-link": {
    color: "inherit",
    cursor: "inherit",
    pointerEvents: "none",
    textDecoration: "none",
  },
  "&.cm-merge-hide-synthetic-trailing-newline .cm-deletedChunk:has(.cm-deletedLine:only-child > del:only-child > br:only-child)":
    {
      display: "none",
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
  filePath,
  mobilePaneDragEnabled = false,
  options,
  onChange,
}: ProsemarkMergeEditorProps) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";
  const { allowInlineDiffs, syntaxHighlightDeletions } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(
    mobilePaneDragEnabled,
    containerRef,
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef(value);
  const lastBaseValueRef = useRef(baseValue);
  const lastThemeIsDarkRef = useRef(isDark);
  const filePathRef = useRef(filePath);
  const lastOptionsRef = useRef<ProsemarkMergeEditorOptions>(options);
  const languageKindRef = useRef<CodeMirrorFileLanguageKind>(
    getCodeMirrorFileLanguageKind(filePath),
  );
  const languageCompartmentRef = useRef(new Compartment());
  const editableRef = useRef(editable);
  const themeCompartmentRef = useRef(new Compartment());
  const interactionCompartmentRef = useRef(new Compartment());
  const cursorCompartmentRef = useRef(new Compartment());
  const mergeCompartmentRef = useRef(new Compartment());
  const lastMergeConfigRef = useRef<ProsemarkMergeViewConfig | null>(null);
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
    filePathRef.current = filePath;
    languageKindRef.current = getCodeMirrorFileLanguageKind(filePath);
  }, [filePath]);

  useEffect(() => {
    lastOptionsRef.current = options;
  }, [options]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initialMergeConfig = resolveProsemarkMergeViewConfig(
      lastValueRef.current,
      lastBaseValueRef.current,
      lastOptionsRef.current.allowInlineDiffs,
      lastOptionsRef.current.syntaxHighlightDeletions,
    );
    lastMergeConfigRef.current = initialMergeConfig;

    const state = EditorState.create({
      doc: lastValueRef.current,
      selection: EditorSelection.single(
        findInitialSafeSelectionAnchor(lastValueRef.current),
      ),
      extensions: [
        languageCompartmentRef.current.of(
          getInitialCodeMirrorLanguageExtension(filePathRef.current),
        ),
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
          buildMergeExtensions(initialMergeConfig),
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
          getProsemarkFileThemeExtensions({
            isDark: lastThemeIsDarkRef.current,
            languageKind: languageKindRef.current,
          }),
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
    const nextLanguageKind = getCodeMirrorFileLanguageKind(filePath);
    languageKindRef.current = nextLanguageKind;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        getProsemarkFileThemeExtensions({
          isDark,
          languageKind: nextLanguageKind,
        }),
      ),
    });
  }, [filePath, isDark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const nextLanguageKind = getCodeMirrorFileLanguageKind(filePath);
    languageKindRef.current = nextLanguageKind;
    const initialLanguageExtension =
      getInitialCodeMirrorLanguageExtension(filePath);

    // Reset to the synchronous parser immediately so merge surfaces do not
    // briefly highlight the next file with the previous grammar.
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        initialLanguageExtension,
      ),
    });

    let isCurrent = true;

    // Merge view keeps one editor instance alive, so reconfigure the parser in
    // place once the filename-based language loader resolves.
    void loadCodeMirrorLanguageExtension(filePath)
      .then((languageExtension) => {
        if (!isCurrent || !viewRef.current) {
          return;
        }

        viewRef.current.dispatch({
          effects:
            languageCompartmentRef.current.reconfigure(languageExtension),
        });
        resizeToContent();
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        view.dispatch({
          effects: languageCompartmentRef.current.reconfigure(
            initialLanguageExtension,
          ),
        });
        resizeToContent();
      });

    return () => {
      isCurrent = false;
    };
  }, [filePath, resizeToContent]);

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
    const nextMergeConfig = resolveProsemarkMergeViewConfig(
      value,
      baseValue,
      allowInlineDiffs,
      syntaxHighlightDeletions,
    );
    if (
      lastMergeConfigRef.current &&
      prosemarkMergeViewConfigsEqual(
        lastMergeConfigRef.current,
        nextMergeConfig,
      )
    ) {
      resizeToContent();
      return;
    }
    lastMergeConfigRef.current = nextMergeConfig;
    view.dispatch({
      effects: mergeCompartmentRef.current.reconfigure(
        buildMergeExtensions(nextMergeConfig),
      ),
    });
    resizeToContent();
  }, [
    value,
    baseValue,
    allowInlineDiffs,
    syntaxHighlightDeletions,
    resizeToContent,
  ]);

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
    <div
      ref={containerRef}
      className={cn("min-h-[1rem]", className)}
      style={{ touchAction: mobilePaneDrag.touchAction }}
      {...mobilePaneDrag.containerProps}
    >
      <div ref={hostRef} />
    </div>
  );
}
