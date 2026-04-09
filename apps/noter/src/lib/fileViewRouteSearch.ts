import { getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { setQueryParam, updateQueryParams } from "./queryParams";

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

/**
 * Preserve unrelated query params while updating only the file-view-owned
 * search keys on the raw `/vault/$` route boundary.
 */
export function mergeFileViewRouteSearch(
  search: string | URLSearchParams | undefined,
  fileViewSearch: FileViewRouteSearch,
): URLSearchParams {
  return updateQueryParams(search, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "compare", fileViewSearch.compare);
    setQueryParam(nextSearchParams, "diff", fileViewSearch.diff);
    setQueryParam(
      nextSearchParams,
      "mobileLineNumbers",
      fileViewSearch.mobileLineNumbers,
    );
    setQueryParam(nextSearchParams, "review", fileViewSearch.review);
  });
}

const vaultFileRouteApi = getRouteApi("/vault/$");

export function useFileViewRouteSearch() {
  return vaultFileRouteApi.useSearch();
}
