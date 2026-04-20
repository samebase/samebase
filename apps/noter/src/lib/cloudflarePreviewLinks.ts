type CloudflareBranchPreviewState = {
  pullRequestNumber?: number;
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewPullRequestNumber?: number;
};
type CloudflareBranchPreviewHydrationCandidate = {
  name: string;
  remoteState: "active" | "deleted_upstream";
} & CloudflareBranchPreviewState;

export function hasCurrentCloudflareBranchPreview(
  args: CloudflareBranchPreviewState,
): boolean {
  return (
    typeof args.pullRequestNumber === "number" &&
    typeof args.cloudflareBranchPreviewUrl === "string" &&
    args.cloudflareBranchPreviewUrl.length > 0 &&
    args.cloudflarePreviewPullRequestNumber === args.pullRequestNumber
  );
}

/**
 * Cloudflare PR comment scans are expensive relative to the rest of the
 * dashboard refresh. Only pay that cost while the active branch's current PR is
 * still missing a matching cached branch preview.
 */
export function shouldHydrateCloudflareBranchPreview(
  args: CloudflareBranchPreviewState & {
    remoteState: "active" | "deleted_upstream";
  },
): boolean {
  return (
    args.remoteState === "active" &&
    typeof args.pullRequestNumber === "number" &&
    !hasCurrentCloudflareBranchPreview(args)
  );
}

/**
 * Keep dashboard refresh requests scoped to the branches that still need a
 * Cloudflare PR comment lookup instead of re-scanning every branch in the
 * repository.
 */
export function getCloudflareBranchPreviewHydrationTargets(
  branches: CloudflareBranchPreviewHydrationCandidate[],
): string[] {
  return branches
    .filter((branch) => shouldHydrateCloudflareBranchPreview(branch))
    .map((branch) => branch.name);
}
