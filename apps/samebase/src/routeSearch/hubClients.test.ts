import { describe, expect, it } from "vite-plus/test";
import {
  validateAdminHubClientsRouteSearch,
  validateOrganizationHubClientsRouteSearch,
} from "@/routeSearch/hubClients";

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

describe("organization hub clients route search", () => {
  it("has no owner filter and no owner grouping", () => {
    expect(
      validateOrganizationHubClientsRouteSearch({
        q: "my-app",
        owner: "someone",
        stage: "preview",
        group: "owner",
      }),
    ).toEqual({ q: "my-app", stage: "preview" });
    expect(validateOrganizationHubClientsRouteSearch({ group: "none" })).toEqual({ group: "none" });
  });
});
