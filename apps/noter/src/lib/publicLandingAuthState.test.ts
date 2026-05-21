// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  getPasswordAuthSurface,
  getVisiblePasswordAuthSurface,
  rememberPublicLandingPasswordAuthMode,
  resolvePublicLandingPasswordAuthMode,
  shouldRenderGoogleSignupClosedState,
  shouldRenderPublicLandingWithoutAuthGate,
  shouldShowGoogleAuthForPathname,
} from "./publicLandingAuthState";
import { validateRootRouteSearch } from "./rootRouteSearch";

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
  it("keeps the anonymous landing visible even when Convex auth tokens exist", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });
    window.localStorage.setItem("__convexAuthRefreshToken", "anon-token");

    expect(shouldRenderPublicLandingWithoutAuthGate("/", validateRootRouteSearch({}))).toBe(true);
  });

  it("hides the anonymous landing after a remembered auth flow starts", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });
    window.localStorage.setItem("noter_auth_provider", "google");

    expect(shouldRenderPublicLandingWithoutAuthGate("/", validateRootRouteSearch({}))).toBe(false);
  });

  it("keeps Google auth hidden on the normal public landing with remembered auth state", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });
    window.localStorage.setItem("noter_auth_provider", "google");

    expect(shouldShowGoogleAuthForPathname("/", validateRootRouteSearch({}))).toBe(false);
    expect(shouldShowGoogleAuthForPathname("/", validateRootRouteSearch({ dev: true }))).toBe(true);
  });

  it("forces the public landing closed-signup state for marked Google returns", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMockStorage(),
    });
    window.localStorage.setItem("noter_auth_provider", "google");

    const routeSearch = validateRootRouteSearch({ signup: "google" });

    expect(shouldRenderGoogleSignupClosedState("/", routeSearch)).toBe(true);
    expect(shouldRenderPublicLandingWithoutAuthGate("/", routeSearch)).toBe(true);
    expect(shouldShowGoogleAuthForPathname("/", routeSearch)).toBe(false);
  });

  it("maps the public password auth mode to a stable landing surface", () => {
    expect(getPasswordAuthSurface("preview_seed")).toBe("preview");
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
    window.localStorage.setItem("noter_public_landing_password_auth_mode", "nope");

    expect(resolvePublicLandingPasswordAuthMode(undefined)).toBe("off");
  });
});
