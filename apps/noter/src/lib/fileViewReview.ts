type ReviewExitBehavior = {
  isCompareRequested: boolean;
  hasComparedSelection: boolean;
  hasStagedSelection: boolean;
};

type CompareBackToEditorBehavior = {
  commitReviewMode: "editor" | "review";
  isCompareRequested: boolean;
  hasChangesToCommit: boolean;
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

/**
 * Compare-only PR mode is already a diff surface, so when there is no staged
 * review to enter the header control should offer a direct return to the
 * normal editor instead of a disabled review button.
 */
export function shouldShowCompareBackToEditor(
  args: CompareBackToEditorBehavior,
): boolean {
  return (
    args.commitReviewMode === "editor" &&
    args.isCompareRequested &&
    !args.hasChangesToCommit
  );
}
