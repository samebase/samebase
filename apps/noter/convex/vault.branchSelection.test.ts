import { describe, expect, it } from "vitest";

import { resolveVaultBranchSelection } from "./vault";

describe("resolveVaultBranchSelection", () => {
  it("resolves to requested branch when it exists remotely", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        remoteBranches: [
          { name: "main", isDefault: true, remoteState: "active" },
          { name: "feature/login", isDefault: false, remoteState: "active" },
        ],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "feature/login",
      branchNotFound: false,
    });
  });

  it("flags missing requested branch and falls back to default branch", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "src",
        remoteBranches: [
          { name: "main", isDefault: true, remoteState: "active" },
          { name: "feature/login", isDefault: false, remoteState: "active" },
        ],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "main",
      branchNotFound: true,
    });
  });

  it("keeps requested branch when remote branches are unavailable", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: undefined,
      resolvedBranch: "feature/login",
      branchNotFound: false,
    });
  });

  it("falls back to main when nothing is specified", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: undefined,
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: undefined,
      resolvedBranch: "main",
      branchNotFound: false,
    });
  });
});
