import { describe, expect, it } from "vite-plus/test";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "./routeAccessMetadata";

describe("route access metadata", () => {
  it("keeps the standard right sidebar on account deletion", () => {
    expect(ROUTE_ACCESS_METADATA_BY_PATH["/account-deletion"].appWorkspaceRouteChrome).toEqual({
      leftPane: "none",
      mobilePane: "main",
    });
  });
});
