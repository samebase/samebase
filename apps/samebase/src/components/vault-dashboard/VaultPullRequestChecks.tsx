import { VaultChecksPopover } from "@/components/vault-dashboard/VaultChecksPopover";
import type { VaultPullRequest } from "@/hooks/useVaultPullRequests";

export function VaultPullRequestChecks({ pullRequest }: { pullRequest: VaultPullRequest }) {
  return (
    <VaultChecksPopover
      checks={pullRequest.checks}
      detailsUrl={`${pullRequest.url}/checks`}
      heading="Pull request checks"
      statusCheckRollup={pullRequest.statusCheckRollup}
      triggerTitle="Show pull request checks"
    />
  );
}
