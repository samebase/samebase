import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  filterRouteUrlPathSuggestions,
  readRouteUrlPathSuggestions,
} from "./routeUrlPathSuggestions";

const ORIGIN = "https://noter.local";
const routesByPath = getRouter().routesByPath;

describe("readRouteUrlPathSuggestions", () => {
  it("exposes sorted user-facing TanStack route paths", () => {
    const suggestions = readRouteUrlPathSuggestions(routesByPath);

    expect(suggestions).toContain("/");
    expect(suggestions).toContain("/logo/transition/transforms");
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
});

describe("filterRouteUrlPathSuggestions", () => {
  it("filters static route paths by the typed draft path", () => {
    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "/logo/t",
        origin: ORIGIN,
        routesByPath,
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
      }),
    ).toEqual(["/logo/iso"]);

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/research/codex-app-server/browser",
        draftHref: "#thread",
        origin: ORIGIN,
        routesByPath,
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
      }),
    ).toEqual(readRouteUrlPathSuggestions(routesByPath));

    expect(
      filterRouteUrlPathSuggestions({
        currentHref: "/",
        draftHref: "https://example.com/logo",
        origin: ORIGIN,
        routesByPath,
      }),
    ).toEqual([]);
  });
});
