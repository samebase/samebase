import { describe, expect, it } from "vite-plus/test";
import { buildOrganizationSwitchHref } from "@/organization/organizationSwitchRoute";

describe("buildOrganizationSwitchHref", () => {
  it("clears billing state when switching organizations", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "billing",
        search: {
          checkout: "success",
          customer_session_token: "return-state",
          "swipe-debug": true,
        },
        target: {
          kind: "organization",
          owner: "Target-Org",
          section: "settings",
        },
      }),
    ).toBe("/org/Target-Org/settings?swipe-debug#billing");
  });

  it("clears billing state when switching to All repositories and keeps unrelated URL state", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "#billing",
        search: {
          checkout: "cancel",
          customer_session_token: true,
          "swipe-debug": true,
          view: "compact",
        },
        target: { kind: "allRepositories" },
      }),
    ).toBe("/repo?swipe-debug&view=compact#billing");
  });

  it("keeps the Members section when switching organizations", () => {
    expect(
      buildOrganizationSwitchHref({
        hash: "",
        search: { "swipe-debug": true },
        target: {
          kind: "organization",
          owner: "Target-Org",
          section: "members",
        },
      }),
    ).toBe("/org/Target-Org/settings/members?swipe-debug");
  });
});
