import { describe, expect, it } from "vite-plus/test";

import { makeConvexTest } from "../test.setup";
import { hasExactBusinessFields } from "./copyDocument";

describe("repository migration business-field comparison", () => {
  it("ignores system fields and normalizes omitted optional fields", async () => {
    const t = makeConvexTest();
    const result = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "migration-installation",
        githubOwnerId: "migration-owner",
        githubOwnerLogin: "migration-owner",
        githubOwnerLoginNormalized: "migration-owner",
        githubOwnerType: "organization",
      });
      const repositoryId = await ctx.db.insert("repositories", {
        state: "not_connected",
        organizationId,
        deletion: { state: "not_deleting" },
        createdAt: 42,
      });
      const repository = await ctx.db.get(repositoryId);
      if (repository === null) {
        throw new Error("Expected repository fixture.");
      }
      const expectedFields = {
        state: "not_connected",
        organizationId,
        convexTeamId: undefined,
        deletion: { state: "not_deleting" },
        createdAt: 42,
      } as const;

      return {
        exact: hasExactBusinessFields(repository, expectedFields),
        changed: hasExactBusinessFields(repository, {
          ...expectedFields,
          createdAt: 43,
        }),
      };
    });

    expect(result).toEqual({ exact: true, changed: false });
  });
});
