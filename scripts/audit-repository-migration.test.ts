import { describe, expect, it } from "vite-plus/test";

import {
  repositoryMigrationStoredIdEdges,
  repositoryMigrationTablePairs,
} from "../apps/samebase/convex/repositoryMigration/manifest.ts";
import {
  auditRepositoryMigration,
  classifyRepositoryMigrationLegacyUse,
  collectRepositoryMigrationLegacyUses,
  formatRepositoryMigrationAudit,
} from "./audit-repository-migration.ts";
import { resolveRepoRoot } from "./lib/scriptRuntime.ts";

describe("repository migration audit", () => {
  it("matches the current source inventory", () => {
    const report = auditRepositoryMigration(resolveRepoRoot());

    expect(repositoryMigrationTablePairs).toHaveLength(21);
    expect(repositoryMigrationStoredIdEdges).toHaveLength(27);
    expect(report.inventories.oldTableDefinitions).toHaveLength(21);
    expect(report.storedIdEdges).toHaveLength(27);
    expect(report.inventories.routes).not.toHaveLength(0);
    expect(report.inventories.browserVaultIdKeys).not.toHaveLength(0);
    expect(report.inventories.creationTimeReads).not.toHaveLength(0);
    expect(report.unclassifiedLegacyUses).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(formatRepositoryMigrationAudit(report)).toBe(
      formatRepositoryMigrationAudit(auditRepositoryMigration(resolveRepoRoot())),
    );
  });

  it("rejects an old name outside an explicit classification", () => {
    const sources = [
      { path: "unclassified/new-surface.ts", content: "export const vaultId = 'old';\n" },
      { path: "apps/samebase/convex/known.ts", content: "export const vaultId = 'old';\n" },
    ];
    const forward = collectRepositoryMigrationLegacyUses(sources);
    const reverse = collectRepositoryMigrationLegacyUses([...sources].reverse());

    expect(classifyRepositoryMigrationLegacyUse("unclassified/new-surface.ts")).toBeUndefined();
    expect(forward).toEqual(reverse);
    expect(forward.unclassifiedLegacyUses).toEqual([
      {
        path: "unclassified/new-surface.ts",
        line: 1,
        legacyTermCount: 1,
        category: undefined,
        disposition: undefined,
      },
    ]);
  });
});
