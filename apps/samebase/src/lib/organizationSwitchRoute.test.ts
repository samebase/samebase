import { describe, expect, it } from "vite-plus/test";
import { buildOrganizationSwitchHref } from "@/lib/organizationSwitchRoute";

describe("buildOrganizationSwitchHref", () => {
  it("clears billing state when switching organizations", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "billing",
        search: {
          checkout: "success",
          customer_session_token: "return-state",
          "prod-ui": true,
        },
        target: {
          kind: "organization",
          owner: "Target-Org",
          section: "settings",
        },
      }),
    ).toBe("/org/Target-Org/settings?prod-ui#billing");
  });

  it("clears billing state when switching to All repositories and keeps unrelated URL state", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "#billing",
        search: {
          checkout: "cancel",
          customer_session_token: true,
          "prod-ui": true,
          view: "compact",
        },
        target: { kind: "allRepositories" },
      }),
    ).toBe("/repo?prod-ui&view=compact#billing");
  });

  it("keeps the Members section when switching organizations", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "",
        search: { "prod-ui": true },
        target: {
          kind: "organization",
          owner: "Target-Org",
          section: "members",
        },
      }),
    ).toBe("/org/Target-Org/settings/members?prod-ui");
  });
});
