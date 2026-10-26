import { type ChangeSet, Text } from "@codemirror/state";

export function createCollaborativeText(content: string): Text {
  return Text.of(content.split(/\r\n?|\n/));
}

/** OT counts each line break once. Unchanged raw slices retain their original line endings. */
export function applyCollaborativeChanges(
  content: string,
  changes: ChangeSet,
  initialContent: string,
): string {
  if (changes.length !== createCollaborativeText(content).length) {
    throw new RangeError("Applying change set to a document with the wrong length");
  }
  const lineBreak = content.match(/\r\n?|\n/)?.[0] ?? initialContent.match(/\r\n?|\n/)?.[0] ?? "\n";
  let logicalOffset = 0;
  let rawOffset = 0;
  const rawOffsetAt = (position: number): number => {
    while (logicalOffset < position) {
      rawOffset += content[rawOffset] === "\r" && content[rawOffset + 1] === "\n" ? 2 : 1;
      logicalOffset += 1;
    }
    return rawOffset;
  };

  const slices: string[] = [];
  let previousEndsWithCR = false;
  const appendRawSlice = (slice: string) => {
    if (slice.length === 0) return;
    // Keep separate logical line breaks from forming one CRLF at a splice boundary.
    if (previousEndsWithCR && slice.startsWith("\n")) slices.push("\r");
    slices.push(slice);
    previousEndsWithCR = slice.endsWith("\r");
  };
  let copiedThrough = 0;
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const from = rawOffsetAt(fromA);
    const to = rawOffsetAt(toA);
    appendRawSlice(content.slice(copiedThrough, from));
    appendRawSlice(inserted.sliceString(0, inserted.length, lineBreak));
    copiedThrough = to;
  });
  appendRawSlice(content.slice(copiedThrough));
  return slices.join("");
}
