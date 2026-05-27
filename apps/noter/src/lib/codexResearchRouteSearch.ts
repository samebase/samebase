import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchNonEmptyString,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const codexResearchRouteSearchSchema = defineRouteSearchParams({
  threadId: routeSearchValueParam(routeSearchNonEmptyString, {
    permission: "admin",
    sampleValue: "sample-thread",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type CodexResearchRouteSearch = InferRouteSearch<typeof codexResearchRouteSearchSchema>;

const codexResearchRouteSearchParamMetadata = readRouteSearchParamMetadata(
  codexResearchRouteSearchSchema,
);

export const CODEX_RESEARCH_ROUTE_SEARCH_PARAM_SUGGESTIONS = readRouteSearchParamSuggestions(
  codexResearchRouteSearchParamMetadata,
  "route",
);

export function validateCodexResearchRouteSearch(
  search: Record<string, unknown>,
): CodexResearchRouteSearch {
  return codexResearchRouteSearchSchema.parse(search);
}

export function buildCodexResearchRouteSearch(
  threadId: string | null | undefined,
): CodexResearchRouteSearch {
  const trimmedThreadId = typeof threadId === "string" ? threadId.trim() : "";
  return trimmedThreadId.length > 0 ? { threadId: trimmedThreadId } : {};
}
