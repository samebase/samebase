import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchAcceptedKeys,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchNonEmptyString,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

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

export const CODEX_RESEARCH_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  codexResearchRouteSearchParamMetadata,
  "route",
);

export const CODEX_RESEARCH_ROUTE_SEARCH_KEYS = readRouteSearchAcceptedKeys(
  RouteSearchSchema_codexResearch,
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
