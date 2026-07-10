import { describe, expect, it } from "vite-plus/test";

import {
  buildVaultDashboardRoute,
  buildVaultDatabaseRoute,
  buildVaultFileRoute,
  buildVaultSchemaRoute,
  parseVaultPathContext,
} from "./vaultRoutes";

describe("buildVaultDashboardRoute", () => {
  it("builds repository dashboard routes", () => {
    expect(
      buildVaultDashboardRoute({
        owner: "octo",
        repoName: "web",
      }),
    ).toBe("/vault/octo/web");
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
    ).toBe("/vault/octo/repo/fs/feature%2Flogin-flow/src/App.tsx");
  });

  it("encodes file path segments without changing slash separators", () => {
    expect(
      buildVaultFileRoute({
        owner: "octo",
        repoName: "repo",
        branch: "main",
        filePath: "docs/hello world.md",
      }),
    ).toBe("/vault/octo/repo/fs/main/docs/hello%20world.md");
  });
});

describe("buildVaultDatabaseRoute", () => {
  it("builds root app database routes", () => {
    expect(
      buildVaultDatabaseRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        appRoot: ".",
      }),
    ).toBe("/vault/octo/repo/db/feature%2Flogin-flow/root");
  });

  it("builds monorepo app database routes", () => {
    expect(
      buildVaultDatabaseRoute({
        owner: "octo",
        repoName: "repo",
        branch: "main",
        appRoot: "apps/web app",
      }),
    ).toBe("/vault/octo/repo/db/main/mono/apps/web%20app");
  });
});

describe("buildVaultSchemaRoute", () => {
  it("builds root app schema routes", () => {
    expect(
      buildVaultSchemaRoute({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login-flow",
        appRoot: ".",
      }),
    ).toBe("/vault/octo/repo/schema/feature%2Flogin-flow/root");
  });

  it("builds monorepo app schema routes", () => {
    expect(
      buildVaultSchemaRoute({
        owner: "octo",
        repoName: "repo",
        branch: "main",
        appRoot: "apps/web app",
      }),
    ).toBe("/vault/octo/repo/schema/main/mono/apps/web%20app");
  });
});

describe("parseVaultPathContext", () => {
  it("parses branchless vault routes", () => {
    expect(parseVaultPathContext("/vault/octo/repo")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
    });
  });

  it("parses branch editor routes and preserves file paths named chat", () => {
    expect(parseVaultPathContext("/vault/octo/repo/fs/main/chat")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "main",
      filePath: "chat",
    });
  });

  it("parses encoded branch names", () => {
    expect(parseVaultPathContext("/vault/octo/repo/fs/feature%2Flogin-flow/src/App.tsx")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login-flow",
      filePath: "src/App.tsx",
    });
  });

  it("marks delimiter file routes invalid", () => {
    expect(parseVaultPathContext("/vault/octo/repo/-/main/src/index.ts")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });

  it("marks database routes invalid for the catch-all file route parser", () => {
    expect(parseVaultPathContext("/vault/octo/repo/db/main/root")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });

  it("keeps the retired Codespaces route invalid for the catch-all file route parser", () => {
    expect(parseVaultPathContext("/vault/octo/repo/codespace/main/chat")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });

  it("marks legacy branch editor routes invalid", () => {
    expect(parseVaultPathContext("/vault/octo/repo/main/src/index.ts")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      isInvalidVaultRoute: true,
    });
  });
});
