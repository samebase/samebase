import { VaultChecksPopover } from "@/components/vault-dashboard/VaultChecksPopover";
import type { VaultDefaultBranchChecks as DefaultBranchChecks } from "@/hooks/useVaultPullRequests";

export function VaultDefaultBranchChecks({
  checks,
  githubRepositoryUrl,
}: {
  checks: DefaultBranchChecks;
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
