type CloudflareBranchPreviewState = {
  pullRequestNumber?: number;
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewPullRequestNumber?: number;
};
type CloudflareBuildFailureLogsState = CloudflareBranchPreviewState & {
  cloudflarePreviewLogsUrl?: string;
  cloudflarePreviewStatus?: string;
};

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

function isCloudflareBuildFailureStatus(status: string | undefined): boolean {
  return typeof status === "string" && /\bbuild failed\b/i.test(status);
}

export function hasCurrentCloudflareBuildFailureLogs(
  args: CloudflareBuildFailureLogsState,
): boolean {
  return (
    typeof args.pullRequestNumber === "number" &&
    typeof args.cloudflarePreviewLogsUrl === "string" &&
    args.cloudflarePreviewLogsUrl.length > 0 &&
    args.cloudflarePreviewPullRequestNumber === args.pullRequestNumber &&
    isCloudflareBuildFailureStatus(args.cloudflarePreviewStatus)
  );
}
