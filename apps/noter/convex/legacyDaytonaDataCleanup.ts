import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { type DataModel, type Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

const { array, boolean, id, object } = v;

const legacyDaytonaVaultPatch = {
  daytonaSandboxId: undefined,
  daytonaSandboxName: undefined,
  daytonaSandboxCreatedAt: undefined,
  daytonaSandboxProvisioningMode: undefined,
  daytonaSnapshotName: undefined,
  daytonaPrebuildLogs: undefined,
  daytonaPrebuildLogsUpdatedAt: undefined,
  daytonaPrebuildLogsBranch: undefined,
  daytonaPrebuildLogsSnapshot: undefined,
} satisfies Partial<Doc<"vaults">>;

const inspectResult = object({
  complete: boolean(),
  vaultsWithLegacyDaytonaDataFound: boolean(),
  sampledVaultIds: array(id("vaults")),
});

const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: "legacyDaytonaDataCleanup:",
});

function hasLegacyDaytonaVaultData(vault: Doc<"vaults">): boolean {
  // Check undefined directly so empty legacy log strings are still cleared.
  return (
    vault.daytonaSandboxId !== undefined ||
    vault.daytonaSandboxName !== undefined ||
    vault.daytonaSandboxCreatedAt !== undefined ||
    vault.daytonaSandboxProvisioningMode !== undefined ||
    vault.daytonaSnapshotName !== undefined ||
    vault.daytonaPrebuildLogs !== undefined ||
    vault.daytonaPrebuildLogsUpdatedAt !== undefined ||
    vault.daytonaPrebuildLogsBranch !== undefined ||
    vault.daytonaPrebuildLogsSnapshot !== undefined
  );
}

export const clearVaultDaytonaFields = migrations.define({
  table: "vaults",
  migrateOne: (_ctx, vault) => {
    if (!hasLegacyDaytonaVaultData(vault)) {
      return;
    }

    return legacyDaytonaVaultPatch;
  },
});

export const runAll = migrations.runner(
  internal.legacyDaytonaDataCleanup.clearVaultDaytonaFields,
);

export const inspect = internalQuery({
  args: {},
  returns: inspectResult,
  handler: async (ctx) => {
    const vaultsWithLegacyDaytonaData = await ctx.db
      .query("vaults")
      .filter((q) =>
        q.or(
          q.neq(q.field("daytonaSandboxId"), undefined),
          q.neq(q.field("daytonaSandboxName"), undefined),
          q.neq(q.field("daytonaSandboxCreatedAt"), undefined),
          q.neq(q.field("daytonaSandboxProvisioningMode"), undefined),
          q.neq(q.field("daytonaSnapshotName"), undefined),
          q.neq(q.field("daytonaPrebuildLogs"), undefined),
          q.neq(q.field("daytonaPrebuildLogsUpdatedAt"), undefined),
          q.neq(q.field("daytonaPrebuildLogsBranch"), undefined),
          q.neq(q.field("daytonaPrebuildLogsSnapshot"), undefined),
        ),
      )
      .order("asc")
      .take(20);

    return {
      complete: vaultsWithLegacyDaytonaData.length === 0,
      vaultsWithLegacyDaytonaDataFound: vaultsWithLegacyDaytonaData.length > 0,
      sampledVaultIds: vaultsWithLegacyDaytonaData.map((vault) => vault._id),
    };
  },
});
