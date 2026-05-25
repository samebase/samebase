import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  canAccessNoterRouteAvailability,
  canAccessNoterRouteMatchesAvailability,
  isLocalRouteHostname,
  readBrowserNoterRouteSurface,
  readNoterRouteSurfaceForOrigin,
  readNoterRouteSurfaceForRouteGuard,
  resolveNoterRouteSurface,
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

describe("resolveNoterRouteSurface", () => {
  it("maps known hostnames to local, production, and preview surfaces", () => {
    expect(resolveNoterRouteSurface({ hostname: "localhost" })).toBe("local");
    expect(resolveNoterRouteSurface({ hostname: "noter.md" })).toBe("production");
    expect(resolveNoterRouteSurface({ hostname: "www.noter.md" })).toBe("production");
    expect(resolveNoterRouteSurface({ hostname: "preview.noter.md" })).toBe("preview");
    expect(resolveNoterRouteSurface({ hostname: "a3070b07.noter-ax1.pages.dev" })).toBe("preview");
  });

  it("uses the build route surface when Cloudflare sets one", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_SURFACE", "preview");

    expect(resolveNoterRouteSurface({ hostname: "localhost" })).toBe("preview");
  });

  it("ignores unknown build route surface values", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_SURFACE", "staging");

    expect(resolveNoterRouteSurface({ hostname: "localhost" })).toBe("local");
  });
});

describe("readBrowserNoterRouteSurface", () => {
  it("uses the build route surface before browser host fallback", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_SURFACE", "production");

    expect(readBrowserNoterRouteSurface()).toBe("production");
  });

  it("fails closed when no browser host or build surface is available", () => {
    vi.stubEnv("VITE_NOTER_ROUTE_SURFACE", "");

    expect(readNoterRouteSurfaceForRouteGuard()).toBeNull();
    expect(readBrowserNoterRouteSurface()).toBe("production");
  });
});

describe("readNoterRouteSurfaceForOrigin", () => {
  it("resolves route surface from URL origins", () => {
    expect(readNoterRouteSurfaceForOrigin("http://localhost:5174")).toBe("local");
    expect(readNoterRouteSurfaceForOrigin("https://noter.md")).toBe("production");
    expect(readNoterRouteSurfaceForOrigin("https://preview.noter.md")).toBe("preview");
  });

  it("fails closed for invalid origins", () => {
    expect(readNoterRouteSurfaceForOrigin("not a url")).toBe("production");
  });
});

describe("canAccessNoterRouteAvailability", () => {
  it("treats missing availability as available on every surface", () => {
    expect(canAccessNoterRouteAvailability(undefined, "local")).toBe(true);
    expect(canAccessNoterRouteAvailability(undefined, "preview")).toBe(true);
    expect(canAccessNoterRouteAvailability(undefined, "production")).toBe(true);
  });

  it("allows only named surfaces", () => {
    expect(canAccessNoterRouteAvailability(["local"], "local")).toBe(true);
    expect(canAccessNoterRouteAvailability(["local"], "preview")).toBe(false);
    expect(canAccessNoterRouteAvailability(["preview", "production"], "preview")).toBe(true);
    expect(canAccessNoterRouteAvailability(["preview", "production"], "local")).toBe(false);
  });
});

describe("canAccessNoterRouteMatchesAvailability", () => {
  it("requires every matched route availability policy to allow the surface", () => {
    expect(
      canAccessNoterRouteMatchesAvailability(
        [{ staticData: {} }, { staticData: { availableOn: ["local", "preview"] } }],
        "preview",
      ),
    ).toBe(true);
    expect(
      canAccessNoterRouteMatchesAvailability(
        [{ staticData: { availableOn: ["local"] } }, { staticData: { availableOn: ["preview"] } }],
        "preview",
      ),
    ).toBe(false);
  });
});
