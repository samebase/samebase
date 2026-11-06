import { applyPatch, createTwoFilesPatch, diffArrays, diffLines } from "diff";

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
  return ["<<<<<<< samebase", ours, "=======", theirs, ">>>>>>> main"].join("\n");
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

function findSequenceStart(lines: string[], sequence: string[], startIndex: number): number | null {
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
  const contextParts = parts.filter((part) => !part.added).values();
  let nextContextPart = contextParts.next();
  let previousContextPartLines: string[] | null = null;

  for (const part of parts) {
    if (!part.added) {
      previousContextPartLines = splitDiffPartLines(part.value);
      nextContextPart = contextParts.next();
      continue;
    }

    const insertedLines = splitDiffPartLines(part.value);
    if (insertedLines.length === 0) {
      continue;
    }

    const nextContextPartLines = nextContextPart.done
      ? null
      : splitDiffPartLines(nextContextPart.value.value);

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
            return previousMatch === null ? null : previousMatch + previousContextLines.length;
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

    const existingInsertion = findSequenceStart(mergedLines, insertedLines, insertionStart);
    if (existingInsertion === insertionStart) {
      searchCursor = existingInsertion + insertedLines.length;
      continue;
    }

    mergedLines.splice(insertionStart, 0, ...insertedLines);
    searchCursor = insertionStart + insertedLines.length;
  }

  return joinLogicalLines(mergedLines, upstreamTrailingNewline);
}

/** Base lines `start` to `end` replaced by `lines`. Lines keep their line endings. */
type LineChange = { start: number; end: number; lines: string[] };

function splitKeepingLineEndings(content: string): string[] {
  return content === "" ? [] : content.split(/(?<=\n)/);
}

function lineChanges(base: string[], side: string[]): LineChange[] {
  const changes: LineChange[] = [];
  let index = 0;
  for (const part of diffArrays(base, side)) {
    if (!part.added && !part.removed) {
      index += part.value.length;
      continue;
    }
    // A removal and an addition next to each other are one replacement.
    let change = changes.at(-1);
    if (change?.end !== index) {
      change = { start: index, end: index, lines: [] };
      changes.push(change);
    }
    if (part.removed) {
      change.end += part.value.length;
      index += part.value.length;
    } else {
      change.lines.push(...part.value);
    }
  }
  return changes;
}

function includesInOrder(lines: string[], wanted: string[]): boolean {
  let found = 0;
  for (const line of lines) {
    if (line === wanted[found]) {
      found++;
    }
  }
  return found === wanted.length;
}

/**
The staged content without the changes that upstream already made at the same base lines, so a
patch does not apply them a second time. This is the case when a teammate or an agent pushed the
same edit, or when an earlier commit of these staged files landed. A change counts as made when
upstream replaced the same base lines with lines that include the staged lines in order, so the
result still has every staged line. A staged deletion counts only when upstream deleted the same
lines too.
*/
function withoutChangesUpstreamMade({
  baseContent,
  stagedContent,
  upstreamContent,
}: RebaseInput): string {
  const base = splitKeepingLineEndings(baseContent);
  const upstreamChanges = lineChanges(base, splitKeepingLineEndings(upstreamContent));
  let content = "";
  let index = 0;
  for (const change of lineChanges(base, splitKeepingLineEndings(stagedContent))) {
    const madeUpstream = upstreamChanges.some(
      (upstream) =>
        upstream.start === change.start &&
        upstream.end === change.end &&
        (change.lines.length === 0) === (upstream.lines.length === 0) &&
        includesInOrder(upstream.lines, change.lines),
    );
    if (madeUpstream) {
      continue;
    }
    content += base.slice(index, change.start).join("") + change.lines.join("");
    index = change.end;
  }
  return content + base.slice(index).join("");
}

export function rebaseStagedContent({
  baseContent,
  stagedContent,
  upstreamContent,
}: RebaseInput): RebaseResult {
  if (stagedContent === upstreamContent) {
    return { content: upstreamContent, hasConflict: false };
  }

  const remainingContent = withoutChangesUpstreamMade({
    baseContent,
    stagedContent,
    upstreamContent,
  });
  if (remainingContent === baseContent) {
    return { content: upstreamContent, hasConflict: false };
  }

  const patch = createTwoFilesPatch("base", "staged", baseContent, remainingContent);

  const rebased = applyPatch(upstreamContent, patch, { fuzzFactor: 1 });
  if (rebased === false) {
    const insertionOnlyMerged = mergeInsertionOnlyEdits({
      baseContent,
      stagedContent: remainingContent,
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
