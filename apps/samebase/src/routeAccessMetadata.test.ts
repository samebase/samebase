import { describe, expect, it } from "vite-plus/test";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "./routeAccessMetadata";

describe("route access metadata", () => {
  it("keeps developer logo routes publicly reachable without prerendering them", () => {
    const developerLogoRoutes = [
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
        prerender: false,
      });
    }
  });

  it("keeps the standard right sidebar on account deletion routes", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/account-deletion"].appWorkspaceRouteChrome).toEqual({
      leftPane: "none",
      mobilePane: "main",
    });
    expect(
      ROUTE_ACCESS_METADATA_BY_PATH["/admin/account-deletions"].appWorkspaceRouteChrome,
    ).toEqual({
      leftPane: "none",
      mobilePane: "main",
    });
  });
});
