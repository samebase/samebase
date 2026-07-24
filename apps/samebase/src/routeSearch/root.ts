import { useLocation } from "@tanstack/react-router";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
  validateLogoRouteSearch,
  type LogoRouteSearch,
} from "@/routeSearch/logo";
import { MOBILE_SIDEBAR_DEBUG_QUERY_PARAM } from "@/lib/mobileSidebarGestureDebug";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamAccess,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
  type RouteSearchParamMetadataByKey,
} from "@/routing/searchParamMetadata";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { FORCE_PROD_UI_QUERY_PARAM, isProdUiModeEnabled } from "@/lib/prodUiMode";

export type VaultDashboardQueryDialog = "add-cloudflare" | "add-convex" | "delete";

const RouteSearchSchema_root = defineRouteSearchParams({
  "add-cloudflare": routeSearchPresenceParam({
    access: "access_provider_connections",
    suggestion: "hidden",
  }),
  "add-convex": routeSearchPresenceParam({
    access: "access_provider_connections",
    suggestion: "hidden",
  }),
  "auth-return": routeSearchValueParam(routeSearchStringValue(["dashboard"]), {
    access: "access_public",
    sampleValue: "dashboard",
    suggestion: "hidden",
    valueSuggestions: ["dashboard"],
    valueType: "options",
  }),
  auth: routeSearchValueParam(routeSearchStringValue(["google"]), {
    access: "access_public",
    // Previewing auth=google starts OAuth; require typing/selecting the value explicitly.
    suggestion: "route",
    valueType: "manual",
  }),
  code: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_public",
    sampleValue: "oauth-code",
    suggestion: "hidden",
    valueType: "freeform",
  }),
  "create-account": routeSearchPresenceParam({
    access: "access_public",
    suggestion: "route",
  }),
  delete: routeSearchPresenceParam({
    access: "access_dashboard",
    suggestion: "route",
  }),
  devtools: routeSearchPresenceParam({
    access: "access_public",
    // React Query Devtools mounts dev-only UI; keep it typeable but out of
    // hover/keyboard suggestions so previewing a row cannot remount the app.
    suggestion: "hidden",
  }),
  [MOBILE_SIDEBAR_DEBUG_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  "prod-ui": routeSearchPresenceParam({
    access: "access_public",
    suggestion: "global",
  }),
  [SEARCH_RESET_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "global",
  }),
  signup: routeSearchValueParam(routeSearchStringValue(["google"]), {
    access: "access_public",
    // signup=google is an auth-return marker, not a route option to preview.
    suggestion: "route",
    valueType: "manual",
  }),
  "sign-in": routeSearchPresenceParam({
    access: "access_public",
    suggestion: "route",
  }),
});

type RootRouteSearchBase = InferRouteSearch<typeof RouteSearchSchema_root>;
export type RootRouteSearch = RootRouteSearchBase & LogoRouteSearch;

const VAULT_DASHBOARD_DIALOG_CLEAR_PATCHES = {
  "add-cloudflare": {
    "add-cloudflare": null,
  },
  "add-convex": {
    "add-convex": null,
  },
  delete: {
    delete: null,
  },
} satisfies Record<VaultDashboardQueryDialog, SearchPatch<RootRouteSearch>>;

export function clearVaultDashboardQueryDialogSearch(
  currentSearch: RootRouteSearch,
  dialog: VaultDashboardQueryDialog,
): RootRouteSearch {
  return applySearchPatch(currentSearch, VAULT_DASHBOARD_DIALOG_CLEAR_PATCHES[dialog]);
}

function globalLogoRouteSearchParam(key: keyof typeof LOGO_ROUTE_SEARCH_PARAM_METADATA) {
  return {
    ...LOGO_ROUTE_SEARCH_PARAM_METADATA[key],
    suggestion: "global" as const,
  };
}

const rootRouteSearchOwnParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_root);

const rootRouteSearchParamMetadata = {
  ...LOGO_ROUTE_SEARCH_PARAM_METADATA,
  "add-cloudflare": rootRouteSearchOwnParamMetadata["add-cloudflare"],
  "add-convex": rootRouteSearchOwnParamMetadata["add-convex"],
  "auth-return": rootRouteSearchOwnParamMetadata["auth-return"],
  auth: rootRouteSearchOwnParamMetadata.auth,
  code: rootRouteSearchOwnParamMetadata.code,
  "create-account": rootRouteSearchOwnParamMetadata["create-account"],
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
  [MOBILE_SIDEBAR_DEBUG_QUERY_PARAM]:
    rootRouteSearchOwnParamMetadata[MOBILE_SIDEBAR_DEBUG_QUERY_PARAM],
  primary: globalLogoRouteSearchParam("primary"),
  "prod-ui": rootRouteSearchOwnParamMetadata["prod-ui"],
  [SEARCH_RESET_QUERY_PARAM]: rootRouteSearchOwnParamMetadata[SEARCH_RESET_QUERY_PARAM],
  secondary: globalLogoRouteSearchParam("secondary"),
  signup: rootRouteSearchOwnParamMetadata.signup,
  "sign-in": rootRouteSearchOwnParamMetadata["sign-in"],
  top: globalLogoRouteSearchParam("top"),
  zoom: globalLogoRouteSearchParam("zoom"),
} as const satisfies RouteSearchParamMetadataByKey<RootRouteSearch>;

const ROOT_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(rootRouteSearchParamMetadata);
const DASHBOARD_MODAL_SEARCH_KEYS = [
  "add-cloudflare",
  "add-convex",
  "delete",
] as const satisfies readonly (keyof RootRouteSearchBase)[];

export const ROOT_ROUTE_SEARCH_PARAM_ACCESS = readRouteSearchParamAccess(
  rootRouteSearchParamMetadata,
);

export const ROOT_ROUTE_GLOBAL_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  rootRouteSearchParamMetadata,
  "global",
);

export const ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  rootRouteSearchParamMetadata,
  "route",
);

export const DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS = ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS.filter(
  (suggestion) => suggestion.access !== "access_public",
);

export const DASHBOARD_ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  DASHBOARD_ROUTE_SEARCH_PARAM_SUGGESTIONS.filter(
    (suggestion) => !DASHBOARD_MODAL_SEARCH_KEYS.some((key) => key === suggestion.key),
  );

export const ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS = ROOT_ROUTE_SEARCH_PARAM_SUGGESTIONS.filter(
  (suggestion) => suggestion.access === "access_public",
);

export function isRootRouteOwnedSearchKey(key: string): boolean {
  return key in rootRouteSearchParamMetadata;
}

function normalizeDashboardModalSearch(parsedSearch: RootRouteSearchBase): RootRouteSearchBase {
  const validModalKeys = DASHBOARD_MODAL_SEARCH_KEYS.filter((key) => parsedSearch[key]);
  if (validModalKeys.length === 1) {
    return parsedSearch;
  }

  const normalizedSearch = { ...parsedSearch };
  for (const key of DASHBOARD_MODAL_SEARCH_KEYS) {
    normalizedSearch[key] = undefined;
  }
  return normalizedSearch;
}

/**
Root-level preview/debug/theme controls stay on public-route navigation unless
a caller clears the key with `undefined` or `null` in a route search patch.
*/
export const RETAINED_ROOT_SEARCH_KEYS = [
  "devtools",
  MOBILE_SIDEBAR_DEBUG_QUERY_PARAM,
  ...LOGO_ROUTE_SEARCH_KEYS,
] as const satisfies readonly (keyof RootRouteSearch)[];

function parseRootRouteSearch(search: Record<string, unknown>): RootRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    ROOT_ROUTE_PRESENCE_SEARCH_KEYS,
  );
  const parsedSearch = normalizeDashboardModalSearch(
    RouteSearchSchema_root.parse(presenceNormalizedSearch),
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

export function clearConflictingRootThemeModeSearch(search: RootRouteSearch): RootRouteSearch {
  if (!search.light || !search.dark) {
    return search;
  }

  return applySearchPatch(search, {
    dark: null,
    light: null,
  });
}

/**
Returns the canonical route address for root search handling, or `null` when the route can load
without normalization.

Example: pathname `/logo` plus search `{ reset: true }` canonicalizes to `/logo`.

Example: pathname `/logo` plus search `{ dark: true, light: true }` canonicalizes to `/logo`.

Example: pathname `/vault` plus raw search `?delete-account` canonicalizes to `/vault`, because no
matched route schema accepts `delete-account` there. `acceptedSearchKeys` is the union of the matched
route chain's `staticData.acceptedSearchKeys`; root-owned keys are always kept.
*/
export function readCanonicalRouteAddressForRootSearch(args: {
  acceptedSearchKeys: readonly string[];
  hash: string;
  pathname: string;
  searchStr: string;
  stripProdUi: boolean;
}): string | null {
  // TanStack's beforeLoad search merges raw keys with validated results, so
  // the canonical root search derives from the raw search string instead.
  const rawSearch = parseTanStackSearch(args.searchStr);
  const rootSearch = validateRootRouteSearch(rawSearch);
  if (rootSearch.reset) {
    return buildPathWithTanStackSearch({
      pathname: args.pathname,
      hash: args.hash,
    });
  }

  const keptRawSearch: Record<string, unknown> = {};
  let hasDroppedSearchKey = false;
  for (const [key, value] of Object.entries(rawSearch)) {
    if (isRootRouteOwnedSearchKey(key)) {
      // The validated root search is the canonical form of root-owned keys,
      // matching the route URL editor's readCanonicalRouteAddress.
      continue;
    }

    if (args.acceptedSearchKeys.includes(key)) {
      keptRawSearch[key] = value;
    } else {
      hasDroppedSearchKey = true;
    }
  }

  const themeCanonicalSearch = clearConflictingRootThemeModeSearch(rootSearch);
  const nextSearch =
    args.stripProdUi && isProdUiModeEnabled(rootSearch)
      ? applySearchPatch(themeCanonicalSearch, {
          [FORCE_PROD_UI_QUERY_PARAM]: null,
        })
      : themeCanonicalSearch;
  if (hasDroppedSearchKey || nextSearch !== rootSearch) {
    return buildPathWithTanStackSearch({
      pathname: args.pathname,
      search: { ...keptRawSearch, ...nextSearch },
      hash: args.hash,
    });
  }

  return null;
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
`readRootRouteSearch` accepts browser-style string/URLSearchParams input and
normalizes it through the app's TanStack search parser before schema validation.
*/
export function readRootRouteSearch(search: string | URLSearchParams | undefined): RootRouteSearch {
  return parseRootRouteSearch(
    parseTanStackSearch(typeof search === "string" ? search : (search?.toString() ?? "")),
  );
}

export function useRootRouteSearch(): RootRouteSearch {
  const searchStr = useLocation({
    select: (location) => location.searchStr,
  });

  return readRootRouteSearch(searchStr);
}
