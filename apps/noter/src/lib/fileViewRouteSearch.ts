import { getRouteApi } from "@tanstack/react-router";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchAcceptedKeys,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchPresenceParam,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { literal } from "@samebase/sure";

const RouteSearchSchema_fileView = defineRouteSearchParams({
  compare: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  diff: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
  mobileLineNumbers: routeSearchValueParam(literal("1"), {
    permission: "admin",
    sampleValue: "1",
    suggestion: "route",
    valueSuggestions: ["1"],
    valueType: "options",
  }),
  review: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "route",
  }),
});

export type FileViewRouteSearch = InferRouteSearch<typeof RouteSearchSchema_fileView>;
export type FileViewRouteSearchPatch = SearchPatch<FileViewRouteSearch>;

const fileViewRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_fileView);

const FILE_VIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  fileViewRouteSearchParamMetadata,
);

export const FILE_VIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  fileViewRouteSearchParamMetadata,
  "route",
);

export const FILE_VIEW_ROUTE_SEARCH_KEYS = readRouteSearchAcceptedKeys(RouteSearchSchema_fileView);

export function validateFileViewRouteSearch(search: Record<string, unknown>): FileViewRouteSearch {
  return RouteSearchSchema_fileView.parse(
    normalizeRouteSearchPresenceFlags(search, FILE_VIEW_PRESENCE_SEARCH_KEYS),
  );
}

export function buildFileViewRouteSearch(args?: {
  compare?: boolean;
  diff?: boolean;
  review?: boolean;
}): FileViewRouteSearchPatch {
  return {
    ...(typeof args?.compare === "boolean" ? { compare: args.compare ? true : null } : {}),
    ...(typeof args?.diff === "boolean" ? { diff: args.diff ? true : null } : {}),
    ...(typeof args?.review === "boolean" ? { review: args.review ? true : null } : {}),
  };
}

/**
 * Preserve unrelated route search while updating only the file-view-owned keys
 * on raw `/vault/$` hrefs that still need manually encoded path segments.
 */
export function mergeFileViewRouteSearch(
  search: Record<string, unknown>,
  fileViewSearch: FileViewRouteSearchPatch,
) {
  return applySearchPatch(search, {
    compare: null,
    diff: null,
    mobileLineNumbers: null,
    review: null,
    ...fileViewSearch,
  });
}

/**
 * Preserve the raw encoded `/vault/$` pathname while changing file-view search
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

const vaultFileRouteApi = getRouteApi("/vault/$");

export function useFileViewRouteSearch() {
  return vaultFileRouteApi.useSearch();
}
