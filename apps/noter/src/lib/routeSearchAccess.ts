import { ROOT_ROUTE_SEARCH_PARAM_ACCESS } from "@/lib/rootRouteSearch";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  canAccessNoterRouteAccess,
  type NoterRouteAccess,
  type NoterRouteAccessViewer,
  type NoterRouteSearchParamAccess,
  type NoterRouteSearchParamSuggestion,
} from "@/lib/routePermissions";

type NoterRouteSearchAccessMatch = {
  staticData: {
    access: NoterRouteAccess;
    searchParamSuggestions?: readonly NoterRouteSearchParamSuggestion[];
  };
};

type NoterRouteSearchLocation = {
  hash: string;
  pathname: string;
  searchStr: string;
};

function readRouteSearchParamAccess(args: {
  key: string;
  matches: readonly NoterRouteSearchAccessMatch[];
}): NoterRouteAccess | null {
  const rootSearchAccess = readMatchingSearchParamAccess(args.key, ROOT_ROUTE_SEARCH_PARAM_ACCESS);
  if (rootSearchAccess !== null) {
    return rootSearchAccess;
  }

  for (const match of args.matches) {
    const routeSearchAccess = readMatchingSearchParamAccess(
      args.key,
      match.staticData.searchParamSuggestions ?? [],
    );
    if (routeSearchAccess !== null) {
      return routeSearchAccess;
    }
  }

  return null;
}

function readMatchingSearchParamAccess(
  key: string,
  accessEntries: readonly NoterRouteSearchParamAccess[],
): NoterRouteAccess | null {
  for (const accessEntry of accessEntries) {
    if (accessEntry.key === key) {
      return accessEntry.access;
    }
  }

  return null;
}

export function routeSearchNeedsViewerAccess(args: {
  matches: readonly NoterRouteSearchAccessMatch[];
  searchStr: string;
}): boolean {
  const search = parseTanStackSearch(args.searchStr);

  for (const key of Object.keys(search)) {
    const access = readRouteSearchParamAccess({
      key,
      matches: args.matches,
    });
    if (access !== null && access !== "access_public") {
      return true;
    }
  }

  return false;
}

export function readRouteSearchAccessCanonicalRouteAddress(args: {
  location: NoterRouteSearchLocation;
  matches: readonly NoterRouteSearchAccessMatch[];
  viewer: NoterRouteAccessViewer;
}): string | null {
  const search = parseTanStackSearch(args.location.searchStr);
  const canonicalSearch = { ...search };
  let hasRemovedSearch = false;

  for (const key of Object.keys(search)) {
    const access = readRouteSearchParamAccess({
      key,
      matches: args.matches,
    });
    if (access === null || canAccessNoterRouteAccess(access, args.viewer)) {
      continue;
    }

    delete canonicalSearch[key];
    hasRemovedSearch = true;
  }

  if (!hasRemovedSearch) {
    return null;
  }

  return buildPathWithTanStackSearch({
    pathname: args.location.pathname,
    search: canonicalSearch,
    hash: args.location.hash,
  });
}
