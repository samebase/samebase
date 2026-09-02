import { getRouteApi } from "@tanstack/react-router";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { literal } from "@samebase/sure";

const RouteSearchSchema_fileView = defineRouteSearchParams({
  compare: routeSearchPresenceParam({
    access: "access_files_read",
    suggestion: "route",
  }),
  diff: routeSearchPresenceParam({
    access: "access_files_read",
    suggestion: "route",
  }),
  mobileLineNumbers: routeSearchValueParam(literal("1"), {
    access: "access_files_read",
    sampleValue: "1",
    suggestion: "route",
    valueSuggestions: ["1"],
    valueType: "options",
  }),
});

export type FileViewRouteSearch = InferRouteSearch<typeof RouteSearchSchema_fileView>;
export type FileViewRouteSearchPatch = SearchPatch<FileViewRouteSearch>;

const fileViewRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_fileView);

const FILE_VIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  fileViewRouteSearchParamMetadata,
);

export const FILE_VIEW_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  fileViewRouteSearchParamMetadata,
);

export function validateFileViewRouteSearch(search: Record<string, unknown>): FileViewRouteSearch {
  return RouteSearchSchema_fileView.parse(
    normalizeRouteSearchPresenceFlags(search, FILE_VIEW_PRESENCE_SEARCH_KEYS),
  );
}

export function buildFileViewRouteSearch(args?: {
  compare?: boolean;
  diff?: boolean;
}): FileViewRouteSearchPatch {
  return {
    ...(typeof args?.compare === "boolean" ? { compare: args.compare ? true : null } : {}),
    ...(typeof args?.diff === "boolean" ? { diff: args.diff ? true : null } : {}),
  };
}

/**
 * Preserve unrelated route search while updating only the file-view-owned keys
 * on raw `/repo/$` hrefs that still need manually encoded path segments.
 */
export function mergeFileViewRouteSearch(
  search: Record<string, unknown>,
  fileViewSearch: FileViewRouteSearchPatch,
) {
  return applySearchPatch(search, {
    diff: null,
    compare: null,
    mobileLineNumbers: null,
    ...fileViewSearch,
  });
}

/**
 * Preserve the raw encoded `/repo/$` pathname while changing file-view search
 * flags. Relative TanStack navigation can decode branch slashes in this route.
 */
export function buildFileViewSearchHref(args: {
  pathname: string;
  search: Record<string, unknown>;
  fileViewSearch: FileViewRouteSearchPatch;
  hash?: string;
}) {
  return buildPathWithTanStackSearch({
    pathname: args.pathname,
    search: mergeFileViewRouteSearch(args.search, args.fileViewSearch),
    hash: args.hash,
  });
}

const vaultFileRouteApi = getRouteApi("/repo/$");

export function useFileViewRouteSearch() {
  return vaultFileRouteApi.useSearch();
}
