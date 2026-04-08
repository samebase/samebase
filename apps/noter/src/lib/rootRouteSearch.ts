import { getRouteApi } from "@tanstack/react-router";
import { type PathWithSearch } from "@/lib/queryParams";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
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

function readOptionalGoogleAuthProvider(value: unknown): "google" | undefined {
  return value === "google" ? "google" : undefined;
}

const rootRouteSearchSchema = z.object({
  auth: z.preprocess(
    readOptionalGoogleAuthProvider,
    z.literal("google").optional(),
  ),
  dev: z.preprocess(readOptionalFlag, z.literal(true).optional()),
  devtools: z.preprocess(readOptionalFlag, z.literal(true).optional()),
  "prod-ui": z.preprocess(readOptionalFlag, z.literal(true).optional()),
});

export type RootRouteSearch = z.infer<typeof rootRouteSearchSchema>;

function parseRootRouteSearch(search: unknown): RootRouteSearch {
  return rootRouteSearchSchema.parse(search);
}

export function validateRootRouteSearch(
  search: Record<string, unknown>,
): RootRouteSearch {
  return parseRootRouteSearch(search);
}

export function readRootRouteSearchFromLocation(
  location: PathWithSearch,
): RootRouteSearch {
  return parseRootRouteSearch(
    parseTanStackSearch(
      typeof location.search === "string"
        ? location.search
        : location.search?.toString() ?? "",
    ),
  );
}

const rootRouteApi = getRouteApi(ROOT_ROUTE_ID);

export function useRootRouteSearch(): RootRouteSearch {
  return rootRouteApi.useSearch();
}
