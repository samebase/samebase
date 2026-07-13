import { describe, expect, it } from "vite-plus/test";

import {
  buildAccountDeletionConfirmationPhrase,
  serializeAccountDeletionConfirmationStakes,
} from "./accountDeletionPhrase";

describe("buildAccountDeletionConfirmationPhrase", () => {
  it("names only the account when nothing else is at stake", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 0, uncommittedFileChangeCount: 0 }),
    ).toBe("delete my account");
  });

  it("appends the vault count when there are no uncommitted changes", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 3, uncommittedFileChangeCount: 0 }),
    ).toBe("delete my account and 3 vaults");
  });

  it("uses the singular for one vault", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 1, uncommittedFileChangeCount: 0 }),
    ).toBe("delete my account and 1 vault");
  });

  it("lists vaults and uncommitted changes together", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 3, uncommittedFileChangeCount: 5 }),
    ).toBe("delete my account, 3 vaults, and 5 uncommitted file changes");
  });

  it("uses singulars for one vault with one uncommitted change", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 1, uncommittedFileChangeCount: 1 }),
    ).toBe("delete my account, 1 vault, and 1 uncommitted file change");
  });

  it("still reads sanely for changes without vaults", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({ vaultCount: 0, uncommittedFileChangeCount: 5 }),
    ).toBe("delete my account and 5 uncommitted file changes");
  });

  it("names the cap instead of an exact capped count", () => {
    expect(
      buildAccountDeletionConfirmationPhrase({
        vaultCount: 0,
        uncommittedFileChangeCount: "more_than_cap",
      }),
    ).toBe("delete my account and more than 500 uncommitted file changes");
    expect(
      buildAccountDeletionConfirmationPhrase({
        vaultCount: 2,
        uncommittedFileChangeCount: "more_than_cap",
      }),
    ).toBe("delete my account, 2 vaults, and more than 500 uncommitted file changes");
  });
});

describe("serializeAccountDeletionConfirmationStakes", () => {
  it("changes when the displayed repository, branch, or billing warning changes", () => {
    const initial = {
      vaultCount: 1,
      uncommittedFileChangeCount: 1,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId: "vault-1",
            repositoryFullName: "samebase/notes",
            uncommittedFileChangeCount: 1,
            branches: [{ branch: "main", uncommittedFileChangeCount: 1 }],
          },
        ],
      },
    } as const;

    expect(
      serializeAccountDeletionConfirmationStakes({
        ...initial,
        affectedVaults: {
          state: "complete",
          vaults: [
            {
              ...initial.affectedVaults.vaults[0],
              branches: [{ branch: "feature/review", uncommittedFileChangeCount: 1 }],
            },
          ],
        },
      }),
    ).not.toBe(serializeAccountDeletionConfirmationStakes(initial));
    expect(
      serializeAccountDeletionConfirmationStakes({
        ...initial,
        hasActiveSubscription: true,
      }),
    ).not.toBe(serializeAccountDeletionConfirmationStakes(initial));
  });
});
