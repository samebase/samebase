import { describe, expect, it } from "vite-plus/test";

import { findVaultConvexProjectAttachment } from "./vaultConvexProjectAttachment";

const vaults = [
  {
    repositoryFullName: "ada/monorepo",
    convexProjects: [
      {
        convexProjectId: "attachment-alpha",
        convexConfigPath: "apps/web/convex.json",
        projectId: "project-alpha",
      },
      {
        convexProjectId: "attachment-beta",
        convexConfigPath: "apps/web/convex.json",
        projectId: "project-beta",
      },
    ],
  },
] as const;

describe("findVaultConvexProjectAttachment", () => {
  it("selects by attachment id when projects share one config path", () => {
    expect(
      findVaultConvexProjectAttachment(vaults, "ada/monorepo", "attachment-beta")?.project,
    ).toEqual({
      convexProjectId: "attachment-beta",
      convexConfigPath: "apps/web/convex.json",
      projectId: "project-beta",
    });
  });

  it("keeps a stale attachment id distinct from a missing vault", () => {
    expect(
      findVaultConvexProjectAttachment(vaults, "ada/monorepo", "stale-attachment"),
    ).toMatchObject({ project: null });
    expect(findVaultConvexProjectAttachment(vaults, "ada/other", "attachment-beta")).toBeNull();
  });
});
