type ReviewExitBehavior = {
  isCompareRequested: boolean;
  hasComparedSelection: boolean;
  hasStagedSelection: boolean;
};

/**
 * Compare-only PR diffs render in a read-only diff surface, so leaving review
 * for those files needs to drop compare mode and reopen the normal editor.
 */
export function shouldClearCompareOnReviewExit(
  args: ReviewExitBehavior,
): boolean {
  return (
    args.isCompareRequested &&
    args.hasComparedSelection &&
    !args.hasStagedSelection
  );
}
