import { describe, expect, it } from "vitest";
import { resolveAuthenticatedAppRoute } from "./appRouteResolution";

describe("resolveAuthenticatedAppRoute", () => {
  it("resolves fixed authenticated routes", () => {
    expect(resolveAuthenticatedAppRoute("/")).toBe("dashboard");
    expect(resolveAuthenticatedAppRoute("/test")).toBe("test");
  });

  it("resolves vault-backed routes", () => {
    expect(resolveAuthenticatedAppRoute("/vault/octo/repo")).toBe("fileView");
    expect(resolveAuthenticatedAppRoute("/vault/octo/repo/main")).toBe(
      "fileView",
    );
    expect(
      resolveAuthenticatedAppRoute("/vault/octo/repo/main/src/file.ts"),
    ).toBe("fileView");
  });

  it("prefers the chat-only codespace route over generic vault matching", () => {
    expect(
      resolveAuthenticatedAppRoute("/vault/octo/repo/codespace/main/chat"),
    ).toBe("codespaceChat");
  });

  it("treats unknown paths as unmatched", () => {
    expect(resolveAuthenticatedAppRoute("/missing")).toBe("none");
  });

  it("accepts optional trailing slashes on exact routes", () => {
    expect(resolveAuthenticatedAppRoute("/test/")).toBe("test");
  });
});
