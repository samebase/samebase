import { applyPatch, createTwoFilesPatch } from "diff";

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
  return [
    "<<<<<<< noter",
    ours,
    "=======",
    theirs,
    ">>>>>>> main",
  ].join("\n");
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
    return {
      content: buildConflictContent(stagedContent, upstreamContent),
      hasConflict: true,
    };
  }

  return { content: rebased, hasConflict: false };
}
