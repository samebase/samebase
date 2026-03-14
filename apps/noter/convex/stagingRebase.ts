import { applyPatch, createTwoFilesPatch, diffLines } from "diff";

type RebaseInput = {
  baseContent: string;
  stagedContent: string;
  upstreamContent: string;
};

type RebaseResult = {
  content: string;
  hasConflict: boolean;
};

const ANCHOR_CONTEXT_LINE_COUNT = 3;

function buildConflictContent(ours: string, theirs: string): string {
  return ["<<<<<<< noter", ours, "=======", theirs, ">>>>>>> main"].join("\n");
}

function splitLogicalLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }
  const parts = content.split("\n");
  if (parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

function joinLogicalLines(lines: string[], trailingNewline: boolean): string {
  const joined = lines.join("\n");
  if (trailingNewline) {
    return joined.length === 0 ? "\n" : `${joined}\n`;
  }
  return joined;
}

function splitDiffPartLines(value: string): string[] {
  return splitLogicalLines(value);
}

function findSequenceStart(
  lines: string[],
  sequence: string[],
  startIndex: number,
): number | null {
  if (sequence.length === 0) {
    return startIndex <= lines.length ? startIndex : null;
  }

  for (let i = startIndex; i <= lines.length - sequence.length; i++) {
    let matched = true;
    for (let j = 0; j < sequence.length; j++) {
      if (lines[i + j] !== sequence[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }

  return null;
}

function mergeInsertionOnlyEdits(args: RebaseInput): string | null {
  const parts = diffLines(args.baseContent, args.stagedContent);
  if (parts.some((part) => part.removed)) {
    return null;
  }

  const upstreamTrailingNewline = args.upstreamContent.endsWith("\n");
  const mergedLines = splitLogicalLines(args.upstreamContent);
  let searchCursor = 0;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part.added) {
      continue;
    }

    const insertedLines = splitDiffPartLines(part.value);
    if (insertedLines.length === 0) {
      continue;
    }

    const previousContextPartLines = (() => {
      for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
        const previousPart = parts[previousIndex];
        if (previousPart.added) {
          continue;
        }
        return splitDiffPartLines(previousPart.value);
      }
      return null;
    })();

    const nextContextPartLines = (() => {
      for (let nextIndex = index + 1; nextIndex < parts.length; nextIndex++) {
        const nextPart = parts[nextIndex];
        if (nextPart.added) {
          continue;
        }
        return splitDiffPartLines(nextPart.value);
      }
      return null;
    })();

    const previousContextLines =
      previousContextPartLines === null
        ? []
        : nextContextPartLines === null
          ? previousContextPartLines
          : previousContextPartLines.slice(-ANCHOR_CONTEXT_LINE_COUNT);

    const nextContextLines =
      nextContextPartLines === null
        ? []
        : previousContextPartLines === null
          ? nextContextPartLines
          : nextContextPartLines.slice(0, ANCHOR_CONTEXT_LINE_COUNT);

    const insertionStart =
      previousContextLines.length === 0
        ? searchCursor
        : (() => {
            const previousMatch = findSequenceStart(
              mergedLines,
              previousContextLines,
              searchCursor,
            );
            return previousMatch === null
              ? null
              : previousMatch + previousContextLines.length;
          })();
    if (insertionStart === null) {
      return null;
    }

    const nextMatch =
      nextContextLines.length === 0
        ? mergedLines.length
        : findSequenceStart(mergedLines, nextContextLines, insertionStart);
    if (nextMatch === null || nextMatch < insertionStart) {
      return null;
    }

    const existingInsertion = findSequenceStart(
      mergedLines,
      insertedLines,
      insertionStart,
    );
    if (existingInsertion === insertionStart) {
      searchCursor = existingInsertion + insertedLines.length;
      continue;
    }

    mergedLines.splice(insertionStart, 0, ...insertedLines);
    searchCursor = insertionStart + insertedLines.length;
  }

  return joinLogicalLines(mergedLines, upstreamTrailingNewline);
}

export function rebaseStagedContent({
  baseContent,
  stagedContent,
  upstreamContent,
}: RebaseInput): RebaseResult {
  if (stagedContent === upstreamContent) {
    return { content: upstreamContent, hasConflict: false };
  }

  if (stagedContent === baseContent) {
    return { content: upstreamContent, hasConflict: false };
  }

  const patch = createTwoFilesPatch(
    "base",
    "staged",
    baseContent,
    stagedContent,
  );

  const rebased = applyPatch(upstreamContent, patch, { fuzzFactor: 1 });
  if (rebased === false) {
    const insertionOnlyMerged = mergeInsertionOnlyEdits({
      baseContent,
      stagedContent,
      upstreamContent,
    });
    if (insertionOnlyMerged !== null) {
      return {
        content: insertionOnlyMerged,
        hasConflict: false,
      };
    }

    return {
      content: buildConflictContent(stagedContent, upstreamContent),
      hasConflict: true,
    };
  }

  return { content: rebased, hasConflict: false };
}
