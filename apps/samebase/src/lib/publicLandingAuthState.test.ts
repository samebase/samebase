// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import { getPasswordAuthSurface, shouldRenderOAuthReturnNotice } from "./publicLandingAuthState";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

describe("publicLandingAuthState", () => {
  it.each(["/", "/settings"])(
    "shows the OAuth return notice for a marked Google return on %s",
    (pathname) => {
      const routeSearch = validateRootRouteSearch({ signup: "google" });

      expect(shouldRenderOAuthReturnNotice(pathname, routeSearch, false)).toBe(true);
    },
  );

  it("keeps MCP consent available when a stale signup marker is present", () => {
    const routeSearch = validateRootRouteSearch({ signup: "google" });

    expect(shouldRenderOAuthReturnNotice(MCP_CONSENT_APP_PATH, routeSearch, false)).toBe(false);
  });

  it("keeps an invitation available when a stale signup marker is present", () => {
    const routeSearch = validateRootRouteSearch({ signup: "github" });

    expect(shouldRenderOAuthReturnNotice("/invite/invitation-code", routeSearch, false)).toBe(
      false,
    );
  });

  it("keeps sign-in methods available after an authorization error or a rejected sign-in", () => {
    const routeSearch = validateRootRouteSearch({ signup: "github" });
    const authorizationErrorSearch = validateRootRouteSearch({
      signup: "github",
      "authorization-provider": "github-app",
      "authorization-error": "failed",
    });

    expect(shouldRenderOAuthReturnNotice("/", authorizationErrorSearch, false)).toBe(false);
    expect(shouldRenderOAuthReturnNotice("/", routeSearch, true)).toBe(false);
  });

  it("maps the public password auth mode to a stable landing surface", () => {
    expect(getPasswordAuthSurface("preview_seed")).toBe("hidden");
    expect(getPasswordAuthSurface("manual")).toBe("sign_in");
    expect(getPasswordAuthSurface("local_worktree_seed")).toBe("local_worktree");
    expect(getPasswordAuthSurface("off")).toBe("hidden");
  });
});
