import { ROOT_ROUTE_SEARCH_PARAM_ACCESS } from "@/routeSearch/root";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  canAccessSamebaseRouteAccess,
  type SamebaseRouteAccess,
  type SamebaseRouteAccessViewer,
  type SamebaseRouteSearchParamAccess,
} from "@/routing/permissions";

type SamebaseRouteSearchAccessMatch = {
  staticData: {
    access: SamebaseRouteAccess;
    searchParamAccess?: readonly SamebaseRouteSearchParamAccess[];
  };
};

type SamebaseRouteSearchLocation = {
  hash: string;
  pathname: string;
  searchStr: string;
};

function readRouteSearchParamAccess(args: {
  key: string;
  matches: readonly SamebaseRouteSearchAccessMatch[];
}): SamebaseRouteAccess | null {
  const rootSearchAccess = readMatchingSearchParamAccess(args.key, ROOT_ROUTE_SEARCH_PARAM_ACCESS);
  if (rootSearchAccess !== null) {
    return rootSearchAccess;
  }

  for (const match of args.matches) {
    const routeSearchAccess = readMatchingSearchParamAccess(
      args.key,
      match.staticData.searchParamAccess ?? [],
    );
    if (routeSearchAccess !== null) {
      return routeSearchAccess;
    }
  }

  return null;
}

function readMatchingSearchParamAccess(
  key: string,
  accessEntries: readonly SamebaseRouteSearchParamAccess[],
): SamebaseRouteAccess | null {
  for (const accessEntry of accessEntries) {
    if (accessEntry.key === key) {
      return accessEntry.access;
    }
  }

  return null;
}

export function routeSearchNeedsViewerAccess(args: {
  matches: readonly SamebaseRouteSearchAccessMatch[];
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
  location: SamebaseRouteSearchLocation;
  matches: readonly SamebaseRouteSearchAccessMatch[];
  viewer: SamebaseRouteAccessViewer;
}): string | null {
  const search = parseTanStackSearch(args.location.searchStr);
  const canonicalSearch = { ...search };
  let hasRemovedSearch = false;

  for (const key of Object.keys(search)) {
    const access = readRouteSearchParamAccess({
      key,
      matches: args.matches,
    });
    if (access === null || canAccessSamebaseRouteAccess(access, args.viewer)) {
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
