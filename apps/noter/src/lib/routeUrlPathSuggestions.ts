import type { AppRouter } from "@/router";
import { FORCE_PROD_UI_QUERY_PARAM } from "@/lib/prodUiMode";
import { isPublicLayoutShellPathname } from "@/lib/publicLayoutPaths";
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

type RouteUrlPathSuggestionSurface = {
  prodUiMode: boolean;
};

const PROD_UI_HIDDEN_ROUTE_URL_PATH_SUGGESTIONS = ["/test", "/visual-fixture"] as const;

/**
 * router.routesByPath is the runtime route truth; pathless layout ids stay out
 * of the URL editor because users cannot navigate to them directly.
 */
export function readRouteUrlPathSuggestions(
  routesByPath: AppRouter["routesByPath"],
  viewer: NoterRoutePermissionViewer,
  surface: RouteUrlPathSuggestionSurface,
): readonly string[] {
  return Object.entries(routesByPath)
    .filter(([path, route]) =>
      isRouteUrlPathSuggestion(path, route.options.staticData.permission, viewer, surface),
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
  const suggestions = readRouteUrlPathSuggestions(routesByPath, viewer, {
    prodUiMode: readRouteUrlPathSuggestionProdUiMode({
      currentHref,
      draftHref,
      origin,
    }),
  });
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

export function isRouteUrlPathReadyForNavigation({
  currentHref,
  draftHref,
  origin,
  routesByPath,
  viewer,
}: RouteUrlPathSuggestionsInput): boolean {
  const suggestions = readRouteUrlPathSuggestions(routesByPath, viewer, {
    prodUiMode: readRouteUrlPathSuggestionProdUiMode({
      currentHref,
      draftHref,
      origin,
    }),
  });
  const draftPath = readRouteUrlPathSuggestionDraftPath({
    currentHref,
    draftHref,
    origin,
  });
  if (draftPath === null) {
    return false;
  }

  return suggestions.some((pathSuggestion) =>
    routePathSuggestionCanLoadDraft(pathSuggestion, draftPath),
  );
}

/**
 * True only for route previews that can stay inside the shared public shell.
 * Wider app-shell previews wait for the larger layout extraction so the focused
 * URL input is not remounted mid-edit.
 */
export function isPublicLayoutRouteUrlPathReadyForNavigation(
  input: RouteUrlPathSuggestionsInput,
): boolean {
  const draftPath = readRouteUrlPathSuggestionDraftPath(input);
  if (draftPath === null || !isPublicLayoutShellPathname(draftPath)) {
    return false;
  }

  return isRouteUrlPathReadyForNavigation(input);
}

function isRouteUrlPathSuggestion(
  path: string,
  permission: NoterRoutePermission,
  viewer: NoterRoutePermissionViewer,
  surface: RouteUrlPathSuggestionSurface,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    !isRouteUrlPathSuggestionHiddenForSurface(path, surface) &&
    canAccessNoterRoutePermission(permission, viewer)
  );
}

function isRouteUrlPathSuggestionHiddenForSurface(
  path: string,
  surface: RouteUrlPathSuggestionSurface,
): boolean {
  return (
    surface.prodUiMode &&
    PROD_UI_HIDDEN_ROUTE_URL_PATH_SUGGESTIONS.some((hiddenPath) => hiddenPath === path)
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

function readRouteUrlPathSuggestionProdUiMode({
  currentHref,
  draftHref,
  origin,
}: Omit<RouteUrlPathSuggestionsInput, "routesByPath" | "viewer">): boolean {
  try {
    const appOrigin = new URL(origin);
    const currentUrl = new URL(currentHref, appOrigin);
    if (currentUrl.searchParams.has(FORCE_PROD_UI_QUERY_PARAM)) {
      return true;
    }

    const trimmedDraftHref = draftHref.trim();
    if (!trimmedDraftHref) {
      return false;
    }

    const routeHref = normalizeRouteUrlEditorHref({
      currentHref,
      origin,
      rawHref: trimmedDraftHref,
    });
    if (routeHref === null) {
      return false;
    }

    return new URL(routeHref, appOrigin).searchParams.has(FORCE_PROD_UI_QUERY_PARAM);
  } catch {
    return false;
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
