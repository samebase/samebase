import { getRouteApi } from "@tanstack/react-router";
import { normalizeLogoDistanceScale } from "@/components/logo/logoDistanceScale";
import {
  normalizeLogoFractalDepth,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  readLogoGridSize,
} from "@/components/logo/logoVoxelState";
import { appThemeColorSearchFieldSchema } from "@/lib/appThemeColorSearch";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
  validateLogoRouteSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM } from "@/lib/publicLayoutSidebarPreferences";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/lib/routeSearchFlags";
import { rootThemeModeSearchFieldSchema } from "@/lib/rootThemeModeSearch";
import {
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  type RouteSearchParamMetadataByKey,
} from "@/lib/routeSearchParamMetadata";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { z } from "zod";

// TanStack Router's root route id is the stable "__root__" literal, and using
// it directly keeps this helper on the app package boundary.
const ROOT_ROUTE_ID = "__root__";

function readOptionalSidebarResetFlag(value: unknown): true | undefined {
  return value === true || value === "" || value === "true" ? true : undefined;
}

function readOptionalGoogleAuthProvider(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
}

function readOptionalGoogleSignupReturn(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
}

function readOptionalAuthReturn(value: unknown): "dashboard" | undefined {
  return value === "dashboard" ? "dashboard" : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function readOptionalLogoFractalDepth(value: unknown): number | undefined {
  const numericValue = readOptionalNumber(value);
  return typeof numericValue === "number" ? normalizeLogoFractalDepth(numericValue) : undefined;
}

function readOptionalLogoGridSize(value: unknown): number | undefined {
  const numericValue = readOptionalNumber(value);
  return typeof numericValue === "number"
    ? (readLogoGridSize(numericValue) ?? undefined)
    : undefined;
}

const rootRouteSearchSchema = z
  .object({
    auth: z.preprocess(readOptionalGoogleAuthProvider, z.literal("google").optional()),
    "auth-return": z.preprocess(readOptionalAuthReturn, z.literal("dashboard").optional()),
    "add-convex": z.literal(true).optional(),
    "add-cloudflare": z.literal(true).optional(),
    dev: z.literal(true).optional(),
    devtools: z.literal(true).optional(),
    delete: z.literal(true).optional(),
    "new-app": z.literal(true).optional(),
    depth: z.preprocess(readOptionalLogoFractalDepth, z.number().finite().optional()),
    dist: z.preprocess((value) => {
      const numericValue = readOptionalNumber(value);
      return typeof numericValue === "number"
        ? normalizeLogoDistanceScale(numericValue)
        : undefined;
    }, z.number().finite().optional()),
    "prod-ui": z.literal(true).optional(),
    gridSize: z.preprocess(
      readOptionalLogoGridSize,
      z.union([z.literal(LOGO_GRID_SIZE_2), z.literal(LOGO_GRID_SIZE_3)]).optional(),
    ),
    [SEARCH_RESET_QUERY_PARAM]: z.literal(true).optional(),
    [PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM]: z.preprocess(
      readOptionalSidebarResetFlag,
      z.literal(true).optional(),
    ),
    signup: z.preprocess(readOptionalGoogleSignupReturn, z.literal("google").optional()),
  })
  .merge(appThemeColorSearchFieldSchema)
  .merge(rootThemeModeSearchFieldSchema);

type RootRouteSearchBase = z.infer<typeof rootRouteSearchSchema>;
export type RootRouteSearch = RootRouteSearchBase & LogoRouteSearch;

function globalLogoRouteSearchParam(key: keyof typeof LOGO_ROUTE_SEARCH_PARAM_METADATA) {
  return {
    ...LOGO_ROUTE_SEARCH_PARAM_METADATA[key],
    suggestion: "global" as const,
  };
}

const rootRouteSearchParamMetadata = {
  ...LOGO_ROUTE_SEARCH_PARAM_METADATA,
  "add-cloudflare": {
    parseKind: "presence",
    permission: "admin",
    suggestion: "route",
    valueKind: "presence",
  },
  "add-convex": {
    parseKind: "presence",
    permission: "admin",
    suggestion: "route",
    valueKind: "presence",
  },
  "auth-return": { permission: "public", suggestion: "hidden", valueKind: "value" },
  auth: { permission: "public", suggestion: "route", valueKind: "value" },
  base: { permission: "public", suggestion: "hidden", valueKind: "value" },
  background: globalLogoRouteSearchParam("background"),
  border: globalLogoRouteSearchParam("border"),
  dark: globalLogoRouteSearchParam("dark"),
  delete: {
    parseKind: "presence",
    permission: "admin",
    suggestion: "route",
    valueKind: "presence",
  },
  depth: globalLogoRouteSearchParam("depth"),
  dev: globalLogoRouteSearchParam("dev"),
  devtools: {
    parseKind: "presence",
    permission: "public",
    suggestion: "global",
    valueKind: "presence",
  },
  dist: globalLogoRouteSearchParam("dist"),
  gridSize: globalLogoRouteSearchParam("gridSize"),
  light: globalLogoRouteSearchParam("light"),
  "new-app": {
    parseKind: "presence",
    permission: "admin",
    suggestion: "route",
    valueKind: "presence",
  },
  primary: globalLogoRouteSearchParam("primary"),
  "prod-ui": {
    parseKind: "presence",
    permission: "public",
    suggestion: "global",
    valueKind: "presence",
  },
  [PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM]: {
    parseKind: "schema",
    permission: "public",
    suggestion: "route",
    valueKind: "presence",
  },
  [SEARCH_RESET_QUERY_PARAM]: {
    parseKind: "presence",
    permission: "public",
    suggestion: "global",
    valueKind: "presence",
  },
  secondary: globalLogoRouteSearchParam("secondary"),
  signup: { permission: "public", suggestion: "route", valueKind: "value" },
  top: globalLogoRouteSearchParam("top"),
} as const satisfies RouteSearchParamMetadataByKey<RootRouteSearch>;

const ROOT_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(rootRouteSearchParamMetadata);

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
  const parsedSearch = rootRouteSearchSchema.parse(presenceNormalizedSearch);
  if (!parsedSearch[SEARCH_RESET_QUERY_PARAM]) {
    const logoSearch = validateLogoRouteSearch(presenceNormalizedSearch);
    const normalizedSearch = {
      ...parsedSearch,
      ...logoSearch,
    };
    delete normalizedSearch.base;
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
