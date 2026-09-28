import { Button } from "@/components/ui/button";
import { PullRequestLink } from "@/repository/editor/PullRequestLink";
import { cn } from "@/lib/utils";

type FileViewPushActionsProps = {
  canCreateDraftPullRequest: boolean;
  currentPullRequestNumber?: number;
  currentPullRequestUrl?: string;
  draftButtonLabel: string;
  hasChangesToCommit: boolean;
  isCreatingDraftPullRequest: boolean;
  isPushing: boolean;
  onCreateDraftPullRequest: () => void;
  onManualCommit: () => void;
};

export function FileViewPushActions({
  canCreateDraftPullRequest,
  currentPullRequestNumber,
  currentPullRequestUrl,
  draftButtonLabel,
  hasChangesToCommit,
  isCreatingDraftPullRequest,
  isPushing,
  onCreateDraftPullRequest,
  onManualCommit,
}: FileViewPushActionsProps) {
  return (
    <>
      {currentPullRequestUrl ? (
        <PullRequestLink
          pullRequestNumber={currentPullRequestNumber}
          pullRequestUrl={currentPullRequestUrl}
          className="text-xs"
        />
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onCreateDraftPullRequest}
          disabled={isPushing || isCreatingDraftPullRequest || !canCreateDraftPullRequest}
          className={cn(
            "h-6 px-2 text-xs border-sky-500 text-sky-700 hover:bg-sky-50",
            !canCreateDraftPullRequest && "text-sky-600/70 hover:bg-transparent",
          )}
        >
          {isCreatingDraftPullRequest ? "Creating..." : draftButtonLabel}
        </Button>
      )}
      <Button
        size="sm"
        variant={hasChangesToCommit ? "default" : "outline"}
        onClick={onManualCommit}
        disabled={isPushing || isCreatingDraftPullRequest || !hasChangesToCommit}
        className={
          hasChangesToCommit
            ? "h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
            : "h-6 px-2 text-xs border-green-500 text-green-600 hover:bg-green-50"
        }
      >
        {isPushing ? "Pushing..." : hasChangesToCommit ? "push" : "All Synced"}
      </Button>
    </>
  );
}
