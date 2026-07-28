// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  getPasswordAuthSurface,
  getVisiblePasswordAuthSurface,
  rememberPublicLandingPasswordAuthMode,
  resolvePublicLandingPasswordAuthMode,
  shouldRenderGoogleSignupClosedState,
} from "./publicLandingAuthState";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

function createMockStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    return;
  }

  Reflect.deleteProperty(window, "localStorage");
});

describe("publicLandingAuthState", () => {
  it.each(["/", "/settings"])(
    "shows the closed-signup state for a marked Google return on %s",
    (pathname) => {
      const routeSearch = validateRootRouteSearch({ signup: "google" });

      expect(shouldRenderGoogleSignupClosedState(pathname, routeSearch)).toBe(true);
    },
  );

  it("keeps MCP consent available when a stale signup marker is present", () => {
    const routeSearch = validateRootRouteSearch({ signup: "google" });

    expect(shouldRenderGoogleSignupClosedState(MCP_CONSENT_APP_PATH, routeSearch)).toBe(false);
  });

  it("maps the public password auth mode to a stable landing surface", () => {
    expect(getPasswordAuthSurface("preview_seed")).toBe("seeded_sign_in");
    expect(getPasswordAuthSurface("production_review_seed")).toBe("seeded_sign_in");
    expect(getPasswordAuthSurface("local_worktree_seed")).toBe("local_worktree");
    expect(getPasswordAuthSurface("off")).toBe("hidden");
  });

  it("hides password auth surfaces when prod-ui mode is enabled", () => {
    expect(
      getVisiblePasswordAuthSurface({
        passwordAuthMode: "preview_seed",
        prodUiModeEnabled: true,
      }),
    ).toBe("hidden");
    expect(
      getVisiblePasswordAuthSurface({
        passwordAuthMode: "local_worktree_seed",
        prodUiModeEnabled: true,
      }),
    ).toBe("hidden");
    expect(
      getVisiblePasswordAuthSurface({
        passwordAuthMode: "local_worktree_seed",
        prodUiModeEnabled: false,
      }),
    ).toBe("local_worktree");
  });

  it("keeps production review password auth visible in prod-ui mode", () => {
    expect(
      getVisiblePasswordAuthSurface({
        passwordAuthMode: "production_review_seed",
        prodUiModeEnabled: true,
      }),
    ).toBe("seeded_sign_in");
  });

  it("reuses the remembered password auth mode while the public policy reloads", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });

    rememberPublicLandingPasswordAuthMode("local_worktree_seed");

    expect(resolvePublicLandingPasswordAuthMode(undefined)).toBe("local_worktree_seed");
    expect(
      getVisiblePasswordAuthSurface({
        passwordAuthMode: resolvePublicLandingPasswordAuthMode(undefined),
        prodUiModeEnabled: false,
      }),
    ).toBe("local_worktree");
  });

  it("ignores invalid remembered password auth values", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });
    window.localStorage.setItem("samebase_public_landing_password_auth_mode", "nope");

    expect(resolvePublicLandingPasswordAuthMode(undefined)).toBe("off");
  });
});
