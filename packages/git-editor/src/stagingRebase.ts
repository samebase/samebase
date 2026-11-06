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
      change.lines.push(...part.value);
    }
  }
  return changes;
}

/** Base lines `start` to `end` with `changes`, which lie inside them, applied. */
function applyChanges(base: string[], start: number, end: number, changes: LineChange[]): string[] {
  const lines: string[] = [];
  let index = start;
  for (const change of changes) {
    lines.push(...base.slice(index, change.start), ...change.lines);
    index = change.end;
  }
  lines.push(...base.slice(index, end));
  return lines;
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
The merged lines for base lines `start` to `end`, where the staged and the upstream changes touch,
or null for a conflict. Both sides inserting at the same place keeps both insertions, a line they
both inserted once, and the staged lines first where they differ. Otherwise both sides must give the
same lines, or replace the same base lines with lines where one side's include the other's in order,
as when a teammate pushed the user's edit plus more. Any other overlap is a conflict, so a base line
that one side removed never comes back from the other side.
*/
function mergeTouchingChanges(
  base: string[],
  start: number,
  end: number,
  staged: LineChange[],
  upstream: LineChange[],
): string[] | null {
  const ours = applyChanges(base, start, end, staged);
  const theirs = applyChanges(base, start, end, upstream);
  const bothInsertOnly = start === end;
  const sameRangeOneIncludesTheOther =
    staged.length === 1 &&
    upstream.length === 1 &&
    staged[0]?.start === start &&
    staged[0].end === end &&
    upstream[0]?.start === start &&
    upstream[0].end === end &&
    ours.length > 0 &&
    theirs.length > 0 &&
    (includesInOrder(ours, theirs) || includesInOrder(theirs, ours));
  if (bothInsertOnly || sameRangeOneIncludesTheOther || ours.join("") === theirs.join("")) {
    // A diff of the two sides lists each shared line once, and the staged-only lines first.
    return diffArrays(ours, theirs).flatMap((part) => part.value);
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
  const merged: string[] = [];
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
          : mergeTouchingChanges(base, start, end, groupOurs, groupTheirs);
    if (lines === null) {
      return null;
    }
    merged.push(...base.slice(index, start), ...lines);
    index = end;
  }
  merged.push(...base.slice(index));
  return merged;
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
