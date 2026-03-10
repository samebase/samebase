export type RemoteBranchDeleteEligibilityReason =
  | "deleted_upstream"
  | "default_branch"
  | "protected_branch"
  | "has_staged_files"
  | "ahead_behind_unavailable"
  | "ahead_of_default";

export type RemoteBranchDeleteEligibilityInput = {
  remoteState: "active" | "deleted_upstream";
  isDefault: boolean;
  isProtected: boolean;
  stagedFilesCount: number;
  aheadBy?: number;
};

export function getRemoteBranchDeleteEligibility(
  args: RemoteBranchDeleteEligibilityInput,
):
  | { canDelete: true; reason: null }
  | { canDelete: false; reason: RemoteBranchDeleteEligibilityReason } {
  if (args.remoteState !== "active") {
    return {
      canDelete: false,
      reason: "deleted_upstream",
    };
  }
  if (args.isDefault) {
    return {
      canDelete: false,
      reason: "default_branch",
    };
  }
  if (args.isProtected) {
    return {
      canDelete: false,
      reason: "protected_branch",
    };
  }
  if (args.stagedFilesCount > 0) {
    return {
      canDelete: false,
      reason: "has_staged_files",
    };
  }
  if (typeof args.aheadBy !== "number") {
    return {
      canDelete: false,
      reason: "ahead_behind_unavailable",
    };
  }
  if (args.aheadBy > 0) {
    return {
      canDelete: false,
      reason: "ahead_of_default",
    };
  }
  return {
    canDelete: true,
    reason: null,
  };
}

export function buildRemoteBranchDeleteRef(branchName: string): string {
  return `heads/${branchName}`;
}
