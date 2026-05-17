import { getRouteApi } from "@tanstack/react-router";
import { normalizeLogoFractalDepth } from "@/components/logoVoxelState";
import {
  appThemeColorSearchFieldSchema,
  readLogoThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import { PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM } from "@/lib/publicLayoutSidebarPreferences";
import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  ROOT_THEME_MODE_SEARCH_KEYS,
  rootThemeModeSearchFieldSchema,
} from "@/lib/rootThemeModeSearch";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { z } from "zod";

// TanStack Router's root route id is the stable "__root__" literal, and using
// it directly keeps this helper on the app package boundary.
const ROOT_ROUTE_ID = "__root__";

const ROOT_ROUTE_PRESENCE_SEARCH_KEYS = [
  "dev",
  "devtools",
  "prod-ui",
  SEARCH_RESET_QUERY_PARAM,
  ...ROOT_THEME_MODE_SEARCH_KEYS,
] as const;

function readOptionalSidebarResetFlag(value: unknown): true | undefined {
  return value === true || value === "" || value === "true" ? true : undefined;
}

function readOptionalGoogleAuthProvider(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
}

function readOptionalGoogleSignupReturn(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
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
  return typeof numericValue === "number"
    ? normalizeLogoFractalDepth(numericValue)
    : undefined;
}

// Keep the delete route scoped to one trimmed owner/repo pair; invalid shapes
// fail closed so extra slashes or empty segments cannot retarget the surface.
function readOptionalDeleteRepository(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  const parts = normalizedValue.split("/");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return undefined;
  }

  return normalizedValue;
}

const rootRouteSearchSchema = z
  .object({
    auth: z.preprocess(
      readOptionalGoogleAuthProvider,
      z.literal("google").optional(),
    ),
    dev: z.literal(true).optional(),
    devtools: z.literal(true).optional(),
    delete: z.preprocess(readOptionalDeleteRepository, z.string().optional()),
    depth: z.preprocess(
      readOptionalLogoFractalDepth,
      z.number().finite().optional(),
    ),
    "prod-ui": z.literal(true).optional(),
    [SEARCH_RESET_QUERY_PARAM]: z.literal(true).optional(),
    [PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM]: z.preprocess(
      readOptionalSidebarResetFlag,
      z.literal(true).optional(),
    ),
    signup: z.preprocess(
      readOptionalGoogleSignupReturn,
      z.literal("google").optional(),
    ),
  })
  .merge(appThemeColorSearchFieldSchema)
  .merge(rootThemeModeSearchFieldSchema);

export type RootRouteSearch = z.infer<typeof rootRouteSearchSchema>;

function parseRootRouteSearch(search: unknown): RootRouteSearch {
  const parsedSearch = rootRouteSearchSchema.parse(
    normalizeRouteSearchPresenceFlags(search, ROOT_ROUTE_PRESENCE_SEARCH_KEYS),
  );
  if (!parsedSearch[SEARCH_RESET_QUERY_PARAM]) {
    const normalizedSearch = {
      ...parsedSearch,
      ...readLogoThemeColorSearch(parsedSearch),
    };
    delete normalizedSearch.base;
    return normalizedSearch;
  }

  // Reset is a sentinel, so do not let stale or malformed params influence app
  // state while the root route removes the visible query string.
  return { [SEARCH_RESET_QUERY_PARAM]: true as const };
}

export function validateRootRouteSearch(
  search: Record<string, unknown>,
): RootRouteSearch {
  return parseRootRouteSearch(search);
}

/**
 * `readRootRouteSearch` accepts browser-style string/URLSearchParams input and
 * normalizes it through the app's TanStack search parser before schema
 * validation.
 */
export function readRootRouteSearch(
  search: string | URLSearchParams | undefined,
): RootRouteSearch {
  return parseRootRouteSearch(
    parseTanStackSearch(
      typeof search === "string" ? search : (search?.toString() ?? ""),
    ),
  );
}

const rootRouteApi = getRouteApi(ROOT_ROUTE_ID);

export function useRootRouteSearch(): RootRouteSearch {
  return rootRouteApi.useSearch();
}
