import { describe, expect, it } from "vite-plus/test";
import {
  validateAdminBrokerClientsRouteSearch,
  validateOrganizationBrokerClientsRouteSearch,
} from "@/routeSearch/brokerClients";

describe("admin broker clients route search", () => {
  it("keeps the search and the comma-separated filters, and only the known groupings", () => {
    expect(
      validateAdminBrokerClientsRouteSearch({
        q: " scout ",
        stage: "preview,development",
        group: "owner",
      }),
    ).toEqual({ q: "scout", stage: "preview,development", group: "owner" });
    expect(validateAdminBrokerClientsRouteSearch({ group: "repository", owner: " " })).toEqual({});
  });
});

describe("organization broker clients route search", () => {
  it("has no owner filter and no owner grouping", () => {
    expect(
      validateOrganizationBrokerClientsRouteSearch({
        q: "my-app",
        owner: "someone",
        stage: "preview",
        group: "owner",
      }),
    ).toEqual({ q: "my-app", stage: "preview" });
    expect(validateOrganizationBrokerClientsRouteSearch({ group: "none" })).toEqual({
      group: "none",
    });
  });
});
