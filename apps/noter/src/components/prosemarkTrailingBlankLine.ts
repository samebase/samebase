import { RangeSetBuilder, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";

export const TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME =
  "cm-trailing-newline-collapsed";

/**
 * Read-only ProseMark documents often include a trailing newline, which
 * CodeMirror renders as an empty final line. Collapse that synthetic line so
 * viewers do not show a fake bottom gutter while preserving the normal inline
 * padding on real content lines.
 */
export function buildTrailingBlankLineCollapseDecorations(args: {
  doc: Text;
  editable: boolean;
}): DecorationSet {
  const { doc, editable } = args;
  if (editable) {
    return Decoration.none;
  }

  const lastLine = doc.line(doc.lines);
  if (lastLine.text.length > 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  builder.add(
    lastLine.from,
    lastLine.from,
    Decoration.line({ class: TRAILING_BLANK_LINE_COLLAPSED_CLASS_NAME }),
  );
  return builder.finish();
}
