import { describe, expect, it } from "vite-plus/test";
import {
  readRouteSearchAccessCanonicalRouteAddress,
  routeSearchNeedsViewerAccess,
} from "./routeSearchAccess";
import { MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA } from "./authenticatedRouteSearch";

const publicViewer = { accessKeys: ["access_public"] } as const;
const dashboardViewer = {
  accessKeys: ["access_public", "access_dashboard"],
} as const;

const publicMatches = [
  {
    staticData: {
      access: "access_public",
    },
  },
] as const;

describe("routeSearchAccess", () => {
  it("does not require viewer access for public search params", () => {
    expect(
      routeSearchNeedsViewerAccess({
        matches: publicMatches,
        searchStr: "?prod-ui&primary=red-600",
      }),
    ).toBe(false);
  });

  it("requires viewer access for non-public root search params", () => {
    expect(
      routeSearchNeedsViewerAccess({
        matches: publicMatches,
        searchStr: "?delete&prod-ui",
      }),
    ).toBe(true);
  });

  it("requires viewer access for hidden route-owned search params", () => {
    expect(
      routeSearchNeedsViewerAccess({
        matches: [
          {
            staticData: {
              access: "access_public",
              searchParamAccess: [
                {
                  access: "access_admin",
                  key: "staffOnly",
                },
              ],
            },
          },
        ],
        searchStr: "?staffOnly&prod-ui",
      }),
    ).toBe(true);
  });

  it("removes unauthorized root search params and keeps allowed params", () => {
    expect(
      readRouteSearchAccessCanonicalRouteAddress({
        location: {
          hash: "top",
          pathname: "/",
          searchStr: "?delete&prod-ui&primary=red-600",
        },
        matches: publicMatches,
        viewer: publicViewer,
      }),
    ).toBe("/?prod-ui&primary=red-600#top");
  });

  it("keeps restricted search params when the viewer has access", () => {
    expect(
      readRouteSearchAccessCanonicalRouteAddress({
        location: {
          hash: "",
          pathname: "/",
          searchStr: "?delete&prod-ui",
        },
        matches: publicMatches,
        viewer: dashboardViewer,
      }),
    ).toBeNull();
  });

  it("keeps public MCP consent entry params for signed-out viewers", () => {
    const matches = [
      {
        staticData: {
          access: "access_public",
          ...MCP_CONSENT_ROUTE_SEARCH_STATIC_DATA,
        },
      },
    ] as const;

    expect(
      routeSearchNeedsViewerAccess({
        matches,
        searchStr: "?mcp_consent_request=mcpar_test&mcp_login_required=1",
      }),
    ).toBe(false);
    expect(
      readRouteSearchAccessCanonicalRouteAddress({
        location: {
          hash: "",
          pathname: "/oauth/mcp/consent",
          searchStr: "?mcp_consent_request=mcpar_test&mcp_login_required=1",
        },
        matches,
        viewer: publicViewer,
      }),
    ).toBeNull();
  });

  it("removes unauthorized route-owned search params that are hidden from suggestions", () => {
    expect(
      readRouteSearchAccessCanonicalRouteAddress({
        location: {
          hash: "",
          pathname: "/custom",
          searchStr: "?staffOnly&prod-ui",
        },
        matches: [
          {
            staticData: {
              access: "access_public",
              searchParamAccess: [
                {
                  access: "access_admin",
                  key: "staffOnly",
                },
              ],
            },
          },
        ],
        viewer: publicViewer,
      }),
    ).toBe("/custom?prod-ui");
  });
});
