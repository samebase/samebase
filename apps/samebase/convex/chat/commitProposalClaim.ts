import type { CommitProposalPayload } from "../../shared/chatMetadata";

export function canClaimCommitProposal(
  payload: Pick<CommitProposalPayload, "committed" | "committing">,
): boolean {
  return payload.committed !== true && payload.committing !== true;
}

export function buildClaimedCommitProposalPayload(
  payload: CommitProposalPayload,
): CommitProposalPayload {
  return {
    ...payload,
    committed: false,
    committing: true,
    error: undefined,
  };
}
