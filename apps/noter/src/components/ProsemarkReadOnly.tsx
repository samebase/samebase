import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Compartment, EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
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

type BlurHideSpec = {
  nodeName: string | string[] | ((name: string) => boolean);
  subNodeNameToHide?: string | string[];
  block?: boolean;
  keepSpace?: boolean;
  onHide?: (
    state: EditorState,
    node: SyntaxNodeLike,
  ) => Range<Decoration> | Range<Decoration>[] | null | undefined;
};

type SyntaxNodeLike = {
  type: { name: string };
  from: number;
  to: number;
  node: {
    firstChild: { from: number; to: number } | null;
    cursor: () => {
      iterate: (
        callback: (child: {
          type: { name: string };
          from: number;
          to: number;
        }) => void,
      ) => void;
    };
  };
};

const hideInlineDecoration = Decoration.mark({ class: "cm-hidden-token" });
const hideInlineKeepSpaceDecoration = Decoration.mark({
  class: "cm-transparent-token",
});
const hideBlockDecoration = Decoration.replace({ block: true });
const renderedLinkDecoration = Decoration.mark({ class: "cm-rendered-link" });

const blurHideSpecs: BlurHideSpec[] = [
  {
    nodeName: (name) => name.startsWith("ATXHeading"),
    onHide: (_state, node) => {
      const headerMark = node.node.firstChild;
      if (!headerMark) return null;
      return hideInlineDecoration.range(
        headerMark.from,
        Math.min(headerMark.to + 1, node.to),
      );
    },
  },
  {
    nodeName: (name) => name.startsWith("SetextHeading"),
    subNodeNameToHide: "HeaderMark",
    block: true,
  },
  {
    nodeName: ["StrongEmphasis", "Emphasis"],
    subNodeNameToHide: "EmphasisMark",
  },
  {
    nodeName: "InlineCode",
    subNodeNameToHide: "CodeMark",
  },
  {
    nodeName: "Link",
    subNodeNameToHide: ["LinkMark", "URL"],
    onHide: (_state, node) => {
      return renderedLinkDecoration.range(node.from, node.to);
    },
  },
  {
    nodeName: "Strikethrough",
    subNodeNameToHide: "StrikethroughMark",
  },
  {
    nodeName: "Escape",
    subNodeNameToHide: "EscapeMark",
  },
  {
    nodeName: "FencedCode",
    subNodeNameToHide: ["CodeMark", "CodeInfo"],
  },
  {
    nodeName: "Blockquote",
    subNodeNameToHide: "QuoteMark",
    keepSpace: true,
  },
];

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

function buildBlurHideDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      for (const spec of blurHideSpecs) {
        if (!matchesNodeName(node.type.name, spec.nodeName)) continue;
        if (spec.onHide) {
          const res = spec.onHide(state, node);
          if (Array.isArray(res)) {
            decorations.push(...res);
          } else if (res) {
            decorations.push(res);
          }
        }
        if (spec.subNodeNameToHide) {
          const names = Array.isArray(spec.subNodeNameToHide)
            ? spec.subNodeNameToHide
            : [spec.subNodeNameToHide];
          const decoration = spec.block
            ? hideBlockDecoration
            : spec.keepSpace
              ? hideInlineKeepSpaceDecoration
              : hideInlineDecoration;
          node.node.cursor().iterate((child) => {
            if (!names.includes(child.type.name)) return;
            decorations.push(decoration.range(child.from, child.to));
          });
        }
      }
    },
  });
  return Decoration.set(decorations, true);
}

function matchesNodeName(
  nodeName: string,
  specName: BlurHideSpec["nodeName"],
): boolean {
  if (typeof specName === "string") {
    return nodeName === specName;
  }
  if (Array.isArray(specName)) {
    return specName.includes(nodeName);
  }
  return specName(nodeName);
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
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        blurHideTokensExtension,
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
