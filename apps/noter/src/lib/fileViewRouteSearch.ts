import { getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { cloneQueryParams } from "./queryParams";

function readOptionalFlag(value: unknown): true | undefined {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.length === 0 || value === "true" ? true : undefined;
}

function readOptionalMobileLineNumbers(value: unknown): "1" | undefined {
  return value === "1" ? "1" : undefined;
}

const fileViewRouteSearchSchema = z.object({
  compare: z.preprocess(readOptionalFlag, z.literal(true).optional()),
  diff: z.preprocess(readOptionalFlag, z.literal(true).optional()),
  mobileLineNumbers: z.preprocess(
    readOptionalMobileLineNumbers,
    z.literal("1").optional(),
  ),
  review: z.preprocess(readOptionalFlag, z.literal(true).optional()),
});

export type FileViewRouteSearch = z.infer<typeof fileViewRouteSearchSchema>;

export function validateFileViewRouteSearch(
  search: Record<string, unknown>,
): FileViewRouteSearch {
  return fileViewRouteSearchSchema.parse(search);
}

/**
 * Read the current browser-style search string into the route-owned file-view
 * search contract so transitional callsites can preserve existing flags
 * without manually re-parsing individual query params.
 */
export function readFileViewRouteSearch(
  search: string | URLSearchParams | undefined,
): FileViewRouteSearch {
  return validateFileViewRouteSearch(
    Object.fromEntries(cloneQueryParams(search).entries()),
  );
}

export function buildFileViewRouteSearch(args?: {
  compare?: boolean;
  diff?: boolean;
  review?: boolean;
}): FileViewRouteSearch {
  return {
    compare: args?.compare ? true : undefined,
    diff: args?.diff ? true : undefined,
    review: args?.review ? true : undefined,
  };
}

const vaultFileRouteApi = getRouteApi("/vault/$");

export function useFileViewRouteSearch() {
  return vaultFileRouteApi.useSearch();
}
