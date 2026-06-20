import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  canAccessSamebaseRouteAvailability,
  canAccessSamebaseRouteMatchesAvailability,
  isLocalRouteHostname,
  readBrowserSamebaseRouteEnvironment,
  readSamebaseRouteEnvironmentForOrigin,
  readSamebaseRouteEnvironmentForRouteGuard,
  resolveSamebaseRouteEnvironment,
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

describe("resolveSamebaseRouteEnvironment", () => {
  it("maps known hostnames to local, production, and preview environments", () => {
    expect(resolveSamebaseRouteEnvironment({ hostname: "localhost" })).toBe("local");
    expect(resolveSamebaseRouteEnvironment({ hostname: "samebase.com" })).toBe("production");
    expect(resolveSamebaseRouteEnvironment({ hostname: "www.samebase.com" })).toBe("production");
    expect(resolveSamebaseRouteEnvironment({ hostname: "preview.samebase.com" })).toBe("preview");
    expect(resolveSamebaseRouteEnvironment({ hostname: "a3070b07.samebase-ax1.pages.dev" })).toBe(
      "preview",
    );
  });

  it("uses the build route environment when Cloudflare sets one", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "preview");

    expect(resolveSamebaseRouteEnvironment({ hostname: "localhost" })).toBe("preview");
  });

  it("ignores unknown build route environment values", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "staging");

    expect(resolveSamebaseRouteEnvironment({ hostname: "localhost" })).toBe("local");
  });
});

describe("readBrowserSamebaseRouteEnvironment", () => {
  it("uses the build route environment before browser host fallback", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "production");

    expect(readBrowserSamebaseRouteEnvironment()).toBe("production");
  });

  it("fails closed when no browser host or build environment is available", () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "");

    expect(readSamebaseRouteEnvironmentForRouteGuard()).toBeNull();
    expect(readBrowserSamebaseRouteEnvironment()).toBe("production");
  });
});

describe("readSamebaseRouteEnvironmentForOrigin", () => {
  it("resolves route environment from URL origins", () => {
    expect(readSamebaseRouteEnvironmentForOrigin("http://localhost:5174")).toBe("local");
    expect(readSamebaseRouteEnvironmentForOrigin("https://samebase.com")).toBe("production");
    expect(readSamebaseRouteEnvironmentForOrigin("https://preview.samebase.com")).toBe("preview");
  });

  it("fails closed for invalid origins", () => {
    expect(readSamebaseRouteEnvironmentForOrigin("not a url")).toBe("production");
  });
});

describe("canAccessSamebaseRouteAvailability", () => {
  it("treats missing availability as available in every environment", () => {
    expect(canAccessSamebaseRouteAvailability(undefined, "local")).toBe(true);
    expect(canAccessSamebaseRouteAvailability(undefined, "preview")).toBe(true);
    expect(canAccessSamebaseRouteAvailability(undefined, "production")).toBe(true);
  });

  it("allows only named environments", () => {
    expect(canAccessSamebaseRouteAvailability(["local"], "local")).toBe(true);
    expect(canAccessSamebaseRouteAvailability(["local"], "preview")).toBe(false);
    expect(canAccessSamebaseRouteAvailability(["preview", "production"], "preview")).toBe(true);
    expect(canAccessSamebaseRouteAvailability(["preview", "production"], "local")).toBe(false);
  });
});

describe("canAccessSamebaseRouteMatchesAvailability", () => {
  it("requires every matched route availability policy to allow the environment", () => {
    expect(
      canAccessSamebaseRouteMatchesAvailability(
        [{ staticData: {} }, { staticData: { availableEnvironments: ["local", "preview"] } }],
        "preview",
      ),
    ).toBe(true);
    expect(
      canAccessSamebaseRouteMatchesAvailability(
        [
          { staticData: { availableEnvironments: ["local"] } },
          { staticData: { availableEnvironments: ["preview"] } },
        ],
        "preview",
      ),
    ).toBe(false);
  });
});
