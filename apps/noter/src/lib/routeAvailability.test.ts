import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  canAccessNoterRouteAvailability,
  canAccessNoterRouteMatchesAvailability,
  isLocalRouteHostname,
  readBrowserNoterRouteEnvironment,
  readNoterRouteEnvironmentForOrigin,
  readNoterRouteEnvironmentForRouteGuard,
  resolveNoterRouteEnvironment,
} from "./routeAvailability";

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
    expect(isLocalRouteHostname("noter.md")).toBe(false);
    expect(isLocalRouteHostname("www.noter.md")).toBe(false);
    expect(isLocalRouteHostname("preview.noter.md")).toBe(false);
    expect(isLocalRouteHostname("codex-dashboard-main-pane-spacing.noter.pages.dev")).toBe(false);
    expect(isLocalRouteHostname("a3070b07.noter-ax1.pages.dev")).toBe(false);
    expect(isLocalRouteHostname("")).toBe(false);
  });
});

describe("resolveNoterRouteEnvironment", () => {
  it("maps known hostnames to local, production, and preview environments", () => {
    expect(resolveNoterRouteEnvironment({ hostname: "localhost" })).toBe("local");
    expect(resolveNoterRouteEnvironment({ hostname: "noter.md" })).toBe("production");
    expect(resolveNoterRouteEnvironment({ hostname: "www.noter.md" })).toBe("production");
    expect(resolveNoterRouteEnvironment({ hostname: "preview.noter.md" })).toBe("preview");
    expect(resolveNoterRouteEnvironment({ hostname: "a3070b07.noter-ax1.pages.dev" })).toBe(
      "preview",
    );
  });

  it("uses the build route environment when Cloudflare sets one", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_ENVIRONMENT", "preview");

    expect(resolveNoterRouteEnvironment({ hostname: "localhost" })).toBe("preview");
  });

  it("ignores unknown build route environment values", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_ENVIRONMENT", "staging");

    expect(resolveNoterRouteEnvironment({ hostname: "localhost" })).toBe("local");
  });
});

describe("readBrowserNoterRouteEnvironment", () => {
  it("uses the build route environment before browser host fallback", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_ENVIRONMENT", "production");

    expect(readBrowserNoterRouteEnvironment()).toBe("production");
  });

  it("fails closed when no browser host or build environment is available", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_ENVIRONMENT", "");

    expect(readNoterRouteEnvironmentForRouteGuard()).toBeNull();
    expect(readBrowserNoterRouteEnvironment()).toBe("production");
  });
});

describe("readNoterRouteEnvironmentForOrigin", () => {
  it("resolves route environment from URL origins", () => {
    expect(readNoterRouteEnvironmentForOrigin("http://localhost:5174")).toBe("local");
    expect(readNoterRouteEnvironmentForOrigin("https://noter.md")).toBe("production");
    expect(readNoterRouteEnvironmentForOrigin("https://preview.noter.md")).toBe("preview");
  });

  it("fails closed for invalid origins", () => {
    expect(readNoterRouteEnvironmentForOrigin("not a url")).toBe("production");
  });
});

describe("canAccessNoterRouteAvailability", () => {
  it("treats missing availability as available in every environment", () => {
    expect(canAccessNoterRouteAvailability(undefined, "local")).toBe(true);
    expect(canAccessNoterRouteAvailability(undefined, "preview")).toBe(true);
    expect(canAccessNoterRouteAvailability(undefined, "production")).toBe(true);
  });

  it("allows only named environments", () => {
    expect(canAccessNoterRouteAvailability(["local"], "local")).toBe(true);
    expect(canAccessNoterRouteAvailability(["local"], "preview")).toBe(false);
    expect(canAccessNoterRouteAvailability(["preview", "production"], "preview")).toBe(true);
    expect(canAccessNoterRouteAvailability(["preview", "production"], "local")).toBe(false);
  });
});

describe("canAccessNoterRouteMatchesAvailability", () => {
  it("requires every matched route availability policy to allow the environment", () => {
    expect(
      canAccessNoterRouteMatchesAvailability(
        [{ staticData: {} }, { staticData: { availableEnvironments: ["local", "preview"] } }],
        "preview",
      ),
    ).toBe(true);
    expect(
      canAccessNoterRouteMatchesAvailability(
        [
          { staticData: { availableEnvironments: ["local"] } },
          { staticData: { availableEnvironments: ["preview"] } },
        ],
        "preview",
      ),
    ).toBe(false);
  });
});
