const BRANCH_PULL_REQUEST_LOOKUP_FAILURE_MESSAGE =
  "Could not check whether this branch already has an open pull request. Reload the page to try again.";

type DraftPullRequestFeedbackBannerProps = {
  message: string | null;
  branchPullRequestLookupFailed: boolean;
};

export function DraftPullRequestFeedbackBanner({
  message,
  branchPullRequestLookupFailed,
}: DraftPullRequestFeedbackBannerProps) {
  const feedbackMessage =
    message ?? (branchPullRequestLookupFailed ? BRANCH_PULL_REQUEST_LOOKUP_FAILURE_MESSAGE : null);

  if (!feedbackMessage) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
    >
      {feedbackMessage}
    </div>
  );
}
