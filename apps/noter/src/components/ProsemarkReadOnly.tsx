import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  foldableSyntaxFacet,
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { buildBlurHideDecorations } from "./prosemarkReadOnlyDecorations";

type ProsemarkReadOnlyProps = {
  value: string;
  className?: string;
};

class BulletPoint extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-rendered-list-mark";
    span.textContent = "•";
    return span;
  }

  ignoreEvent(_event: Event) {
    return false;
  }
}

// In a read-only view, text selection is for copy, not editing. Keep bullet
// list markers rendered as bullets even when the selection spans list items.
const bulletListKeepDecorationOnSelectExtension = foldableSyntaxFacet.of({
  nodePath: "BulletList/ListItem/ListMark",
  keepDecorationOnUnfold: true,
  buildDecorations: (_state, node, selectionTouchesRange) => {
    if (!selectionTouchesRange) return;
    const cursor = node.node.cursor();
    if (cursor.nextSibling() && cursor.name === "Task") {
      return;
    }
    return Decoration.replace({ widget: new BulletPoint() }).range(
      node.from,
      node.to,
    );
  },
});

const blurHideTokensExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = view.hasFocus
        ? Decoration.none
        : buildBlurHideDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.focusChanged) return;
      this.decorations = update.view.hasFocus
        ? Decoration.none
        : buildBlurHideDecorations(update.state);
    }
  },
  {
    decorations: (view) => view.decorations,
  },
);

const collapseSelectionOnBlurExtension = ViewPlugin.fromClass(
  class {
    private isScheduled = false;

    update(update: ViewUpdate) {
      if (!update.focusChanged || update.view.hasFocus) return;

      const view = update.view;
      if (this.isScheduled) return;

      const shouldCollapse = () => {
        const anchor = view.state.doc.length;
        const main = view.state.selection.main;
        return !(
          view.state.selection.ranges.length === 1 &&
          main.anchor === anchor &&
          main.head === anchor
        );
      };

      if (!shouldCollapse()) return;

      this.isScheduled = true;
      queueMicrotask(() => {
        this.isScheduled = false;
        if (view.hasFocus || !view.dom.isConnected) return;
        if (!shouldCollapse()) return;

        // Collapse selection so fold/hide extensions return to the rendered view.
        view.dispatch({
          selection: EditorSelection.single(view.state.doc.length),
          scrollIntoView: false,
        });
      });
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
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        bulletListKeepDecorationOnSelectExtension,
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        blurHideTokensExtension,
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
