import { VaultChecksPopover } from "@/components/vault-dashboard/VaultChecksPopover";
import type { VaultDefaultBranchObservation } from "@/hooks/useVaultPullRequests";

export function VaultDefaultBranchChecks({
  checks,
  githubRepositoryUrl,
}: {
  checks: VaultDefaultBranchObservation;
  githubRepositoryUrl: string;
}) {
  return (
    <VaultChecksPopover
      checks={checks.checks}
      detailsUrl={`${githubRepositoryUrl}/commit/${checks.headCommitOid}/checks`}
      heading="Default branch checks"
      statusCheckRollup={checks.statusCheckRollup}
      triggerTitle="Show default branch checks"
    />
  );
}
