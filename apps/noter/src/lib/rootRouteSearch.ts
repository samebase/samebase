import { getRouteApi } from "@tanstack/react-router";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
  validateLogoRouteSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
  type RouteSearchParamMetadataByKey,
} from "@/lib/routeSearchParamMetadata";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";

// TanStack Router's root route id is the stable "__root__" literal, and using
// it directly keeps this helper on the app package boundary.
const ROOT_ROUTE_ID = "__root__";
export const DASHBOARD_ADD_APP_ROOT_QUERY_PARAM = "add-app-root";
export const DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM = "app-root";

const rootRouteSearchSchema = defineRouteSearchParams({
  [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  "add-cloudflare": routeSearchPresenceParam({
    permission: "admin",
    suggestion: "hidden",
  }),
  "add-convex": routeSearchPresenceParam({
    permission: "admin",
    suggestion: "hidden",
  }),
  "auth-return": routeSearchValueParam(routeSearchStringValue(["dashboard"]), {
    permission: "public",
    sampleValue: "dashboard",
    suggestion: "hidden",
    valueCompletion: null,
    valueSuggestions: ["dashboard"],
  }),
  auth: routeSearchValueParam(routeSearchStringValue(["google"]), {
    permission: "public",
    // Previewing auth=google starts OAuth; require typing/selecting the value explicitly.
    sampleValue: null,
    suggestion: "route",
    valueCompletion: null,
    valueSuggestions: null,
  }),
  [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "apps/noter",
    suggestion: "hidden",
    valueCompletion: null,
    valueSuggestions: null,
  }),
  delete: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  devtools: routeSearchPresenceParam({
    permission: "public",
    suggestion: "global",
  }),
  "new-app": routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  "prod-ui": routeSearchPresenceParam({
    permission: "public",
    suggestion: "global",
  }),
  [SEARCH_RESET_QUERY_PARAM]: routeSearchPresenceParam({
    permission: "public",
    suggestion: "global",
  }),
  signup: routeSearchValueParam(routeSearchStringValue(["google"]), {
    permission: "public",
    // signup=google is an auth-return marker, not a route option to preview.
    sampleValue: null,
    suggestion: "route",
    valueCompletion: null,
    valueSuggestions: null,
  }),
});

type RootRouteSearchBase = InferRouteSearch<typeof rootRouteSearchSchema>;
export type RootRouteSearch = RootRouteSearchBase & LogoRouteSearch;

function globalLogoRouteSearchParam(key: keyof typeof LOGO_ROUTE_SEARCH_PARAM_METADATA) {
  return {
    ...LOGO_ROUTE_SEARCH_PARAM_METADATA[key],
    suggestion: "global" as const,
  };
}

const rootRouteSearchOwnParamMetadata = readRouteSearchParamMetadata(rootRouteSearchSchema);

const rootRouteSearchParamMetadata = {
  ...LOGO_ROUTE_SEARCH_PARAM_METADATA,
  [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]:
    rootRouteSearchOwnParamMetadata[DASHBOARD_ADD_APP_ROOT_QUERY_PARAM],
  "add-cloudflare": rootRouteSearchOwnParamMetadata["add-cloudflare"],
  "add-convex": rootRouteSearchOwnParamMetadata["add-convex"],
  "auth-return": rootRouteSearchOwnParamMetadata["auth-return"],
  auth: rootRouteSearchOwnParamMetadata.auth,
  [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]:
    rootRouteSearchOwnParamMetadata[DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM],
  background: globalLogoRouteSearchParam("background"),
  border: globalLogoRouteSearchParam("border"),
  dark: globalLogoRouteSearchParam("dark"),
  delete: rootRouteSearchOwnParamMetadata.delete,
  depth: globalLogoRouteSearchParam("depth"),
  dev: globalLogoRouteSearchParam("dev"),
  devtools: rootRouteSearchOwnParamMetadata.devtools,
  dist: globalLogoRouteSearchParam("dist"),
  gridSize: globalLogoRouteSearchParam("gridSize"),
  light: globalLogoRouteSearchParam("light"),
  "new-app": rootRouteSearchOwnParamMetadata["new-app"],
  primary: globalLogoRouteSearchParam("primary"),
  "prod-ui": rootRouteSearchOwnParamMetadata["prod-ui"],
  [SEARCH_RESET_QUERY_PARAM]: rootRouteSearchOwnParamMetadata[SEARCH_RESET_QUERY_PARAM],
  secondary: globalLogoRouteSearchParam("secondary"),
  signup: rootRouteSearchOwnParamMetadata.signup,
  top: globalLogoRouteSearchParam("top"),
} as const satisfies RouteSearchParamMetadataByKey<RootRouteSearch>;

const ROOT_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(rootRouteSearchParamMetadata);
const DASHBOARD_MODAL_SEARCH_KEYS = [
  DASHBOARD_ADD_APP_ROOT_QUERY_PARAM,
  "add-cloudflare",
  "add-convex",
  "delete",
  "new-app",
] as const satisfies readonly (keyof RootRouteSearchBase)[];

export const ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  rootRouteSearchParamMetadata,
  "global",
);

export const ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  rootRouteSearchParamMetadata,
  "route",
);

export const DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS = ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS.filter(
  (suggestion) => suggestion.permission === "admin",
);

export const ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS = ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS.filter(
  (suggestion) => suggestion.permission === "public",
);

function normalizeDashboardModalSearch(parsedSearch: RootRouteSearchBase): RootRouteSearchBase {
  const providerAppRoot = parsedSearch[DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM];
  const validModalKeys = DASHBOARD_MODAL_SEARCH_KEYS.filter((key) => {
    if (!parsedSearch[key]) {
      return false;
    }
    if (key === "add-cloudflare" || key === "add-convex") {
      return typeof providerAppRoot === "string";
    }
    return true;
  });
  if (validModalKeys.length === 1) {
    const key = validModalKeys[0];
    if (key === "add-cloudflare" || key === "add-convex") {
      return parsedSearch;
    }
    return {
      ...parsedSearch,
      [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: undefined,
    };
  }

  const normalizedSearch = {
    ...parsedSearch,
    [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: undefined,
  };
  for (const key of DASHBOARD_MODAL_SEARCH_KEYS) {
    normalizedSearch[key] = undefined;
  }
  return normalizedSearch;
}

/**
 * Root-level preview/debug/theme controls follow public-route navigation unless
 * a caller clears the key with a route-search tombstone.
 */
export const RETAINED_ROOT_SEARCH_KEYS = [
  "devtools",
  ...LOGO_ROUTE_SEARCH_KEYS,
] as const satisfies readonly (keyof RootRouteSearch)[];

function parseRootRouteSearch(search: Record<string, unknown>): RootRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    ROOT_ROUTE_PRESENCE_SEARCH_KEYS,
  );
  const parsedSearch = normalizeDashboardModalSearch(
    rootRouteSearchSchema.parse(presenceNormalizedSearch),
  );
  if (!parsedSearch[SEARCH_RESET_QUERY_PARAM]) {
    const logoSearch = validateLogoRouteSearch(presenceNormalizedSearch);
    const conflictingThemeModeSearch =
      presenceNormalizedSearch.light && presenceNormalizedSearch.dark
        ? { dark: true as const, light: true as const }
        : {};
    const normalizedSearch = {
      ...parsedSearch,
      ...logoSearch,
      ...conflictingThemeModeSearch,
    };
    return normalizedSearch;
  }

  // Reset is a sentinel, so do not let stale or malformed params influence app
  // state while the root route removes the visible query string.
  return { [SEARCH_RESET_QUERY_PARAM]: true as const };
}

export function validateRootRouteSearch(search: Record<string, unknown>): RootRouteSearch {
  return parseRootRouteSearch(search);
}

function setRootLogoRouteSearchPatchValue<Key extends keyof LogoRouteSearch>({
  key,
  logoSearchPatch,
  value,
}: {
  key: Key;
  logoSearchPatch: SearchPatch<RootRouteSearch>;
  value: LogoRouteSearch[Key];
}) {
  logoSearchPatch[key] = typeof value === "undefined" ? null : value;
}

export function replaceRootLogoRouteSearch(
  currentSearch: RootRouteSearch,
  nextLogoSearch: LogoRouteSearch,
): RootRouteSearch {
  const logoSearchPatch: SearchPatch<RootRouteSearch> = {};

  for (const key of LOGO_ROUTE_SEARCH_KEYS) {
    setRootLogoRouteSearchPatchValue({
      key,
      logoSearchPatch,
      value: nextLogoSearch[key],
    });
  }

  return applySearchPatch(currentSearch, logoSearchPatch);
}

/**
 * `readRootRouteSearch` accepts browser-style string/URLSearchParams input and
 * normalizes it through the app's TanStack search parser before schema
 * validation.
 */
export function readRootRouteSearch(search: string | URLSearchParams | undefined): RootRouteSearch {
  return parseRootRouteSearch(
    parseTanStackSearch(typeof search === "string" ? search : (search?.toString() ?? "")),
  );
}

const rootRouteApi = getRouteApi(ROOT_ROUTE_ID);

export function useRootRouteSearch(): RootRouteSearch {
  return rootRouteApi.useSearch();
}
