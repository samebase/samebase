import { getRouteApi } from "@tanstack/react-router";
import { appThemeColorSearchFieldSchema } from "@/lib/appThemeColorSearch";
import {
  readRootThemeModeSearch,
  rootThemeModeSearchFieldSchema,
} from "@/lib/rootThemeModeSearch";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { z } from "zod";

// TanStack Router's root route id is the stable "__root__" literal, and using
// it directly keeps this helper on the app package boundary.
const ROOT_ROUTE_ID = "__root__";

function readOptionalFlag(value: unknown): true | undefined {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.length === 0 || value === "true" ? true : undefined;
}

function readPresentFlag(value: unknown): true | undefined {
  return typeof value === "undefined" ? undefined : true;
}

function readOptionalGoogleAuthProvider(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
}

function readOptionalGoogleSignupReturn(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
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
    dev: z.preprocess(readOptionalFlag, z.literal(true).optional()),
    devtools: z.preprocess(readOptionalFlag, z.literal(true).optional()),
    delete: z.preprocess(readOptionalDeleteRepository, z.string().optional()),
    "prod-ui": z.preprocess(readOptionalFlag, z.literal(true).optional()),
    [SEARCH_RESET_QUERY_PARAM]: z.preprocess(
      readPresentFlag,
      z.literal(true).optional(),
    ),
    signup: z.preprocess(
      readOptionalGoogleSignupReturn,
      z.literal("google").optional(),
    ),
  })
  .merge(appThemeColorSearchFieldSchema)
  .merge(rootThemeModeSearchFieldSchema)
  .transform(({ dark, light, ...search }) => ({
    ...search,
    ...readRootThemeModeSearch({ dark, light }),
  }));

export type RootRouteSearch = z.infer<typeof rootRouteSearchSchema>;

function parseRootRouteSearch(search: unknown): RootRouteSearch {
  const parsedSearch = rootRouteSearchSchema.parse(search);
  if (parsedSearch[SEARCH_RESET_QUERY_PARAM] !== true) {
    return parsedSearch;
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
 * normalizes it through `URLSearchParams` before schema validation.
 */
export function readRootRouteSearch(
  search: string | URLSearchParams | undefined,
): RootRouteSearch {
  return parseRootRouteSearch(
    Object.fromEntries(
      new URLSearchParams(
        typeof search === "string" ? search : (search?.toString() ?? ""),
      ).entries(),
    ),
  );
}

const rootRouteApi = getRouteApi(ROOT_ROUTE_ID);

export function useRootRouteSearch(): RootRouteSearch {
  return rootRouteApi.useSearch();
}
