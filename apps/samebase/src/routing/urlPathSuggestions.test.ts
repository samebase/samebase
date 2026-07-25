import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  filterRouteUrlPathSuggestions,
  isRouteUrlPathReadyForNavigation,
  readRouteUrlPathSuggestions,
} from "./urlPathSuggestions";
import type { RouteAccessViewer } from "@/routing/permissions";
import { ROLE_ACCESS_GRANTS } from "../../shared/accessModel";

const ORIGIN = "http://localhost:5174";
const DEPLOYED_ORIGIN = "https://preview.samebase.com";
const routesByPath = getRouter().routesByPath;
const staffViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_staff,
} as const satisfies RouteAccessViewer;
const memberViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_member,
} as const satisfies RouteAccessViewer;
const anonymousViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_anonymous,
} as const satisfies RouteAccessViewer;
const localEnvironment = "local";
const prodUiEnvironment = "production";
const deployedEnvironment = "preview";

describe("readRouteUrlPathSuggestions", () => {
  it("exposes sorted user-facing TanStack route paths", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, staffViewer, localEnvironment);

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/vault");
    expect(suggestions).toContain("/indexDB");
    expect(suggestions).toContain("/logo/hover/carpet");
    expect(suggestions).toContain("/logo/transition/menger");
    expect(suggestions).toContain("/logo/transition/transforms");
    expect(suggestions).toContain("/visual-fixture");
    expect(suggestions).toContain("/vault/$");
    expect(suggestions).not.toContain("/_public");
    expect(suggestions).not.toContain("/_public/vault");
    expect(suggestions).not.toContain("/docs/do-it-yourself");
    expect(suggestions).not.toContain("/landing-preview");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(new Set(suggestions).size).toBe(suggestions.length);
    expect(suggestions).toEqual(
      [...suggestions].sort((left, right) => {
        if (left === right) {
          return 0;
        }

        if (left === "/") {
          return -1;
        }

        if (right === "/") {
          return 1;
        }

        return left.localeCompare(right);
      }),
    );
  });

  it("filters staff-only route paths for anonymous viewers", () => {
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      anonymousViewer,
      localEnvironment,
    );

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/connect-repo");
    expect(suggestions).not.toContain("/vault");
    expect(suggestions).not.toContain("/indexDB");
    expect(suggestions).not.toContain("/docs/do-it-yourself");
    expect(suggestions).not.toContain("/landing-preview");
    expect(suggestions).not.toContain("/localStorage");
    expect(suggestions).not.toContain("/logo/iso");
    expect(suggestions).not.toContain("/logo/raster");
    expect(suggestions).not.toContain("/logo/svg");
    expect(suggestions).not.toContain("/new-app");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(suggestions).not.toContain("/pitch");
    expect(suggestions).not.toContain("/vault/$");
  });

  it("exposes member route paths from access grants", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, memberViewer, localEnvironment);

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/connect-repo");
    expect(suggestions).toContain("/vault");
    expect(suggestions).toContain("/new-app");
    expect(suggestions).toContain("/providers");
    expect(suggestions).toContain("/vault/$");
    expect(suggestions).not.toContain("/indexDB");
    expect(suggestions).not.toContain("/localStorage");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(suggestions).not.toContain("/pricing");
  });

  it("hides local-only route paths from the prod UI environment", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, staffViewer, prodUiEnvironment);

    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/test");
    expect(suggestions).not.toContain("/visual-fixture");
  });

  it("hides local-only route paths outside local route environments", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, staffViewer, deployedEnvironment);

    expect(suggestions).not.toContain("/test");
    expect(suggestions).not.toContain("/visual-fixture");
  });
});

describe("filterRouteUrlPathSuggestions", () => {
  it("filters static route paths by the typed draft path", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/logo/t",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/logo/transition", "/logo/transition/menger", "/logo/transition/transforms"]);
  });

  it("reads the path from the focused same-origin editor URL", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: `${ORIGIN}/logo/r`,
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/logo/raster", "/logo/raster-seams"]);
  });

  it("filters query and hash drafts against the current route path", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/logo/iso?dark#controls",
        draftHref: "?prod-ui",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/logo/iso"]);

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/logo/transition/menger",
        draftHref: "#thread",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/logo/transition/menger"]);
  });

  it("matches dynamic templates against concrete typed path segments", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/vault/octo/repo/db/main/proj",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/vault/$", "/vault/$owner/$repo/db/$branch/project/$convexProjectId"]);
  });

  it("keeps the catch-all vault route available for file path drafts", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/vault/octo/repo/fs/main/src/App.tsx",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(["/vault/$"]);
  });

  it("returns all paths for an empty draft and rejects external absolute URLs", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/logo",
        draftHref: "  ",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual(readRouteUrlPathSuggestions(routesByPath, staffViewer, localEnvironment));

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "https://example.com/logo",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toEqual([]);
  });

  it("uses the prod UI query as a path suggestion display filter", () => {
    const suggestions = filterRouteUrlPathSuggestions({
      currentHref: "/?prod-ui",
      draftHref: "  ",
      origin: ORIGIN,
      routesByPath,
      viewer: staffViewer,
    });

    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/visual-fixture");
  });

  it("hides local-only route suggestions on deployed origins", () => {
    const suggestions = filterRouteUrlPathSuggestions({
      currentHref: "/",
      draftHref: "/vis",
      origin: DEPLOYED_ORIGIN,
      routesByPath,
      viewer: staffViewer,
    });

    expect(suggestions).toEqual([]);
  });

  it("hides test route suggestions on deployed origins", () => {
    const suggestions = filterRouteUrlPathSuggestions({
      currentHref: "/",
      draftHref: "/test",
      origin: DEPLOYED_ORIGIN,
      routesByPath,
      viewer: staffViewer,
    });

    expect(suggestions).toEqual([]);
  });
});

describe("isRouteUrlPathReadyForNavigation", () => {
  it("accepts exact static route paths and keeps partial path drafts local", () => {
    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/logo?from=route-url-editor",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/lo",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(false);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/logo/",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/logo/iso",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(false);
  });

  it("accepts concrete dynamic and catch-all route paths", () => {
    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/vault/octo/repo/db/main/project/convex-project",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/vault/octo",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/vault/",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);
  });

  it("accepts every visible route path for instant app-shell previews", () => {
    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/logo/iso?from=route-url-editor",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/indexDB",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/localStorage",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/terms/",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/logo/iso/",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/localStorage/",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/vault",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/visual-fixture",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/vault",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(false);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/indexDB",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(false);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/localStorage",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(false);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/vault",
        draftHref: "/logo",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(true);
  });

  it("accepts hidden route paths the viewer can load", () => {
    // pathSuggestion: "hidden" keeps a route out of the dropdown, but direct
    // URL entry loads it, so the editor must commit it too.
    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/landing-preview",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/landing-preview",
        draftHref: "/landing-preview?dark",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(true);

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/docs/the-stack",
        origin: ORIGIN,
        routesByPath,
        viewer: anonymousViewer,
      }),
    ).toBe(true);
  });

  it("keeps redirect-only route paths local", () => {
    // /landing only forwards to /; committing it while someone types toward
    // /landing-preview would tear the editor away mid-draft.
    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/landing",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(false);
  });
});
