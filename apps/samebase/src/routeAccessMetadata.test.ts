import { describe, expect, it } from "vite-plus/test";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "./routeAccessMetadata";

describe("route access metadata", () => {
  it("keeps account deletion available but out of route suggestions", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/account-deletion"]).toMatchObject({
      access: "access_account_deletion",
      pathSuggestion: "hidden",
    });
  });

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

  it("keeps developer logo routes public and developer-only in suggestions", () => {
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
      });
      expect(ROUTE_ACCESS_METADATA_BY_PATH[route]).not.toHaveProperty("prerender");
    }
  });
});
