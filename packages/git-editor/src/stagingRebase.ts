import { diffArrays } from "diff";

type RebaseInput = {
  baseContent: string;
  stagedContent: string;
  upstreamContent: string;
};

type RebaseResult = {
  content: string;
  hasConflict: boolean;
};

function buildConflictContent(ours: string, theirs: string): string {
  return ["<<<<<<< samebase", ours, "=======", theirs, ">>>>>>> main"].join("\n");
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
      change.lines = change.lines.concat(part.value);
    }
  }
  return changes;
}

/** Base lines `start` to `end` with `changes`, which lie inside them, applied. */
function applyChanges(base: string[], start: number, end: number, changes: LineChange[]): string[] {
  const chunks: string[][] = [];
  let index = start;
  for (const change of changes) {
    chunks.push(base.slice(index, change.start), change.lines);
    index = change.end;
  }
  chunks.push(base.slice(index, end));
  return chunks.flat();
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

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

/**
The merged lines for base lines `start` to `end`, where the staged and the upstream changes touch,
or null for a conflict:

- Both sides give the same lines: those lines, once.
- Both sides insert at the same place, and the insertions share no line: both, the staged lines
  first. `git merge-file` reports a conflict here; Samebase keeps both.
- Both sides insert at the same place, or replace the same base lines, and one side's lines include
  the other's in order: the larger side, as when a teammate pushed the user's edit plus more. Only
  when each shared line appears once in the staged and once in the upstream content, because with a
  repeated line the diff can match the user's copy to a different copy upstream.

Anything else is a conflict, so a base line that one side removed never comes back from the other.
*/
function mergeTouchingChanges(
  base: string[],
  start: number,
  end: number,
  staged: LineChange[],
  upstream: LineChange[],
  appearsOnceOnEachSide: (line: string) => boolean,
): string[] | null {
  const ours = applyChanges(base, start, end, staged);
  const theirs = applyChanges(base, start, end, upstream);
  if (ours.join("") === theirs.join("")) {
    return ours;
  }
  const theirLines = new Set(theirs);
  const shared = ours.filter((line) => theirLines.has(line));
  const bothInsertOnly = start === end;
  if (bothInsertOnly && shared.length === 0) {
    return ours.concat(theirs);
  }
  const sameRange =
    staged.length === 1 &&
    upstream.length === 1 &&
    staged[0]?.start === start &&
    staged[0].end === end &&
    upstream[0]?.start === start &&
    upstream[0].end === end;
  if (
    (bothInsertOnly || sameRange) &&
    ours.length > 0 &&
    theirs.length > 0 &&
    shared.every(appearsOnceOnEachSide)
  ) {
    if (includesInOrder(theirs, ours)) {
      return theirs;
    }
    if (includesInOrder(ours, theirs)) {
      return ours;
    }
  }
  return null;
}

/**
A three-way merge by lines, as `git merge-file` does: each side's changes against the base apply
where they do not touch the other side's. Where they touch, `mergeTouchingChanges` decides.
*/
function mergeLines(base: string[], staged: string[], upstream: string[]): string[] | null {
  const ours = lineChanges(base, staged);
  const theirs = lineChanges(base, upstream);
  const stagedCounts = countLines(staged);
  const upstreamCounts = countLines(upstream);
  const appearsOnceOnEachSide = (line: string) =>
    stagedCounts.get(line) === 1 && upstreamCounts.get(line) === 1;
  const chunks: string[][] = [];
  let index = 0;
  let i = 0;
  let j = 0;
  while (i < ours.length || j < theirs.length) {
    const start = Math.min(ours.at(i)?.start ?? Infinity, theirs.at(j)?.start ?? Infinity);
    let end = start;
    const groupOurs: LineChange[] = [];
    const groupTheirs: LineChange[] = [];
    // Changes of one side never touch each other, so a group grows only across the two sides.
    let grew = true;
    while (grew) {
      grew = false;
      const nextOurs = ours.at(i);
      if (nextOurs !== undefined && nextOurs.start <= end) {
        groupOurs.push(nextOurs);
        end = Math.max(end, nextOurs.end);
        i++;
        grew = true;
      }
      const nextTheirs = theirs.at(j);
      if (nextTheirs !== undefined && nextTheirs.start <= end) {
        groupTheirs.push(nextTheirs);
        end = Math.max(end, nextTheirs.end);
        j++;
        grew = true;
      }
    }
    const lines =
      groupTheirs.length === 0
        ? applyChanges(base, start, end, groupOurs)
        : groupOurs.length === 0
          ? applyChanges(base, start, end, groupTheirs)
          : mergeTouchingChanges(base, start, end, groupOurs, groupTheirs, appearsOnceOnEachSide);
    if (lines === null) {
      return null;
    }
    chunks.push(base.slice(index, start), lines);
    index = end;
  }
  chunks.push(base.slice(index));
  const merged = chunks.flat();
  // A line without a line ending can only be the last one; anywhere else, two lines would join.
  return merged.slice(0, -1).every((line) => line.endsWith("\n")) ? merged : null;
}

/**
Rebases a staged edit onto newer upstream content: a three-way merge of the staged and the upstream
content against the content the edit started from. A change both sides made is written once. A
conflict returns both versions between conflict markers.
*/
export function rebaseStagedContent({
  baseContent,
  stagedContent,
  upstreamContent,
}: RebaseInput): RebaseResult {
  const merged = mergeLines(
    splitKeepingLineEndings(baseContent),
    splitKeepingLineEndings(stagedContent),
    splitKeepingLineEndings(upstreamContent),
  );
  return merged === null
    ? { content: buildConflictContent(stagedContent, upstreamContent), hasConflict: true }
    : { content: merged.join(""), hasConflict: false };
}
