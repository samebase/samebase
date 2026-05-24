import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  filterRouteUrlPathSuggestions,
  readRouteUrlPathSuggestions,
} from "./routeUrlPathSuggestions";

const ORIGIN = "https://noter.local";
const routesByPath = getRouter().routesByPath;
const adminViewer = { isAdmin: true };
const publicViewer = { isAdmin: false };
const appSurface = { prodUiMode: false };
const prodUiSurface = { prodUiMode: true };

describe("readRouteUrlPathSuggestions", () => {
  it("exposes sorted user-facing TanStack route paths", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, adminViewer, appSurface);

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/dashboard");
    expect(suggestions).toContain("/logo/transition/transforms");
    expect(suggestions).toContain("/visual-fixture");
    expect(suggestions).toContain("/vault/$");
    expect(suggestions).toContain("/vault/$owner/$repo/codespace/$branch/chat");
    expect(suggestions).not.toContain("/_public");
    expect(suggestions).not.toContain("/_public/home");
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

  it("filters admin route paths for public viewers", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, publicViewer, appSurface);

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/add");
    expect(suggestions).not.toContain("/dashboard");
    expect(suggestions).not.toContain("/landing-preview");
    expect(suggestions).not.toContain("/oauth/mcp/consent");
    expect(suggestions).not.toContain("/pitch");
    expect(suggestions).not.toContain("/research/codex-app-server");
    expect(suggestions).not.toContain("/vault/$");
  });

  it("hides local-only route paths from the prod UI surface", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath, adminViewer, prodUiSurface);

    expect(suggestions).toContain("/logo");
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
        viewer: adminViewer,
      }),
    ).toEqual(["/logo/transition", "/logo/transition/transforms"]);
  });

  it("reads the path from the focused same-origin editor URL", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "https://noter.local/machines/c",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
      }),
    ).toEqual(["/machines/connect"]);
  });

  it("filters query and hash drafts against the current route path", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/logo/iso?dark#controls",
        draftHref: "?prod-ui",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
      }),
    ).toEqual(["/logo/iso"]);

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/research/codex-app-server/browser",
        draftHref: "#thread",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
      }),
    ).toEqual(["/research/codex-app-server/browser"]);
  });

  it("matches dynamic templates against concrete typed path segments", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/vault/octo/repo/codespace/main/ch",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
      }),
    ).toEqual(["/vault/$", "/vault/$owner/$repo/codespace/$branch/chat"]);
  });

  it("keeps the catch-all vault route available for file path drafts", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/vault/octo/repo/main/src/App.tsx",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
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
        viewer: adminViewer,
      }),
    ).toEqual(readRouteUrlPathSuggestions(routesByPath, adminViewer, appSurface));

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "https://example.com/logo",
        origin: ORIGIN,
        routesByPath,
        viewer: adminViewer,
      }),
    ).toEqual([]);
  });

  it("uses the prod UI query as a path suggestion display filter", () => {
    const suggestions = filterRouteUrlPathSuggestions({
      currentHref: "/?prod-ui",
      draftHref: "  ",
      origin: ORIGIN,
      routesByPath,
      viewer: adminViewer,
    });

    expect(suggestions).toContain("/logo");
    expect(suggestions).not.toContain("/visual-fixture");
  });
});
