import { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, DecorationSet } from "@codemirror/view";

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

export function buildBlurHideDecorations(state: EditorState): DecorationSet {
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
  // Decoration.set(..., true) expects sorted ranges; syntaxTree and
  // node.cursor().iterate() yield nodes in document order, and onHide must only
  // emit ranges within the current node to preserve ordering.
  return Decoration.set(decorations, true);
}
