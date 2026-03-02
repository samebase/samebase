import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { prosemarkMarkdownSyntaxExtensions } from "@prosemark/core";
import { buildBlurHideDecorations } from "./prosemarkReadOnlyDecorations";

function getHiddenTokenRanges(
  documentText: string,
  decorations: ReturnType<typeof buildBlurHideDecorations>,
): { from: number; to: number }[] {
  const hiddenRanges: { from: number; to: number }[] = [];
  decorations.between(0, documentText.length, (from, to, value) => {
    const spec = value.spec;
    if (typeof spec !== "object" || spec === null || !("class" in spec)) {
      return;
    }
    if (spec.class !== "cm-hidden-token") {
      return;
    }
    hiddenRanges.push({ from, to });
  });
  return hiddenRanges;
}

describe("buildBlurHideDecorations", () => {
  it("hides heading markers when selection starts at document start", () => {
    const documentText = "## Noter";
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: 0 },
      extensions: [
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
      ],
    });

    const decorations = buildBlurHideDecorations(state);
    const hiddenRanges = getHiddenTokenRanges(documentText, decorations);

    expect(hiddenRanges.length).toBeGreaterThan(0);
    expect(hiddenRanges[0]).toEqual({ from: 0, to: 3 });
  });
});
