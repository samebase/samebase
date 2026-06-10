import { entries } from "@noter-md/dependent/object";
import type { AppRouter } from "@/router";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import {
  isRouteUrlPathReadyForNavigation,
  readRouteUrlPathSuggestionSurface,
} from "@/lib/routeUrlPathSuggestions";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
  clearConflictingRootThemeModeSearch,
  isRootRouteOwnedSearchKey,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";
import {
  canAccessNoterRoutePermission,
  canAccessNoterRouteStaticData,
  type NoterRoutePermissionViewer,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestion,
  type NoterRouteStaticData,
} from "@/lib/routePermissions";
import {
  parseRouteAddress,
  readRouteAddressSearchTokenText,
  type RouteAddressSearchToken,
} from "@/lib/routeAddressParts";
import { type NoterRouteSurface } from "@/lib/routeAvailability";

type RouteAddressReadinessInput = {
  currentRouteAddress: string;
  draftRouteAddress: string;
  origin: string;
  readCanonicalRouteAddress?: (routeAddress: string) => string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
};

type RouteAddressRouteUpdateDraftInput = {
  currentRouteAddress: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
};

type RouteAddressSearchTokenView = {
  hasValueSeparator: boolean;
  key: string;
  routeToken: RouteAddressSearchToken;
  value: string;
};

/**
Result returned by `readRouteAddressReadiness`.

`local` = keep `draftRouteAddress` inside the editor and do not replace the router route.

`readyExact` = replace the router route with `routeAddress`; the draft already loads as-is.

`readyNormalized` = replace the router route with `routeAddress`, but keep the editor draft as typed.
*/
export type RouteAddressReadiness =
  | {
      kind: "local";
      reason: "draftNotReady" | "invalidRouteAddress" | "pathNotReady" | "sameRoute";
    }
  | {
      kind: "readyExact";
      routeAddress: string;
    }
  | {
      kind: "readyNormalized";
      routeAddress: string;
    };

function readCanonicalRouteAddress(routeAddress: string, origin: string): string {
  const url = new URL(routeAddress, origin);
  const parsedSearch = parseTanStackSearch(url.search);
  const rootSearch = validateRootRouteSearch(parsedSearch);

  if (rootSearch.reset) {
    return buildPathWithTanStackSearch({
      pathname: url.pathname,
      hash: url.hash,
    });
  }

  const search = { ...parsedSearch };
  for (const key of Object.keys(search)) {
    if (isRootRouteOwnedSearchKey(key)) {
      delete search[key];
    }
  }

  return buildPathWithTanStackSearch({
    pathname: url.pathname,
    search: {
      ...search,
      ...clearConflictingRootThemeModeSearch(rootSearch),
    },
    hash: url.hash,
  });
}

function readRouteAddressRouteUpdateDraft(args: RouteAddressRouteUpdateDraftInput): string {
  const parts = parseRouteAddress(args.draftRouteAddress);
  if (parts.search === null) {
    return args.draftRouteAddress;
  }

  const searchParamSuggestions = readRouteAddressSearchParamSuggestions(args);
  const routeUpdateSearchTokens = readRouteAddressSearchTokens(args.draftRouteAddress)
    .filter((token) => isRouteAddressSearchTokenReady(token, searchParamSuggestions))
    .map((token) => readRouteAddressSearchTokenText(args.draftRouteAddress, token.routeToken))
    .filter((tokenText) => tokenText.length > 0);
  const search = routeUpdateSearchTokens.length > 0 ? `?${routeUpdateSearchTokens.join("&")}` : "";
  const hash = parts.hash?.suffix ?? "";

  return `${parts.path}${search}${hash}`;
}

function isRouteAddressSearchTokenReady(
  token: RouteAddressSearchTokenView,
  suggestions: readonly NoterRouteSearchParamSuggestion[],
): boolean {
  const suggestion = suggestions.find((value) => value.key === token.key);
  if (!token.hasValueSeparator) {
    if (suggestion?.searchParamKind === "presence") {
      return true;
    }

    return !(
      suggestion?.searchParamKind === "value" ||
      (token.key.length > 0 && suggestions.some((value) => value.key.startsWith(token.key)))
    );
  }

  if (!suggestion || suggestion.searchParamKind === "presence") {
    return true;
  }

  if (token.value.length === 0) {
    return false;
  }

  const valueSuggestions = readRouteAddressValueSuggestions(suggestion);
  return valueSuggestions.length === 0 || valueSuggestions.includes(token.value);
}

function readRouteAddressValueSuggestions(
  suggestion: NoterRouteSearchParamValueSuggestion,
): readonly string[] {
  switch (suggestion.valueType) {
    case "completion":
    case "numeric-options":
    case "options":
      return suggestion.valueSuggestions;
    case "manual":
    case "numeric":
    case "freeform":
      return [];
  }
}

function readRouteAddressSearchParamSuggestions(
  args: RouteAddressRouteUpdateDraftInput,
): readonly NoterRouteSearchParamSuggestion[] {
  const parts = parseRouteAddress(args.draftRouteAddress);
  const routeSearchParamSuggestions = readMatchingRouteSearchParamSuggestions({
    path: parts.path,
    routeSurface: readRouteUrlPathSuggestionSurface({
      currentHref: args.currentRouteAddress,
      draftHref: args.draftRouteAddress,
      origin: args.origin,
    }),
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });

  return uniqueRouteSearchParamSuggestions([
    ...readAccessibleRouteSearchParamSuggestions(routeSearchParamSuggestions, args.viewer),
    ...readAccessibleRouteSearchParamSuggestions(
      ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
      args.viewer,
    ),
  ]).sort(compareRouteSearchParamSuggestions);
}

function readAccessibleRouteSearchParamSuggestions(
  suggestions: readonly NoterRouteSearchParamSuggestion[],
  viewer: NoterRoutePermissionViewer,
): NoterRouteSearchParamSuggestion[] {
  return suggestions.filter((suggestion) =>
    canAccessNoterRoutePermission(suggestion.permission, viewer),
  );
}

function compareRouteSearchParamSuggestions(
  left: NoterRouteSearchParamSuggestion,
  right: NoterRouteSearchParamSuggestion,
): number {
  return left.key.localeCompare(right.key);
}

function uniqueRouteSearchParamSuggestions(
  values: readonly NoterRouteSearchParamSuggestion[],
): NoterRouteSearchParamSuggestion[] {
  const keys = new Set<string>();
  const uniqueValues: NoterRouteSearchParamSuggestion[] = [];

  for (const value of values) {
    if (keys.has(value.key)) {
      continue;
    }

    keys.add(value.key);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

function readMatchingRouteSearchParamSuggestions(args: {
  path: string;
  routeSurface: NoterRouteSurface;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRoutePermissionViewer;
}): readonly NoterRouteSearchParamSuggestion[] {
  const matches = entries(args.routesByPath)
    .filter(
      ([routePath, route]) =>
        isUserFacingAccessibleRoute(
          routePath,
          route.options.staticData,
          args.viewer,
          args.routeSurface,
        ) && routePathTemplateMatchesPath(routePath, args.path),
    )
    .map(([routePath, route]) => ({
      routePath,
      searchParamSuggestions: route.options.staticData.searchParamSuggestions ?? [],
    }))
    .sort((left, right) => compareRoutePathSpecificity(left.routePath, right.routePath));

  return matches[0]?.searchParamSuggestions ?? [];
}

function isUserFacingAccessibleRoute(
  path: string,
  staticData: NoterRouteStaticData,
  viewer: NoterRoutePermissionViewer,
  routeSurface: NoterRouteSurface,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    canAccessNoterRouteStaticData(staticData, viewer, routeSurface)
  );
}

function routePathTemplateMatchesPath(templatePath: string, path: string): boolean {
  if (templatePath === "/") {
    return path === "/";
  }

  const templateSegments = readRoutePathSegments(templatePath);
  const pathSegments = readRoutePathSegments(path);

  for (const [index, templateSegment] of templateSegments.entries()) {
    const pathSegment = pathSegments[index];
    if (templateSegment === "$" && index === templateSegments.length - 1) {
      return typeof pathSegment === "string";
    }

    if (typeof pathSegment !== "string" || pathSegment.length === 0) {
      return false;
    }

    if (templateSegment.startsWith("$")) {
      continue;
    }

    if (templateSegment !== pathSegment) {
      return false;
    }
  }

  return templateSegments.length === pathSegments.length;
}

function compareRoutePathSpecificity(left: string, right: string): number {
  return readRoutePathSpecificity(right) - readRoutePathSpecificity(left);
}

function readRoutePathSpecificity(path: string): number {
  return readRoutePathSegments(path).reduce((score, segment) => {
    if (segment === "$") {
      return score - 1;
    }

    if (segment.startsWith("$")) {
      return score + 1;
    }

    return score + 10;
  }, 0);
}

function readRouteAddressSearchTokens(
  routeAddress: string,
): readonly RouteAddressSearchTokenView[] {
  return (
    parseRouteAddress(routeAddress).search?.tokens.map((routeToken) => ({
      hasValueSeparator: routeToken.kind === "value",
      key: routeToken.key,
      routeToken,
      value: routeToken.kind === "value" ? routeToken.value : "",
    })) ?? []
  );
}

function readRoutePathSegments(path: string): readonly string[] {
  return path.slice(1).split("/");
}

/**
Single entrypoint for turning an editor draft into a router-loadable route address.

`draftRouteAddress` is the visible editor text without the locked origin prefix.

Callers should pass `RouteEditorState.expectedRouteAddress` as `currentRouteAddress`, not
`committedRouteAddress` or `window.location`. During `previewedSuggestion`, TanStack may already be
on `previewRoute.expectedRouteAddress` while the next classification still belongs to `draftRouteAddress`.

Example: `/logo?dar` while already on `/logo` returns `local`, because `dar` is a partial
known query key.

Example: `/logo?dark` returns `readyExact`, because that exact route can load.

Example: `/logo?dark&light&` returns `readyNormalized` with routeAddress `/logo`, because
root route canonicalization removes conflicting theme flags.

The internal order is intentional:

1. `readRouteAddressRouteUpdateDraft` drops incomplete query tokens from `draftRouteAddress`.

2. `normalizeRouteUrlEditorHref` rejects invalid or cross-origin route text.

3. `isRouteUrlPathReadyForNavigation` rejects paths that are not loadable yet.

4. `readCanonicalRouteAddress` predicts the route TanStack will report after root search validation,
redirects, and search serialization, such as `?reset`, `?dark&light`, and `?zoom=0.0`.
*/
export function readRouteAddressReadiness(args: RouteAddressReadinessInput): RouteAddressReadiness {
  const routeUpdateDraftAddress = readRouteAddressRouteUpdateDraft({
    currentRouteAddress: args.currentRouteAddress,
    draftRouteAddress: args.draftRouteAddress,
    origin: args.origin,
    routesByPath: args.routesByPath,
    viewer: { isAdmin: args.viewerIsAdmin },
  });
  const readyRouteAddress = normalizeRouteUrlEditorHref({
    currentHref: args.currentRouteAddress,
    origin: args.origin,
    rawHref: routeUpdateDraftAddress,
  });

  if (readyRouteAddress === null) {
    return {
      kind: "local",
      reason: "invalidRouteAddress",
    };
  }

  if (
    !isRouteUrlPathReadyForNavigation({
      currentHref: args.currentRouteAddress,
      draftHref: readyRouteAddress,
      origin: args.origin,
      routesByPath: args.routesByPath,
      viewer: { isAdmin: args.viewerIsAdmin },
    })
  ) {
    return {
      kind: "local",
      reason: "pathNotReady",
    };
  }

  const canonicalRouteAddress =
    args.readCanonicalRouteAddress?.(readyRouteAddress) ??
    readCanonicalRouteAddress(readyRouteAddress, args.origin);

  if (
    routeUpdateDraftAddress !== args.draftRouteAddress ||
    canonicalRouteAddress !== readyRouteAddress
  ) {
    if (canonicalRouteAddress === args.currentRouteAddress) {
      return {
        kind: "local",
        reason: routeUpdateDraftAddress !== args.draftRouteAddress ? "draftNotReady" : "sameRoute",
      };
    }

    return {
      kind: "readyNormalized",
      routeAddress: canonicalRouteAddress,
    };
  }

  if (canonicalRouteAddress === args.currentRouteAddress) {
    return {
      kind: "local",
      reason: "sameRoute",
    };
  }

  return {
    kind: "readyExact",
    routeAddress: canonicalRouteAddress,
  };
}
