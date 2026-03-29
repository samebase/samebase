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
import {
  TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME,
  buildTrailingBlankLineCollapseDecorations,
} from "@/components/prosemarkTrailingBlankLine";

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

function hasLineDecorationClassAt(
  decorations: DecorationSet,
  pos: number,
  className: string,
) {
  let found = false;
  decorations.between(pos, pos + 1, (_from, _to, value) => {
    const spec = value.spec;
    if (typeof spec !== "object" || spec === null || !("class" in spec)) {
      return;
    }
    if (spec.class !== className) return;
    found = true;
  });
  return found;
}

function createState(doc: string, anchor: number, head?: number) {
  return EditorState.create({
    doc,
    selection: head === undefined ? { anchor } : { anchor, head },
    extensions: [
      markdown({
        codeLanguages: languages,
        extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
      }),
      bulletListExtension,
    ],
  });
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

    const state = createState(documentText, firstDash, secondDash);

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

    const state = createState(documentText, blankLineAnchor);

    const decorations = state.field(foldExtension);
    expect(hasWidgetDecorationAt(decorations, firstDash)).toBe(true);
    expect(hasWidgetDecorationAt(decorations, secondDash)).toBe(true);
  });
});

describe("ProsemarkReadOnly trailing newline collapse", () => {
  it("collapses the synthetic trailing blank line in read-only mode", () => {
    const state = createState("First line\nSecond line\n", 0);
    const lastLine = state.doc.line(state.doc.lines);
    const decorations = buildTrailingBlankLineCollapseDecorations({
      doc: state.doc,
      editable: false,
    });

    expect(
      hasLineDecorationClassAt(
        decorations,
        lastLine.from,
        TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME,
      ),
    ).toBe(true);
  });

  it("keeps the trailing blank line available in editable mode", () => {
    const state = createState("First line\n", 0);
    const lastLine = state.doc.line(state.doc.lines);
    const decorations = buildTrailingBlankLineCollapseDecorations({
      doc: state.doc,
      editable: true,
    });

    expect(
      hasLineDecorationClassAt(
        decorations,
        lastLine.from,
        TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME,
      ),
    ).toBe(false);
  });

  it("does not add a collapse decoration when the document has no trailing blank line", () => {
    const state = createState("First line\nSecond line", 0);
    const lastLine = state.doc.line(state.doc.lines);
    const decorations = buildTrailingBlankLineCollapseDecorations({
      doc: state.doc,
      editable: false,
    });

    expect(
      hasLineDecorationClassAt(
        decorations,
        lastLine.from,
        TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME,
      ),
    ).toBe(false);
  });
});
