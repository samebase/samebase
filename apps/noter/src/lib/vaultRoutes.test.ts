import { describe, expect, it } from "vitest";

import {
  buildVaultCodespaceChatRoute,
  isChatOnlyCodespaceRoute,
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

describe("isChatOnlyCodespaceRoute", () => {
  it("matches the codespace chat route", () => {
    expect(
      isChatOnlyCodespaceRoute("/vault/octo/repo/codespace/main/chat"),
    ).toBe(true);
  });

  it("does not match editor file routes", () => {
    expect(isChatOnlyCodespaceRoute("/vault/octo/repo/main/chat")).toBe(false);
  });

  it("does not match non-chat routes under codespace namespace", () => {
    expect(
      isChatOnlyCodespaceRoute("/vault/octo/repo/codespace/main/src/index.ts"),
    ).toBe(false);
  });
});

describe("parseVaultPathContext", () => {
  it("parses branchless vault routes", () => {
    expect(parseVaultPathContext("/vault/octo/repo")).toEqual({
      repositoryFullName: "octo/repo",
    });
  });

  it("parses branch editor routes and preserves file paths named chat", () => {
    expect(parseVaultPathContext("/vault/octo/repo/main/chat")).toEqual({
      repositoryFullName: "octo/repo",
      branch: "main",
      filePath: "chat",
    });
  });

  it("parses encoded branch names", () => {
    expect(
      parseVaultPathContext(
        "/vault/octo/repo/feature%2Flogin-flow/src/App.tsx",
      ),
    ).toEqual({
      repositoryFullName: "octo/repo",
      branch: "feature/login-flow",
      filePath: "src/App.tsx",
    });
  });

  it("parses codespace chat routes", () => {
    expect(
      parseVaultPathContext("/vault/octo/repo/codespace/feature%2Flogin/chat"),
    ).toEqual({
      repositoryFullName: "octo/repo",
      branch: "feature/login",
    });
  });

  it("treats codespace as a normal branch outside chat-only route shape", () => {
    expect(
      parseVaultPathContext("/vault/octo/repo/codespace/src/index.ts"),
    ).toEqual({
      repositoryFullName: "octo/repo",
      branch: "codespace",
      filePath: "src/index.ts",
    });
  });
});
