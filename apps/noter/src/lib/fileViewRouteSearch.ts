import { getRouteApi } from "@tanstack/react-router";
import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import { z } from "zod";

const FILE_VIEW_PRESENCE_SEARCH_KEYS = ["compare", "diff", "review"] as const;

function readOptionalMobileLineNumbers(value: unknown): "1" | undefined {
  return value === "1" ? "1" : undefined;
}

const fileViewRouteSearchSchema = z.object({
  compare: z.literal(true).optional(),
  diff: z.literal(true).optional(),
  mobileLineNumbers: z.preprocess(
    readOptionalMobileLineNumbers,
    z.literal("1").optional(),
  ),
  review: z.literal(true).optional(),
});

export type FileViewRouteSearch = z.infer<typeof fileViewRouteSearchSchema>;

export function validateFileViewRouteSearch(
  search: Record<string, unknown>,
): FileViewRouteSearch {
  return fileViewRouteSearchSchema.parse(
    normalizeRouteSearchPresenceFlags(search, FILE_VIEW_PRESENCE_SEARCH_KEYS),
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

/**
 * Preserve unrelated route search while updating only the file-view-owned keys
 * on raw `/vault/$` hrefs that still need manually encoded path segments.
 */
export function mergeFileViewRouteSearch(
  search: Record<string, unknown>,
  fileViewSearch: FileViewRouteSearch,
) {
  return {
    ...search,
    compare: fileViewSearch.compare,
    diff: fileViewSearch.diff,
    mobileLineNumbers: fileViewSearch.mobileLineNumbers,
    review: fileViewSearch.review,
  };
}

const vaultFileRouteApi = getRouteApi("/vault/$");

export function useFileViewRouteSearch() {
  return vaultFileRouteApi.useSearch();
}
