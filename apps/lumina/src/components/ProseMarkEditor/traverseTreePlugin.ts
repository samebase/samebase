// A plugin to help with debugging / inspecting the syntax tree

import { EditorView } from "codemirror";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Range } from "@codemirror/state";

function traverseTree(view: EditorView) {
  console.log("Traversing tree...");
  const widgets: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (
          view.state.selection.ranges.some(
            (range) => node.from <= range.to && range.from <= node.to,
          )
        ) {
          console.log(node.type, node.name);
        }
      },
    });
  }
  return Decoration.set(widgets, true);
}

export const traverseTreePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = traverseTree(view);
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) != syntaxTree(update.state)
      )
        this.decorations = traverseTree(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,

    // eventHandlers: {
    //   mousedown: (e, view) => {
    //     let target = e.target as HTMLElement;
    //     // console.log(target);
    //   },
    // },
    // provide: (p) => [
    //   EditorState.changeFilter.of((tr) => {
    //     if (tr.selection) console.log(tr.selection.ranges[0]);
    //     return true;
    //   }),
    // ],
  },
);
