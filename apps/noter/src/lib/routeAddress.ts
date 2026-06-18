import { entries } from "@noter-md/dependent/object";
import type { AppRouter } from "@/router";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import {
  isRouteUrlPathReadyForNavigation,
  readRouteUrlPathSuggestionEnvironment,
} from "@/lib/routeUrlPathSuggestions";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
  clearConflictingRootThemeModeSearch,
  isRootRouteOwnedSearchKey,
  validateRootRouteSearch,
} from "@/routeSearch/root";
import {
  canAccessNoterRouteAccess,
  canAccessNoterRouteStaticData,
  type NoterRouteAccessViewer,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestion,
  type NoterRouteStaticData,
} from "@/lib/routePermissions";
import {
  parseRouteAddress,
  readRouteAddressSearchTokenText,
  type RouteAddressSearchToken,
} from "@/lib/routeAddressParts";
import { type NoterRouteEnvironment } from "@/lib/routeAvailability";

type RouteAddressReadinessInput = {
  currentRouteAddress: string;
  draftRouteAddress: string;
  origin: string;
  readCanonicalRouteAddress?: (routeAddress: string) => string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRouteAccessViewer;
};

type RouteAddressRouteUpdateDraftInput = {
  currentRouteAddress: string;
  draftRouteAddress: string;
  origin: string;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRouteAccessViewer;
};

type RouteAddressSearchParamSuggestionsInput = RouteAddressRouteUpdateDraftInput & {
  path: string;
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

  const searchParamSuggestions = readRouteAddressSearchParamSuggestions({
    ...args,
    path: parts.path,
  });
  const acceptedSearchKeys = readMatchingRouteAcceptedSearchKeys(parts.path, args.routesByPath);
  const routeUpdateSearchTokens = parts.search.tokens
    .filter((token) =>
      isRouteAddressSearchTokenReady(token, searchParamSuggestions, acceptedSearchKeys),
    )
    .map((token) => readRouteAddressSearchTokenText(args.draftRouteAddress, token))
    .filter((tokenText) => tokenText.length > 0);
  const search = routeUpdateSearchTokens.length > 0 ? `?${routeUpdateSearchTokens.join("&")}` : "";
  const hash = parts.hash?.suffix ?? "";

  return `${parts.path}${search}${hash}`;
}

function isRouteAddressSearchTokenReady(
  token: RouteAddressSearchToken,
  suggestions: readonly NoterRouteSearchParamSuggestion[],
  acceptedSearchKeys: readonly string[],
): boolean {
  // A destination route accepts only root-owned keys plus its own schema keys.
  // Keys the destination does not accept never ride along into the route
  // update: editing `/machines?machineId=x` to `/home` must drop `machineId`.
  if (!isRootRouteOwnedSearchKey(token.key) && !acceptedSearchKeys.includes(token.key)) {
    return false;
  }

  const suggestion = suggestions.find((value) => value.key === token.key);
  if (token.kind === "key") {
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
  args: RouteAddressSearchParamSuggestionsInput,
): readonly NoterRouteSearchParamSuggestion[] {
  const routeSearchParamSuggestions = readMatchingRouteSearchParamSuggestions({
    path: args.path,
    routeEnvironment: readRouteUrlPathSuggestionEnvironment({
      currentHref: args.currentRouteAddress,
      draftHref: args.draftRouteAddress,
      origin: args.origin,
    }),
    routesByPath: args.routesByPath,
    viewer: args.viewer,
  });
  const searchParamSuggestions = [
    ...routeSearchParamSuggestions,
    ...ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS,
  ];
  const keys = new Set<string>();
  const uniqueValues: NoterRouteSearchParamSuggestion[] = [];

  for (const value of searchParamSuggestions) {
    if (!canAccessNoterRouteAccess(value.access, args.viewer) || keys.has(value.key)) {
      continue;
    }

    keys.add(value.key);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

/**
Returns the destination path's route-owned search keys for route URL editor
draft cleanup.

Example: editing `/machines?machineId=x` into `/home?machineId=x` should drop
`machineId`, because `/home` does not declare that key in
`staticData.acceptedSearchKeys`. The caller handles root-owned keys separately;
this helper only answers which keys belong to the destination route itself.

Permission, route environment, and suggestion visibility are deliberately
ignored so the same draft address canonicalizes the same way for every viewer.
Routes without `acceptedSearchKeys` accept only root-owned keys.
*/
export function readMatchingRouteAcceptedSearchKeys(
  path: string,
  routesByPath: AppRouter["routesByPath"],
): readonly string[] {
  const matches = entries(routesByPath)
    .filter(
      ([routePath]) =>
        (routePath === "/" || (routePath.startsWith("/") && !routePath.startsWith("/_"))) &&
        routePathTemplateMatchesPath(routePath, path),
    )
    .sort(([leftPath], [rightPath]) => compareRoutePathSpecificity(leftPath, rightPath));

  return matches[0]?.[1].options.staticData.acceptedSearchKeys ?? [];
}

/**
Returns URL-editor search suggestions for the most specific accessible route
that matches the draft path.

Example: when the draft route address is `/logo?to`, the path is `/logo`, so
the editor should suggest `/logo` search params such as `top`. When the draft
route address is `/vault/acme/demo/main/README.md?d`, the path matches the
`/vault/$` route, so an admin viewer can see file-view suggestions such as
`diff`.
*/
function readMatchingRouteSearchParamSuggestions(args: {
  path: string;
  routeEnvironment: NoterRouteEnvironment;
  routesByPath: AppRouter["routesByPath"];
  viewer: NoterRouteAccessViewer;
}): readonly NoterRouteSearchParamSuggestion[] {
  const matches = entries(args.routesByPath)
    .filter(
      ([routePath, route]) =>
        isUserFacingAccessibleRoute(
          routePath,
          route.options.staticData,
          args.viewer,
          args.routeEnvironment,
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
  viewer: NoterRouteAccessViewer,
  routeEnvironment: NoterRouteEnvironment,
): boolean {
  return (
    (path === "/" || (path.startsWith("/") && !path.startsWith("/_"))) &&
    canAccessNoterRouteStaticData(staticData, viewer, routeEnvironment)
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
  const scoreDelta = readRoutePathSpecificity(right) - readRoutePathSpecificity(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const leftSegments = readRoutePathSegments(left);
  const rightSegments = readRoutePathSegments(right);
  const segmentCount = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentDelta =
      readRoutePathSegmentSpecificity(rightSegments[index]) -
      readRoutePathSegmentSpecificity(leftSegments[index]);
    if (segmentDelta !== 0) {
      return segmentDelta;
    }
  }

  return left.localeCompare(right);
}

function readRoutePathSpecificity(path: string): number {
  return readRoutePathSegments(path).reduce((score, segment) => {
    return score + readRoutePathSegmentSpecificity(segment);
  }, 0);
}

function readRoutePathSegmentSpecificity(segment: string | undefined): number {
  if (!segment) {
    return -10;
  }

  if (segment === "$") {
    return -1;
  }

  return segment.startsWith("$") ? 1 : 10;
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
    viewer: args.viewer,
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
      viewer: args.viewer,
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
