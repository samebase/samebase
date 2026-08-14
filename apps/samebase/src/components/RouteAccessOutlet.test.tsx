// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  RouteAccess,
  RouteSearchParamAccess,
  RouteSearchParamSuggestion,
} from "@/routing/permissions";
import { RouteAccessOutlet } from "./RouteAccessOutlet";

const routeMatchState = vi.hoisted(
  (): {
    matches: Array<{
      staticData: {
        access: RouteAccess;
        searchParamAccess?: RouteSearchParamAccess[];
        searchParamSuggestions?: RouteSearchParamSuggestion[];
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
          role?: "role_anonymous" | "role_deleting" | "role_member" | "role_pending_access";
        }
      | undefined;
  } => ({
    queryCalls: 0,
    result: { accessKeys: ["access_public"] },
  }),
);

const authState = vi.hoisted(() => ({ isLoading: false }));

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
    navigateCalls: Array<{
      href: string;
      replace: boolean;
    }>;
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
    navigate: ({ href, replace }: { href: string; replace: boolean }) => {
      routerState.navigateCalls.push({ href, replace });
    },
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => authState,
  useQuery: (_reference: unknown, args?: unknown) => {
    viewerAccessState.queryCalls += 1;
    return args === "skip" ? undefined : viewerAccessState.result;
  },
}));

vi.mock("@/components/NotFoundRoutePage", () => ({
  NotFoundRoutePage: () => <div data-testid="not-found-route">Not found route</div>,
}));

async function renderRouteAccessOutletAfterEffects() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(<RouteAccessOutlet />);
  });

  const markup = rootElement.innerHTML;
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
  return markup;
}

describe("RouteAccessOutlet", () => {
  beforeEach(() => {
    routeMatchState.matches = [{ staticData: { access: "access_public" } }];
    locationState.hash = "";
    locationState.pathname = "/";
    locationState.searchStr = "";
    routerState.navigateCalls = [];
    authState.isLoading = false;
    viewerAccessState.queryCalls = 0;
    viewerAccessState.result = { accessKeys: ["access_public"] };
  });

  it("renders public routes without reading viewer access", () => {
    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
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

  it("replaces unauthorized search params once and renders the canonical URL", async () => {
    locationState.searchStr = "?delete&prod-ui";

    const strippedMarkup = await renderRouteAccessOutletAfterEffects();

    expect(strippedMarkup).toBe("");
    expect(routerState.navigateCalls).toEqual([{ href: "/?prod-ui", replace: true }]);

    routerState.navigateCalls = [];
    locationState.searchStr = "?prod-ui";

    const canonicalMarkup = await renderRouteAccessOutletAfterEffects();

    expect(canonicalMarkup).toContain("Route outlet");
    expect(routerState.navigateCalls).toEqual([]);
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

  it("renders app-create routes when the viewer has app-create access", () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_app_create" } },
    ];
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_app_create"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(markup).not.toContain("not-found-route");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("renders Settings for a pending-access viewer", () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_user_preferences" } },
    ];
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_user_preferences"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Route outlet");
    expect(markup).not.toContain("not-found-route");
    expect(viewerAccessState.queryCalls).toBe(1);
  });

  it("keeps the Settings checkout return while persisted auth restores", async () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      {
        staticData: {
          access: "access_user_preferences",
          searchParamAccess: [{ access: "access_user_preferences", key: "checkout" }],
        },
      },
    ];
    locationState.pathname = "/settings";
    locationState.searchStr = "?checkout=success";
    authState.isLoading = true;
    viewerAccessState.result = {
      accessKeys: ["access_public"],
      role: "role_anonymous",
    };

    const loadingMarkup = await renderRouteAccessOutletAfterEffects();

    expect(loadingMarkup).toBe("");
    expect(routerState.navigateCalls).toEqual([]);

    authState.isLoading = false;
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_user_preferences"],
      role: "role_member",
    };

    const restoredMarkup = await renderRouteAccessOutletAfterEffects();

    expect(restoredMarkup).toContain("Route outlet");
    expect(routerState.navigateCalls).toEqual([]);
  });

  it("removes the Settings checkout return after auth restores an anonymous viewer", async () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      {
        staticData: {
          access: "access_user_preferences",
          searchParamAccess: [{ access: "access_user_preferences", key: "checkout" }],
        },
      },
    ];
    locationState.pathname = "/settings";
    locationState.searchStr = "?checkout=success";
    authState.isLoading = true;

    const loadingMarkup = await renderRouteAccessOutletAfterEffects();

    expect(loadingMarkup).toBe("");
    expect(routerState.navigateCalls).toEqual([]);

    authState.isLoading = false;
    viewerAccessState.result = {
      accessKeys: ["access_public"],
      role: "role_anonymous",
    };

    const anonymousMarkup = await renderRouteAccessOutletAfterEffects();

    expect(anonymousMarkup).toBe("");
    expect(routerState.navigateCalls).toEqual([{ href: "/settings", replace: true }]);
  });

  it("renders not found directly for denied non-public routes", () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_dashboard" } },
    ];
    viewerAccessState.result = {
      accessKeys: ["access_public"],
    };

    const markup = renderToStaticMarkup(<RouteAccessOutlet />);

    expect(markup).toContain("Not found route");
    expect(markup).not.toContain("Route outlet");
  });

  it("suppresses denied routes without competing with the deleting-viewer redirect", async () => {
    routeMatchState.matches = [
      { staticData: { access: "access_public" } },
      { staticData: { access: "access_user_preferences" } },
    ];
    locationState.pathname = "/settings";
    locationState.searchStr = "?delete-account";
    viewerAccessState.result = {
      accessKeys: ["access_public", "access_account_deletion"],
      role: "role_deleting",
    };

    const markup = await renderRouteAccessOutletAfterEffects();

    expect(markup).toBe("");
    expect(markup).not.toContain("Not found route");
    expect(routerState.navigateCalls).toEqual([]);
  });
});
