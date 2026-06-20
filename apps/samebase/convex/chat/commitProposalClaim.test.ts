import { describe, expect, it } from "vite-plus/test";

import { buildClaimedCommitProposalPayload, canClaimCommitProposal } from "./commitProposalClaim";

describe("canClaimCommitProposal", () => {
  it("allows claiming when proposal is idle", () => {
    expect(
      canClaimCommitProposal({
        committed: false,
        committing: false,
      }),
    ).toBe(true);
  });

  it("rejects already-committed proposals", () => {
    expect(
      canClaimCommitProposal({
        committed: true,
        committing: false,
      }),
    ).toBe(false);
  });

  it("rejects already-claiming proposals", () => {
    expect(
      canClaimCommitProposal({
        committed: false,
        committing: true,
      }),
    ).toBe(false);
  });
});

describe("buildClaimedCommitProposalPayload", () => {
  it("marks proposal as claiming and clears existing error", () => {
    expect(
      buildClaimedCommitProposalPayload({
        type: "commit_proposal",
        message: "Ship it",
        branch: "feature/login",
        committed: false,
        committing: false,
        error: "Old error",
      }),
    ).toEqual({
      type: "commit_proposal",
      message: "Ship it",
      branch: "feature/login",
      committed: false,
      committing: true,
      error: undefined,
    });
  });
});
