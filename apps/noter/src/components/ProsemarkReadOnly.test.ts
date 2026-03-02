import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  bulletListExtension,
  foldExtension,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";

function hasWidgetDecorationAt(decorations: DecorationSet, pos: number) {
  let found = false;
  decorations.between(pos, pos + 1, (_from, _to, value) => {
    const spec = value.spec;
    if (typeof spec !== "object" || spec === null || !("widget" in spec)) {
      return;
    }
    if (spec.widget == null) return;
    found = true;
  });
  return found;
}

describe("ProsemarkReadOnly selection folding", () => {
  it("unfolds bullet list markers while selected (shows `-`)", () => {
    const documentText = `## Title

- first
- second`;
    const firstDash = documentText.indexOf("- first");
    const secondDash = documentText.indexOf("- second");
    expect(firstDash).toBeGreaterThanOrEqual(0);
    expect(secondDash).toBeGreaterThan(firstDash);

    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: firstDash, head: secondDash },
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        bulletListExtension,
      ],
    });

    const decorations = state.field(foldExtension);
    expect(hasWidgetDecorationAt(decorations, firstDash)).toBe(false);
    expect(hasWidgetDecorationAt(decorations, secondDash)).toBe(false);
  });

  it("folds bullet list markers when selection is on a blank line (shows bullets)", () => {
    const documentText = `## Title

- first
- second`;
    const firstDash = documentText.indexOf("- first");
    const secondDash = documentText.indexOf("- second");
    expect(firstDash).toBeGreaterThanOrEqual(0);
    expect(secondDash).toBeGreaterThan(firstDash);

    const blankLineAnchor = documentText.indexOf("\n\n") + 1;
    expect(blankLineAnchor).toBeGreaterThan(0);

    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: blankLineAnchor },
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        bulletListExtension,
      ],
    });

    const decorations = state.field(foldExtension);
    expect(hasWidgetDecorationAt(decorations, firstDash)).toBe(true);
    expect(hasWidgetDecorationAt(decorations, secondDash)).toBe(true);
  });
});
