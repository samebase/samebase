import type { AppRouter } from "@/router";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";

type RouteUrlPathSuggestionsInput = {
  currentHref: string;
  draftHref: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
};

/**
 * router.routesByPath is the runtime route truth; pathless layout ids stay out
 * of the URL editor because users cannot navigate to them directly.
 */
export function readRouteUrlPathSuggestions(
  routesByPath: AppRouter["routesByPath"],
): readonly string[] {
  return Object.keys(routesByPath)
    .filter(isRouteUrlPathSuggestion)
    .sort(compareRouteUrlPathSuggestion);
}

export function filterRouteUrlPathSuggestions({
  currentHref,
  draftHref,
  origin,
  routesByPath,
}: RouteUrlPathSuggestionsInput): readonly string[] {
  const suggestions = readRouteUrlPathSuggestions(routesByPath);
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

function isRouteUrlPathSuggestion(path: string): boolean {
  return path === "/" || (path.startsWith("/") && !path.startsWith("/_"));
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
}: Omit<RouteUrlPathSuggestionsInput, "routesByPath">): string | null {
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
