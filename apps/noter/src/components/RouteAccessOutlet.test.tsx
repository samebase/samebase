// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RouteAccessOutlet } from "./RouteAccessOutlet";

const routeMatchState = vi.hoisted(
  (): {
    matches: Array<{
      staticData: {
        access: string;
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

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="route-outlet">Route outlet</div>,
  useMatches: ({
    select,
  }: {
    select?: (matches: typeof routeMatchState.matches) => unknown;
  } = {}) => (select ? select(routeMatchState.matches) : routeMatchState.matches),
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
    viewerAccessState.queryCalls = 0;
    viewerAccessState.result = { accessKeys: ["access_public"] };
  });

  it("renders public routes without reading viewer access", () => {
    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(markup).not.toContain("authenticated-route-page");
    expect(viewerAccessState.queryCalls).toBe(0);
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
