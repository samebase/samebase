import { describe, expect, it } from "vitest";
import { resolveAuthenticatedAppRoute } from "./appRouteResolution";

describe("resolveAuthenticatedAppRoute", () => {
  it("resolves fixed authenticated routes", () => {
    expect(resolveAuthenticatedAppRoute("/")).toBe("dashboard");
    expect(resolveAuthenticatedAppRoute("/test")).toBe("test");
  });

  it("no longer treats vault-backed paths as App-owned routes", () => {
    expect(resolveAuthenticatedAppRoute("/vault/octo/repo")).toBe("none");
    expect(resolveAuthenticatedAppRoute("/vault/octo/repo/main")).toBe("none");
    expect(
      resolveAuthenticatedAppRoute("/vault/octo/repo/main/src/file.ts"),
    ).toBe("none");
    expect(
      resolveAuthenticatedAppRoute("/vault/octo/repo/codespace/main/chat"),
    ).toBe("none");
  });

  it("treats unknown paths as unmatched", () => {
    expect(resolveAuthenticatedAppRoute("/missing")).toBe("none");
  });

  it("accepts optional trailing slashes on exact routes", () => {
    expect(resolveAuthenticatedAppRoute("/test/")).toBe("test");
  });
});
