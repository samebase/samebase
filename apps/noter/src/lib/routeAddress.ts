import type { AppRouter } from "@/router";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import { readRouteUrlEditorRouteUpdateDraft } from "@/lib/routeUrlEditorSuggestions";
import { isRouteUrlPathReadyForNavigation } from "@/lib/routeUrlPathSuggestions";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  clearConflictingRootThemeModeSearch,
  isRootRouteOwnedSearchKey,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";

type RouteAddressReadinessInput = {
  currentRouteAddress: string;
  draftRouteAddress: string;
  origin: string;
  readCanonicalRouteAddress?: (routeAddress: string) => string;
  routesByPath: AppRouter["routesByPath"];
  viewerIsAdmin: boolean;
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

1. `readRouteUrlEditorRouteUpdateDraft` drops incomplete query tokens from `draftRouteAddress`.

2. `normalizeRouteUrlEditorHref` rejects invalid or cross-origin route text.

3. `isRouteUrlPathReadyForNavigation` rejects paths that are not loadable yet.

4. `readCanonicalRouteAddress` predicts the route TanStack will report after root search validation,
redirects, and search serialization, such as `?reset`, `?dark&light`, and `?zoom=0.0`.
*/
export function readRouteAddressReadiness(args: RouteAddressReadinessInput): RouteAddressReadiness {
  const routeUpdateDraftAddress = readRouteUrlEditorRouteUpdateDraft({
    currentHref: args.currentRouteAddress,
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
