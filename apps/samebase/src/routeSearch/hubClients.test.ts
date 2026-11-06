import { describe, expect, it } from "vite-plus/test";
import { validateAdminHubClientsRouteSearch } from "@/routeSearch/adminHubClients";

describe("admin hub clients route search", () => {
  it("keeps the search and the comma-separated filters, and only the known groupings", () => {
    expect(
      validateAdminHubClientsRouteSearch({
        q: " scout ",
        stage: "preview,development",
        group: "owner",
      }),
    ).toEqual({ q: "scout", stage: "preview,development", group: "owner" });
    expect(validateAdminHubClientsRouteSearch({ group: "repository", owner: " " })).toEqual({});
  });
});
