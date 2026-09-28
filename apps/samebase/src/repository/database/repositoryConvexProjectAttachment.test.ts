import { describe, expect, it } from "vite-plus/test";

import { findRepositoryConvexProjectAttachment } from "./repositoryConvexProjectAttachment";

const repositories = [
  {
    githubRepositoryFullName: "ada/monorepo",
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

describe("findRepositoryConvexProjectAttachment", () => {
  it("selects by attachment id when projects share one config path", () => {
    expect(
      findRepositoryConvexProjectAttachment(repositories, "ada/monorepo", "attachment-beta")
        ?.project,
    ).toEqual({
      convexProjectId: "attachment-beta",
      convexConfigPath: "apps/web/convex.json",
      projectId: "project-beta",
    });
  });

  it("keeps a stale attachment id distinct from a missing repository", () => {
    expect(
      findRepositoryConvexProjectAttachment(repositories, "ada/monorepo", "stale-attachment"),
    ).toMatchObject({ project: null });
    expect(
      findRepositoryConvexProjectAttachment(repositories, "ada/other", "attachment-beta"),
    ).toBeNull();
  });
});
