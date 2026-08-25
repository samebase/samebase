import { describe, expect, it } from "vite-plus/test";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "./routeAccessMetadata";

describe("route access metadata", () => {
  it("keeps organization connection in the global app surface", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/connect-organization"]).toMatchObject({
      access: "access_app_create",
      appWorkspaceRouteChrome: { leftPane: "none" },
      pathSuggestion: "hidden",
    });
  });

  it("requires dashboard access for organization settings", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings"].access).toBe("access_dashboard");
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings/members"].access).toBe(
      "access_dashboard",
    );
  });

  it("keeps invitation redemption public and out of route suggestions", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/invite/$code"]).toMatchObject({
      access: "access_public",
      appWorkspaceRouteChrome: { leftPane: "none" },
      pathSuggestion: "hidden",
      prerender: false,
    });
  });

  it("keeps docs public and visible in route suggestions", () => {
    const publicDocsPaths = [
      "/docs",
      "/docs/cloudflare-setup",
      "/docs/do-it-yourself",
      "/docs/receipts",
      "/docs/the-stack",
    ] as const;

    for (const path of publicDocsPaths) {
      expect(ROUTE_ACCESS_METADATA_BY_PATH[path]).toEqual({
        access: "access_public",
      });
    }
  });

  it("keeps the retired landing preview as a non-prerendered redirect", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/landing-preview"]).toEqual({
      access: "access_public",
      pathSuggestion: "redirect",
      prerender: false,
    });
  });

  it("keeps public link redirects out of route suggestions and prerendering", () => {
    for (const path of ["/youtube", "/discord"] as const) {
      expect(ROUTE_ACCESS_METADATA_BY_PATH[path]).toEqual({
        access: "access_public",
        pathSuggestion: "redirect",
        prerender: false,
      });
    }
  });

  it("keeps developer logo routes public and developer-only in suggestions", () => {
    const developerLogoRoutes = [
      "/logo",
      "/logo/iso",
      "/logo/raster",
      "/logo/raster-seams",
      "/logo/single-cube",
      "/logo/svg",
      "/logo/transition",
      "/logo/transition/menger",
      "/logo/transition/transforms",
    ] as const;

    for (const route of developerLogoRoutes) {
      expect(ROUTE_ACCESS_METADATA_BY_PATH[route]).toMatchObject({
        access: "access_public",
        pathSuggestion: "dev",
      });
      expect(ROUTE_ACCESS_METADATA_BY_PATH[route]).not.toHaveProperty("prerender");
    }
  });
});
