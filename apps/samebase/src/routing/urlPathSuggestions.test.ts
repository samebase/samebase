import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  isRouteUrlPathReadyForNavigation,
  readRouteUrlPathSuggestions,
} from "./urlPathSuggestions";
import type { RouteAccessViewer } from "@/routing/permissions";
import { ROLE_ACCESS_GRANTS } from "../../shared/accessModel";

const ORIGIN = "http://localhost:5174";
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
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      staffViewer,
      localEnvironment,
      false,
    );

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/vault");
    expect(suggestions).toContain("/indexDB");
    expect(suggestions).not.toContain("/logo/hover/carpet");
    expect(suggestions).not.toContain("/logo/hover/menger");
    expect(suggestions).not.toContain("/logo/transition/menger");
    expect(suggestions).not.toContain("/logo/transition/transforms");
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

  it("exposes public developer paths only when requested", () => {
    const standardSuggestions = readRouteUrlPathSuggestions(
      routesByPath,
      staffViewer,
      localEnvironment,
      false,
    );
    const developerSuggestions = readRouteUrlPathSuggestions(
      routesByPath,
      staffViewer,
      localEnvironment,
      true,
    );
    const anonymousDeveloperSuggestions = readRouteUrlPathSuggestions(
      routesByPath,
      anonymousViewer,
      localEnvironment,
      true,
    );
    const memberDeveloperSuggestions = readRouteUrlPathSuggestions(
      routesByPath,
      memberViewer,
      localEnvironment,
      true,
    );

    expect(standardSuggestions).not.toContain("/logo/iso");
    expect(developerSuggestions).toContain("/logo/hover/carpet");
    expect(developerSuggestions).toContain("/logo/hover/menger");
    expect(developerSuggestions).toContain("/logo/iso");
    expect(developerSuggestions).toContain("/logo/transition/transforms");
    expect(anonymousDeveloperSuggestions).toContain("/logo/iso");
    expect(memberDeveloperSuggestions).toContain("/logo/iso");
  });

  it("filters restricted paths for anonymous viewers", () => {
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      anonymousViewer,
      localEnvironment,
      true,
    );

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/org/$owner/connect-repo");
    expect(suggestions).not.toContain("/vault");
    expect(suggestions).not.toContain("/indexDB");
    expect(suggestions).not.toContain("/docs/do-it-yourself");
    expect(suggestions).not.toContain("/landing-preview");
    expect(suggestions).not.toContain("/localStorage");
    expect(suggestions).toContain("/logo/hover/carpet");
    expect(suggestions).toContain("/logo/hover/menger");
    expect(suggestions).toContain("/logo/iso");
    expect(suggestions).toContain("/logo/raster");
    expect(suggestions).toContain("/logo/raster-seams");
    expect(suggestions).toContain("/logo/single-cube");
    expect(suggestions).toContain("/logo/svg");
    expect(suggestions).toContain("/logo/transition");
    expect(suggestions).toContain("/logo/transition/menger");
    expect(suggestions).toContain("/logo/transition/transforms");
    expect(suggestions).not.toContain("/org/$owner/new-app");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(suggestions).not.toContain("/pitch");
    expect(suggestions).not.toContain("/vault/$");
  });

  it("exposes member route paths from access grants", () => {
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      memberViewer,
      localEnvironment,
      true,
    );

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/org/$owner/connect-repo");
    expect(suggestions).toContain("/org/$owner/vaults");
    expect(suggestions).toContain("/vault");
    expect(suggestions).toContain("/org/$owner/new-app");
    expect(suggestions).toContain("/org/$owner/providers");
    expect(suggestions).toContain("/org/$owner/settings");
    expect(suggestions).toContain("/org/$owner/settings/billing");
    expect(suggestions).toContain("/settings/mcp");
    expect(suggestions).toContain("/logo/iso");
    expect(suggestions).toContain("/logo/raster");
    expect(suggestions).toContain("/logo/svg");
    expect(suggestions).toContain("/vault/$owner/$repo");
    expect(suggestions).not.toContain("/vault/$");
    expect(suggestions).not.toContain("/indexDB");
    expect(suggestions).not.toContain("/localStorage");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(suggestions).not.toContain("/pricing");
  });

  it("hides local-only route paths from the prod UI environment", () => {
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      staffViewer,
      prodUiEnvironment,
      false,
    );

    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/test");
    expect(suggestions).not.toContain("/visual-fixture");
  });

  it("hides local-only route paths outside local route environments", () => {
    const suggestions = readRouteUrlPathSuggestions(
      routesByPath,
      staffViewer,
      deployedEnvironment,
      false,
    );

    expect(suggestions).not.toContain("/test");
    expect(suggestions).not.toContain("/visual-fixture");
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
    ).toBe(true);
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

    expect(
      isRouteUrlPathReadyForNavigation({
        currentHref: "/",
        draftHref: "/unknown/octo/repo",
        origin: ORIGIN,
        routesByPath,
        viewer: staffViewer,
      }),
    ).toBe(false);
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
