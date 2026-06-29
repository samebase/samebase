import { describe, expect, it } from "vite-plus/test";

import {
  buildVaultDatabaseRoute,
  buildVaultFileRoute,
  buildVaultCodespaceChatRoute,
  isChatOnlyCodespaceRoute,
  parseVaultDatabasePathContext,
  parseVaultPathContext,
} from "./vaultRoutes";

describe("buildVaultCodespaceChatRoute", () => {
  it("encodes branch names with slashes", () => {
    expect(
      buildVaultCodespaceChatRoute({
        repositoryFullName: "octo/repo",
        branch: "feature/login-flow",
      }),
    ).toBe("/vault/octo/repo/codespace/feature%2Flogin-flow/chat");
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

describe("isChatOnlyCodespaceRoute", () => {
  it("matches the codespace chat route", () => {
    expect(isChatOnlyCodespaceRoute("/vault/octo/repo/codespace/main/chat")).toBe(true);
  });

  it("does not match editor file routes", () => {
    expect(isChatOnlyCodespaceRoute("/vault/octo/repo/main/chat")).toBe(false);
  });

  it("does not match non-chat routes under codespace namespace", () => {
    expect(isChatOnlyCodespaceRoute("/vault/octo/repo/codespace/main/src/index.ts")).toBe(false);
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
      isCodespaceChatRoute: false,
    });
  });

  it("parses encoded branch names", () => {
    expect(parseVaultPathContext("/vault/octo/repo/fs/feature%2Flogin-flow/src/App.tsx")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login-flow",
      filePath: "src/App.tsx",
      isCodespaceChatRoute: false,
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

  it("parses codespace chat routes", () => {
    expect(parseVaultPathContext("/vault/octo/repo/codespace/feature%2Flogin/chat")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login",
      isCodespaceChatRoute: true,
    });
  });

  it("treats codespace as a normal branch outside chat-only route shape", () => {
    expect(parseVaultPathContext("/vault/octo/repo/codespace/src/index.ts")).toEqual({
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

describe("parseVaultDatabasePathContext", () => {
  it("parses root app database routes", () => {
    expect(parseVaultDatabasePathContext("/vault/octo/repo/db/feature%2Flogin/root")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "feature/login",
      appRoot: ".",
    });
  });

  it("parses monorepo app database routes", () => {
    expect(parseVaultDatabasePathContext("/vault/octo/repo/db/main/mono/apps/web%20app")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "main",
      appRoot: "apps/web app",
    });
  });

  it("marks invalid database app targets invalid", () => {
    expect(parseVaultDatabasePathContext("/vault/octo/repo/db/main/app/apps/web")).toEqual({
      owner: "octo",
      repositoryFullName: "octo/repo",
      repoName: "repo",
      branch: "main",
      isInvalidVaultRoute: true,
    });
  });
});
