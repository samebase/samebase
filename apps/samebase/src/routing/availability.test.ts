import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  canAccessRouteAvailability,
  canAccessRouteMatchesAvailability,
  isLocalRouteHostname,
  readBrowserRouteEnvironment,
  readRouteEnvironmentForOrigin,
  readRouteEnvironmentForRouteGuard,
  resolveRouteEnvironment,
} from "./availability";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLocalRouteHostname", () => {
  it("allows loopback hosts used by local dev and local previews", () => {
    expect(isLocalRouteHostname("localhost")).toBe(true);
    expect(isLocalRouteHostname("  LOCALHOST  ")).toBe(true);
    expect(isLocalRouteHostname("127.0.0.1")).toBe(true);
    expect(isLocalRouteHostname("0.0.0.0")).toBe(true);
    expect(isLocalRouteHostname("::1")).toBe(true);
    expect(isLocalRouteHostname("[::1]")).toBe(true);
  });

  it("rejects production and preview hostnames", () => {
    expect(isLocalRouteHostname("samebase.com")).toBe(false);
    expect(isLocalRouteHostname("www.samebase.com")).toBe(false);
    expect(isLocalRouteHostname("preview.samebase.com")).toBe(false);
    expect(isLocalRouteHostname("codex-dashboard-main-pane-spacing.samebase.pages.dev")).toBe(
      false,
    );
    expect(isLocalRouteHostname("a3070b07.samebase-ax1.pages.dev")).toBe(false);
    expect(isLocalRouteHostname("")).toBe(false);
  });
});

describe("resolveRouteEnvironment", () => {
  it("maps known hostnames to local, production, and preview environments", () => {
    expect(resolveRouteEnvironment({ hostname: "localhost" })).toBe("local");
    expect(resolveRouteEnvironment({ hostname: "samebase.com" })).toBe("production");
    expect(resolveRouteEnvironment({ hostname: "www.samebase.com" })).toBe("production");
    expect(resolveRouteEnvironment({ hostname: "preview.samebase.com" })).toBe("preview");
    expect(resolveRouteEnvironment({ hostname: "a3070b07.samebase-ax1.pages.dev" })).toBe(
      "preview",
    );
  });

  it("uses the build route environment when Cloudflare sets one", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "preview");

    expect(resolveRouteEnvironment({ hostname: "localhost" })).toBe("preview");
  });

  it("ignores unknown build route environment values", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "staging");

    expect(resolveRouteEnvironment({ hostname: "localhost" })).toBe("local");
  });
});

describe("readBrowserRouteEnvironment", () => {
  it("uses the build route environment before browser host fallback", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "production");

    expect(readBrowserRouteEnvironment()).toBe("production");
  });

  it("fails closed when no browser host or build environment is available", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "");

    expect(readRouteEnvironmentForRouteGuard()).toBeNull();
    expect(readBrowserRouteEnvironment()).toBe("production");
  });
});

describe("readRouteEnvironmentForOrigin", () => {
  it("resolves route environment from URL origins", () => {
    expect(readRouteEnvironmentForOrigin("http://localhost:5174")).toBe("local");
    expect(readRouteEnvironmentForOrigin("https://samebase.com")).toBe("production");
    expect(readRouteEnvironmentForOrigin("https://preview.samebase.com")).toBe("preview");
  });

  it("fails closed for invalid origins", () => {
    expect(readRouteEnvironmentForOrigin("not a url")).toBe("production");
  });
});

describe("canAccessRouteAvailability", () => {
  it("treats missing availability as available in every environment", () => {
    expect(canAccessRouteAvailability(undefined, "local")).toBe(true);
    expect(canAccessRouteAvailability(undefined, "preview")).toBe(true);
    expect(canAccessRouteAvailability(undefined, "production")).toBe(true);
  });

  it("allows only named environments", () => {
    expect(canAccessRouteAvailability(["local"], "local")).toBe(true);
    expect(canAccessRouteAvailability(["local"], "preview")).toBe(false);
    expect(canAccessRouteAvailability(["preview", "production"], "preview")).toBe(true);
    expect(canAccessRouteAvailability(["preview", "production"], "local")).toBe(false);
  });
});

describe("canAccessRouteMatchesAvailability", () => {
  it("requires every matched route availability policy to allow the environment", () => {
    expect(
      canAccessRouteMatchesAvailability(
        [{ staticData: {} }, { staticData: { availableEnvironments: ["local", "preview"] } }],
        "preview",
      ),
    ).toBe(true);
    expect(
      canAccessRouteMatchesAvailability(
        [
          { staticData: { availableEnvironments: ["local"] } },
          { staticData: { availableEnvironments: ["preview"] } },
        ],
        "preview",
      ),
    ).toBe(false);
  });
});
