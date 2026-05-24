import type { AppRouter } from "@/router";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import {
  canAccessNoterRoutePermission,
  type NoterRoutePermission,
  type NoterRoutePermissionViewer,
} from "@/lib/routePermissions";

type RouteUrlPathSuggestionsInput = {
  currentHref: string;
  draftHref: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
};

/**
 * router.routesByPath is the runtime route truth; pathless layout ids stay out
 * of the URL editor because users cannot navigate to them directly.
 */
export function readRouteUrlPathSuggestions(
  routesByPath: AppRouter["routesByPath"],
  viewer: NoterRoutePermissionViewer,
): readonly string[] {
  return Object.entries(routesByPath)
    .filter(([path, route]) =>
      isRouteUrlPathSuggestion(path, route.options.staticData.permission, viewer),
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
  const suggestions = readRouteUrlPathSuggestions(routesByPath, viewer);
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

function isRouteUrlPathSuggestion(
  path: string,
  permission: NoterRoutePermission,
  viewer: NoterRoutePermissionViewer,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    canAccessNoterRoutePermission(permission, viewer)
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

      return draftUrl.pathname;
    }

    const routeHref = normalizeRouteUrlEditorHref({
      currentHref,
      origin,
      rawHref: trimmedDraftHref,
    });
    if (routeHref === null) {
      return null;
    }

    return new URL(routeHref, appOrigin).pathname;
  } catch {
    return null;
  }
}

function routePathSuggestionMatchesDraft(pathSuggestion: string, draftPath: string): boolean {
  if (pathSuggestion.startsWith(draftPath)) {
    return true;
  }

  return routePathTemplateMatchesDraft(pathSuggestion, draftPath);
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

function readRoutePathSegments(path: string): readonly string[] {
  return path.slice(1).split("/");
}
