import { describe, expect, it } from "vitest";

import { getRemoteBranchDeleteEligibility } from "./remoteBranchDelete";

describe("getRemoteBranchDeleteEligibility", () => {
  it("allows deleting an active branch with no staged files and no commits ahead", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: false,
        isProtected: false,
        stagedFilesCount: 0,
        aheadBy: 0,
      }),
    ).toEqual({
      canDelete: true,
      reason: null,
    });
  });

  it("blocks deleted-upstream branches", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "deleted_upstream",
        isDefault: false,
        isProtected: false,
        stagedFilesCount: 0,
        aheadBy: 0,
      }),
    ).toEqual({
      canDelete: false,
      reason: "deleted_upstream",
    });
  });

  it("blocks default branches", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: true,
        isProtected: false,
        stagedFilesCount: 0,
        aheadBy: 0,
      }),
    ).toEqual({
      canDelete: false,
      reason: "default_branch",
    });
  });

  it("blocks protected branches", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: false,
        isProtected: true,
        stagedFilesCount: 0,
        aheadBy: 0,
      }),
    ).toEqual({
      canDelete: false,
      reason: "protected_branch",
    });
  });

  it("blocks branches with staged files", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: false,
        isProtected: false,
        stagedFilesCount: 2,
        aheadBy: 0,
      }),
    ).toEqual({
      canDelete: false,
      reason: "has_staged_files",
    });
  });

  it("blocks branches when ahead/behind data is unavailable", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: false,
        isProtected: false,
        stagedFilesCount: 0,
      }),
    ).toEqual({
      canDelete: false,
      reason: "ahead_behind_unavailable",
    });
  });

  it("blocks branches with commits ahead of default", () => {
    expect(
      getRemoteBranchDeleteEligibility({
        remoteState: "active",
        isDefault: false,
        isProtected: false,
        stagedFilesCount: 0,
        aheadBy: 3,
      }),
    ).toEqual({
      canDelete: false,
      reason: "ahead_of_default",
    });
  });
});
