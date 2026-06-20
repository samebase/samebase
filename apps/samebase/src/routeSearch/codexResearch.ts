import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

const RouteSearchSchema_codexResearch = defineRouteSearchParams({
  threadId: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "sample-thread",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type CodexResearchRouteSearch = InferRouteSearch<typeof RouteSearchSchema_codexResearch>;

const codexResearchRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_codexResearch,
);

export const CODEX_RESEARCH_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  codexResearchRouteSearchParamMetadata,
);

export function validateCodexResearchRouteSearch(
  search: Record<string, unknown>,
): CodexResearchRouteSearch {
  return RouteSearchSchema_codexResearch.parse(search);
}

export function buildCodexResearchRouteSearch(
  threadId: string | null | undefined,
): CodexResearchRouteSearch {
  const trimmedThreadId = typeof threadId === "string" ? threadId.trim() : "";
  return trimmedThreadId.length > 0 ? { threadId: trimmedThreadId } : {};
}
