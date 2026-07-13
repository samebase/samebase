/**
Counting stops once uncommitted file changes pass this cap so the stakes read
stays bounded; the phrase then names "more than 500" instead of an exact count.
*/
export const ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP = 500;

export type AccountDeletionStakes = {
  vaultCount: number;
  uncommittedFileChangeCount: number | "more_than_cap";
};

export type AccountDeletionConfirmationStakes = AccountDeletionStakes & {
  hasActiveSubscription: boolean;
  affectedVaults:
    | {
        state: "complete";
        vaults: ReadonlyArray<{
          vaultId: string;
          repositoryFullName: string;
          uncommittedFileChangeCount: number;
          branches: ReadonlyArray<{
            branch: string;
            uncommittedFileChangeCount: number;
          }>;
        }>;
      }
    | { state: "unavailable" };
};

function formatCount(count: number, singularNoun: string): string {
  return count === 1 ? `1 ${singularNoun}` : `${count} ${singularNoun}s`;
}

/**
The typed confirmation phrase names what deletion destroys right now: the
account plus the viewer's vault count and uncommitted file change count. The
request mutation recomputes the same phrase from current data, so a phrase
built against stale counts stops matching instead of confirming silently.
*/
export function buildAccountDeletionConfirmationPhrase(stakes: AccountDeletionStakes): string {
  const stakeParts: string[] = [];
  if (stakes.vaultCount > 0) {
    stakeParts.push(formatCount(stakes.vaultCount, "vault"));
  }
  if (stakes.uncommittedFileChangeCount === "more_than_cap") {
    stakeParts.push(
      `more than ${ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP} uncommitted file changes`,
    );
  } else if (stakes.uncommittedFileChangeCount > 0) {
    stakeParts.push(formatCount(stakes.uncommittedFileChangeCount, "uncommitted file change"));
  }

  if (stakeParts.length === 0) {
    return "delete my account";
  }
  if (stakeParts.length === 1) {
    return `delete my account and ${stakeParts[0]}`;
  }
  return `delete my account, ${stakeParts[0]}, and ${stakeParts[1]}`;
}

/**
The request binds confirmation to every stake the dialog displays, not only the
aggregate counts in the typed phrase. Rebuilding the object also ignores union
discriminants added by mutation result wrappers.
*/
export function serializeAccountDeletionConfirmationStakes(
  stakes: AccountDeletionConfirmationStakes,
): string {
  return JSON.stringify({
    vaultCount: stakes.vaultCount,
    uncommittedFileChangeCount: stakes.uncommittedFileChangeCount,
    hasActiveSubscription: stakes.hasActiveSubscription,
    affectedVaults:
      stakes.affectedVaults.state === "unavailable"
        ? { state: "unavailable" }
        : {
            state: "complete",
            vaults: stakes.affectedVaults.vaults.map((vault) => ({
              vaultId: vault.vaultId,
              repositoryFullName: vault.repositoryFullName,
              uncommittedFileChangeCount: vault.uncommittedFileChangeCount,
              branches: vault.branches.map((branch) => ({
                branch: branch.branch,
                uncommittedFileChangeCount: branch.uncommittedFileChangeCount,
              })),
            })),
          },
  });
}
