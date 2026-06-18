import { describe, expect, it } from "vite-plus/test";
import {
  readRouteSearchAccessCanonicalRouteAddress,
  routeSearchNeedsViewerAccess,
} from "./routeSearchAccess";

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

  it("removes unauthorized route-owned search params", () => {
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
              searchParamSuggestions: [
                {
                  access: "access_admin",
                  key: "staffOnly",
                  searchParamKind: "presence",
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
