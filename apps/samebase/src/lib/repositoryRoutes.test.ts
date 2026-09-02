import { describe, expect, it } from "vite-plus/test";

import {
  buildRepositoryDashboardRoute,
  buildRepositoryDatabaseRoute,
  buildRepositoryFileRoute,
  buildRepositorySchemaRoute,
  buildRepositorySettingsRoute,
  parseRepositoryPathContext,
} from "./repositoryRoutes";

describe("buildRepositoryDashboardRoute", () => {
  it("builds repository dashboard routes", () => {
    expect(
      buildRepositoryDashboardRoute({
        owner: "octo",
        repoName: "web",
      }),
    ).toBe("/repo/octo/web");
  });
});

describe("buildRepositorySettingsRoute", () => {
  it("builds the repository settings route", () => {
    const repository = {
      owner: "octo",
      repoName: "web",
    };

    expect(buildRepositorySettingsRoute(repository)).toBe("/repo/octo/web/settings");
  });
});

describe("buildRepositoryFileRoute", () => {
  it("encodes branch names with slashes for file routes", () => {
    expect(
      buildRepositoryFileRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        filePath: "src/App.tsx",
      }),
    ).toBe("/repo/octo/repo/fs/feature%2Flogin-flow/src/App.tsx");
  });

  it("encodes file path segments without changing slash separators", () => {
    expect(
      buildRepositoryFileRoute({
        owner: "octo",
        repoName: "repo",
        branch: "main",
        filePath: "docs/hello world.md",
      }),
    ).toBe("/repo/octo/repo/fs/main/docs/hello%20world.md");
  });
});

describe("buildRepositoryDatabaseRoute", () => {
  it("builds project database routes", () => {
    expect(
      buildRepositoryDatabaseRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        convexProjectId: "convex-project:123",
      }),
    ).toBe("/repo/octo/repo/db/feature%2Flogin-flow/project/convex-project%3A123");
  });
});

describe("buildRepositorySchemaRoute", () => {
  it("builds project schema routes", () => {
    expect(
      buildRepositorySchemaRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        convexProjectId: "convex-project:123",
      }),
    ).toBe("/repo/octo/repo/schema/feature%2Flogin-flow/project/convex-project%3A123");
  });
});

describe("parseRepositoryPathContext", () => {
  it("parses branchless repository routes", () => {
    expect(parseRepositoryPathContext("/repo/octo/repo")).toEqual({
      owner: "octo",
      githubRepositoryFullName: "octo/repo",
      repoName: "repo",
    });
  });

  it("parses branch editor routes and preserves file paths named chat", () => {
    expect(parseRepositoryPathContext("/repo/octo/repo/fs/main/chat")).toEqual({
      owner: "octo",
      githubRepositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "main",
      filePath: "chat",
    });
  });

  it("parses encoded branch names", () => {
    expect(
      parseRepositoryPathContext("/repo/octo/repo/fs/feature%2Flogin-flow/src/App.tsx"),
    ).toEqual({
      owner: "octo",
      githubRepositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login-flow",
      filePath: "src/App.tsx",
    });
  });

  it("marks delimiter file routes invalid", () => {
    expect(parseRepositoryPathContext("/repo/octo/repo/-/main/src/index.ts")).toEqual({
      owner: "octo",
      githubRepositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidRepositoryRoute: true,
    });
  });

  it("marks legacy branch editor routes invalid", () => {
    expect(parseRepositoryPathContext("/repo/octo/repo/main/src/index.ts")).toEqual({
      owner: "octo",
      githubRepositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidRepositoryRoute: true,
    });
  });
});
