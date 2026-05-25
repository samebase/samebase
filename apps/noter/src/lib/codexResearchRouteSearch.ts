import {
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { z } from "zod";

function readOptionalThreadId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const codexResearchRouteSearchSchema = z.object({
  threadId: routeSearchValueParam(z.preprocess(readOptionalThreadId, z.string().optional()), {
    permission: "admin",
    suggestion: "route",
  }),
});

export type CodexResearchRouteSearch = z.infer<typeof codexResearchRouteSearchSchema>;

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
