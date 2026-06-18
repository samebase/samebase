// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NoterRouteAccess, NoterRouteSearchParamSuggestion } from "@/lib/routePermissions";
import { RouteAccessOutlet } from "./RouteAccessOutlet";

const routeMatchState = vi.hoisted(
  (): {
    matches: Array<{
      staticData: {
        access: NoterRouteAccess;
        searchParamSuggestions?: NoterRouteSearchParamSuggestion[];
      };
    }>;
  } => ({
    matches: [{ staticData: { access: "access_public" } }],
  }),
);

const viewerAccessState = vi.hoisted(
  (): {
    queryCalls: number;
    result:
      | {
          accessKeys: string[];
        }
      | undefined;
  } => ({
    queryCalls: 0,
    result: { accessKeys: ["access_public"] },
  }),
);

const locationState = vi.hoisted(
  (): {
    hash: string;
    pathname: string;
    searchStr: string;
  } => ({
    hash: "",
    pathname: "/",
    searchStr: "",
  }),
);

const routerState = vi.hoisted(
  (): {
    navigateCalls: string[];
  } => ({
    navigateCalls: [],
  }),
);

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="route-outlet">Route outlet</div>,
  useLocation: () => locationState,
  useMatches: ({
    select,
  }: {
    select?: (matches: typeof routeMatchState.matches) => unknown;
  } = {}) => (select ? select(routeMatchState.matches) : routeMatchState.matches),
  useRouter: () => ({
    navigate: ({ href }: { href: string }) => {
      routerState.navigateCalls.push(href);
    },
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: (..._args: unknown[]) => {
    viewerAccessState.queryCalls += 1;
    return viewerAccessState.result;
  },
}));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: ReactNode }) => (
    <div data-testid="authenticated-route-page">{children}</div>
  ),
}));

vi.mock("@/components/NotFoundRoutePage", () => ({
  NotFoundRoutePage: () => <div data-testid="not-found-route">Not found route</div>,
}));

describe("RouteAccessOutlet", () => {
  beforeEach(() => {
    routeMatchState.matches = [{ staticData: { access: "access_public" } }];
    locationState.hash = "";
    locationState.pathname = "/";
    locationState.searchStr = "";
    routerState.navigateCalls = [];
    viewerAccessState.queryCalls = 0;
    viewerAccessState.result = { accessKeys: ["access_public"] };
  });

  it("renders public routes without reading viewer access", () => {
    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(markup).not.toContain("authenticated-route-page");
    expect(viewerAccessState.queryCalls).toBe(0);
  });

  it("renders public routes with public search params without reading viewer access", () => {
    locationState.searchStr = "?prod-ui";

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(viewerAccessState.queryCalls).toBe(0);
  });

  it("waits for cleanup when a public route has an unauthorized search param", () => {
    locationState.searchStr = "?delete&prod-ui";

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toBe("");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("renders public routes with restricted search params when the viewer has access", () => {
    locationState.searchStr = "?delete&prod-ui";
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_dashboard"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("renders dashboard routes when the viewer has dashboard access", () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_dashboard" } },
    ];
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_dashboard"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(markup).not.toContain("not-found-route");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("uses the authenticated route shell for denied non-public routes", () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_dashboard" } },
    ];
    viewerAccessState.result = {
      accessKeys: ["access_public"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("authenticated-route-page");
    expect(markup).toContain("Not found route");
    expect(markup).not.toContain("Route outlet");
  });
});
