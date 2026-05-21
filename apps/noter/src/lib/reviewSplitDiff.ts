import { diffLines } from "diff";

export type ReviewSplitDiffHighlights = {
  oldLines: number[];
  newLines: number[];
};

function getLineCountFromDiffPart(value: string | undefined, count: number | undefined): number {
  if (typeof count === "number") {
    return count;
  }
  if (!value || value.length === 0) {
    return 0;
  }
  let lines = value.split("\n").length;
  if (value.endsWith("\n")) {
    lines -= 1;
  }
  return lines;
}

export function getReviewSplitDiffHighlights(
  oldContent: string,
  newContent: string,
): ReviewSplitDiffHighlights {
  const oldLines = new Set<number>();
  const newLines = new Set<number>();
  let oldLinePointer = 1;
  let newLinePointer = 1;

  for (const part of diffLines(oldContent, newContent)) {
    const lineCount = getLineCountFromDiffPart(part.value, part.count);
    if (lineCount === 0) {
      continue;
    }

    if (part.removed) {
      for (let index = 0; index < lineCount; index += 1) {
        oldLines.add(oldLinePointer + index);
      }
      oldLinePointer += lineCount;
      continue;
    }

    if (part.added) {
      for (let index = 0; index < lineCount; index += 1) {
        newLines.add(newLinePointer + index);
      }
      newLinePointer += lineCount;
      continue;
    }

    oldLinePointer += lineCount;
    newLinePointer += lineCount;
  }

  return {
    oldLines: [...oldLines].sort((left, right) => left - right),
    newLines: [...newLines].sort((left, right) => left - right),
  };
}
