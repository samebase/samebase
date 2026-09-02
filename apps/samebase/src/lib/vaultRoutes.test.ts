import { describe, expect, it } from "vite-plus/test";

import {
  buildVaultDashboardRoute,
  buildVaultDatabaseRoute,
  buildVaultFileRoute,
  buildVaultSchemaRoute,
  buildVaultSettingsRoute,
  parseVaultPathContext,
} from "./vaultRoutes";

describe("buildVaultDashboardRoute", () => {
  it("builds repository dashboard routes", () => {
    expect(
      buildVaultDashboardRoute({
        owner: "octo",
        repoName: "web",
      }),
    ).toBe("/repo/octo/web");
  });
});

describe("buildVaultSettingsRoute", () => {
  it("builds the repository settings route", () => {
    const repository = {
      owner: "octo",
      repoName: "web",
    };

    expect(buildVaultSettingsRoute(repository)).toBe("/repo/octo/web/settings");
  });
});

describe("buildVaultFileRoute", () => {
  it("encodes branch names with slashes for file routes", () => {
    expect(
      buildVaultFileRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        filePath: "src/App.tsx",
      }),
    ).toBe("/repo/octo/repo/fs/feature%2Flogin-flow/src/App.tsx");
  });

  it("encodes file path segments without changing slash separators", () => {
    expect(
      buildVaultFileRoute({
        owner: "octo",
        repoName: "repo",
        branch: "main",
        filePath: "docs/hello world.md",
      }),
    ).toBe("/repo/octo/repo/fs/main/docs/hello%20world.md");
  });
});

describe("buildVaultDatabaseRoute", () => {
  it("builds project database routes", () => {
    expect(
      buildVaultDatabaseRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        convexProjectId: "convex-project:123",
      }),
    ).toBe("/repo/octo/repo/db/feature%2Flogin-flow/project/convex-project%3A123");
  });
});

describe("buildVaultSchemaRoute", () => {
  it("builds project schema routes", () => {
    expect(
      buildVaultSchemaRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        convexProjectId: "convex-project:123",
      }),
    ).toBe("/repo/octo/repo/schema/feature%2Flogin-flow/project/convex-project%3A123");
  });
});

describe("parseVaultPathContext", () => {
  it("parses branchless repository routes", () => {
    expect(parseVaultPathContext("/repo/octo/repo")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
    });
  });

  it("parses branch editor routes and preserves file paths named chat", () => {
    expect(parseVaultPathContext("/repo/octo/repo/fs/main/chat")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "main",
      filePath: "chat",
    });
  });

  it("parses encoded branch names", () => {
    expect(parseVaultPathContext("/repo/octo/repo/fs/feature%2Flogin-flow/src/App.tsx")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login-flow",
      filePath: "src/App.tsx",
    });
  });

  it("marks delimiter file routes invalid", () => {
    expect(parseVaultPathContext("/repo/octo/repo/-/main/src/index.ts")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });

  it("marks legacy branch editor routes invalid", () => {
    expect(parseVaultPathContext("/repo/octo/repo/main/src/index.ts")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });
});
