type ReviewExitBehavior = {
  isCompareRequested: boolean;
  hasComparedSelection: boolean;
  hasComparedEditorTarget: boolean;
  hasStagedSelection: boolean;
};

type CompareBackToEditorBehavior = {
  commitReviewMode: "editor" | "review";
  isCompareRequested: boolean;
  hasComparedEditorTarget: boolean;
  hasChangesToCommit: boolean;
};

/**
 * Compare-only PR diffs should only drop compare mode when the selected file
 * still has a normal editor target outside compare mode.
 */
export function shouldClearCompareOnReviewExit(
  args: ReviewExitBehavior,
): boolean {
  return (
    args.isCompareRequested &&
    args.hasComparedSelection &&
    args.hasComparedEditorTarget &&
    !args.hasStagedSelection
  );
}

/**
 * Compare-only PR mode is already a diff surface, so when there is no staged
 * review to enter the header control should only offer a direct return to the
 * normal editor when the selected compare row can reopen there.
 */
export function shouldShowCompareBackToEditor(
  args: CompareBackToEditorBehavior,
): boolean {
  return (
    args.commitReviewMode === "editor" &&
    args.isCompareRequested &&
    args.hasComparedEditorTarget &&
    !args.hasChangesToCommit
  );
}
