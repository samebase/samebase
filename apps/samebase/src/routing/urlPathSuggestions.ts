import type { AppRouter } from "@/router";
import { FORCE_PROD_UI_QUERY_PARAM } from "@/lib/prodUiMode";
import { readRouteEnvironmentForOrigin, type RouteEnvironment } from "@/routing/availability";
import { normalizeRouteUrlEditorHref } from "@/routing/urlEditor";
import {
  canAccessRouteStaticData,
  type RouteAccessViewer,
  type RouteStaticData,
} from "@/routing/permissions";
import { entries } from "@samebase/dependent/object";

type RouteUrlPathSuggestionsInput = {
  currentHref: string;
  draftHref: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: RouteAccessViewer;
};

/**
 * router.routesByPath is the runtime route truth; pathless layout ids stay out
 * of the URL editor because users cannot navigate to them directly.
 */
export function readRouteUrlPathSuggestions(
  routesByPath: AppRouter["routesByPath"],
  viewer: RouteAccessViewer,
  routeEnvironment: RouteEnvironment,
) {
  return entries(routesByPath)
    .filter(([path, route]) =>
      isRouteUrlPathSuggestion(path, route.options.staticData, viewer, routeEnvironment),
    )
    .map(([path]) => path)
    .sort(compareRouteUrlPathSuggestion);
}

export function filterRouteUrlPathSuggestions({
  currentHref,
  draftHref,
  origin,
  routesByPath,
  viewer,
}: RouteUrlPathSuggestionsInput): readonly string[] {
  const suggestions = readRouteUrlPathSuggestions(
    routesByPath,
    viewer,
    readRouteUrlPathSuggestionEnvironment({
      currentHref,
      draftHref,
      origin,
    }),
  );
  const draftPath = readRouteUrlPathSuggestionDraftPath({
    currentHref,
    draftHref,
    origin,
  });
  if (draftPath === null) {
    return [];
  }

  return suggestions.filter((pathSuggestion) =>
    routePathSuggestionMatchesDraft(pathSuggestion, draftPath),
  );
}

/**
 * True when the current draft path maps to a navigable route that can load as
 * written. Navigability is access plus environment: `pathSuggestion: "hidden"`
 * only keeps a path out of the suggestion dropdown, it never blocks committing
 * a route the viewer can already load by direct URL. Null or partial drafts
 * stay local until no router segment needs to be invented.
 */
export function isRouteUrlPathReadyForNavigation({
  currentHref,
  draftHref,
  origin,
  routesByPath,
  viewer,
}: RouteUrlPathSuggestionsInput): boolean {
  const routeEnvironment = readRouteUrlPathSuggestionEnvironment({
    currentHref,
    draftHref,
    origin,
  });
  const navigablePaths = entries(routesByPath)
    .filter(([path, route]) =>
      isRouteUrlNavigablePath(path, route.options.staticData, viewer, routeEnvironment),
    )
    .map(([path]) => path);
  const draftPath = readRouteUrlPathSuggestionDraftPath({
    currentHref,
    draftHref,
    origin,
  });
  if (draftPath === null) {
    return false;
  }

  return navigablePaths.some((navigablePath) =>
    routePathSuggestionCanLoadDraft(navigablePath, draftPath),
  );
}

function isRouteUrlNavigablePath(
  path: string,
  staticData: RouteStaticData,
  viewer: RouteAccessViewer,
  routeEnvironment: RouteEnvironment,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    // Redirect-only paths never commit: typing toward /landing-preview passes
    // exactly through /landing, and committing that mid-edit draft would
    // bounce the visitor to the redirect target while they are still typing.
    staticData.pathSuggestion !== "redirect" &&
    canAccessRouteStaticData(staticData, viewer, routeEnvironment)
  );
}

function isRouteUrlPathSuggestion(
  path: string,
  staticData: RouteStaticData,
  viewer: RouteAccessViewer,
  routeEnvironment: RouteEnvironment,
): boolean {
  return (
    staticData.pathSuggestion === undefined &&
    isRouteUrlNavigablePath(path, staticData, viewer, routeEnvironment)
  );
}

function compareRouteUrlPathSuggestion(left: string, right: string): number {
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
}

/**
 * Chooses which route set path suggestions should come from.
 *
 * Some routes are local-only, preview-only, or production-only. The origin gives
 * the normal environment for this app instance, while `?prod-ui` in either the
 * current URL or editable draft forces production suggestions so the editor
 * doesn't offer local/preview routes while the page is pretending to be prod.
 */
export function readRouteUrlPathSuggestionEnvironment({
  currentHref,
  draftHref,
  origin,
}: Omit<RouteUrlPathSuggestionsInput, "routesByPath" | "viewer">): RouteEnvironment {
  try {
    const appOrigin = new URL(origin);
    const currentUrl = new URL(currentHref, appOrigin);
    if (currentUrl.searchParams.has(FORCE_PROD_UI_QUERY_PARAM)) {
      return "production";
    }

    const trimmedDraftHref = draftHref.trim();
    if (!trimmedDraftHref) {
      return readRouteEnvironmentForOrigin(origin);
    }

    const routeHref = normalizeRouteUrlEditorHref({
      currentHref,
      origin,
      rawHref: trimmedDraftHref,
    });
    if (routeHref === null) {
      return readRouteEnvironmentForOrigin(origin);
    }

    if (new URL(routeHref, appOrigin).searchParams.has(FORCE_PROD_UI_QUERY_PARAM)) {
      return "production";
    }

    return readRouteEnvironmentForOrigin(origin);
  } catch {
    return "production";
  }
}

function readRouteUrlPathSuggestionDraftPath({
  currentHref,
  draftHref,
  origin,
}: Omit<RouteUrlPathSuggestionsInput, "routesByPath" | "viewer">): string | null {
  const trimmedDraftHref = draftHref.trim();
  if (!trimmedDraftHref) {
    return "/";
  }

  try {
    const appOrigin = new URL(origin);
    if (trimmedDraftHref.startsWith(`${appOrigin.protocol}//`)) {
      const draftUrl = new URL(trimmedDraftHref);
      if (draftUrl.origin !== appOrigin.origin) {
        return null;
      }

      return readRouteUrlPathSuggestionPathname(draftUrl.pathname);
    }

    const routeHref = normalizeRouteUrlEditorHref({
      currentHref,
      origin,
      rawHref: trimmedDraftHref,
    });
    if (routeHref === null) {
      return null;
    }

    return readRouteUrlPathSuggestionPathname(new URL(routeHref, appOrigin).pathname);
  } catch {
    return null;
  }
}

function readRouteUrlPathSuggestionPathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

function routePathSuggestionMatchesDraft(pathSuggestion: string, draftPath: string): boolean {
  if (pathSuggestion.startsWith(draftPath)) {
    return true;
  }

  return routePathTemplateMatchesDraft(pathSuggestion, draftPath);
}

/**
 * Static suggestions require exact path equality; dynamic and catch-all
 * templates must have every required segment before previews can touch router
 * state.
 */
function routePathSuggestionCanLoadDraft(pathSuggestion: string, draftPath: string): boolean {
  if (!pathSuggestion.includes("$")) {
    return pathSuggestion === draftPath;
  }

  return routePathTemplateCanLoadDraft(pathSuggestion, draftPath);
}

function routePathTemplateMatchesDraft(templatePath: string, draftPath: string): boolean {
  if (draftPath === "/") {
    return true;
  }

  // `$` is the shipped catch-all vault route, while `$name` segments are
  // templates that should match concrete partial URL drafts.
  const templateSegments = readRoutePathSegments(templatePath);
  const draftSegments = readRoutePathSegments(draftPath);

  for (const [index, draftSegment] of draftSegments.entries()) {
    const templateSegment = templateSegments[index];
    if (!templateSegment) {
      return false;
    }

    const lastDraftSegment = index === draftSegments.length - 1;
    if (lastDraftSegment && draftSegment === "") {
      return true;
    }

    if (templateSegment === "$" && index === templateSegments.length - 1) {
      return true;
    }

    if (templateSegment.startsWith("$")) {
      continue;
    }

    if (lastDraftSegment && templateSegment.startsWith(draftSegment)) {
      continue;
    }

    if (templateSegment !== draftSegment) {
      return false;
    }
  }

  return true;
}

function routePathTemplateCanLoadDraft(templatePath: string, draftPath: string): boolean {
  const templateSegments = readRoutePathSegments(templatePath);
  const draftSegments = readRoutePathSegments(draftPath);

  for (const [index, templateSegment] of templateSegments.entries()) {
    const draftSegment = draftSegments[index];
    if (!draftSegment) {
      return false;
    }

    if (templateSegment === "$" && index === templateSegments.length - 1) {
      return true;
    }

    if (templateSegment.startsWith("$")) {
      continue;
    }

    if (templateSegment !== draftSegment) {
      return false;
    }
  }

  return draftSegments.length === templateSegments.length;
}

function readRoutePathSegments(path: string): readonly string[] {
  return path.slice(1).split("/");
}
