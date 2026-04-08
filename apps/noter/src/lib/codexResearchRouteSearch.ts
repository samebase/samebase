export type CodexResearchRouteSearch = {
  threadId?: string;
};

function readOptionalThreadId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function validateCodexResearchRouteSearch(
  search: Record<string, unknown>,
): CodexResearchRouteSearch {
  const threadId = readOptionalThreadId(search.threadId);

  return typeof threadId === "string" ? { threadId } : {};
}

export function buildCodexResearchRouteSearch(
  threadId: string | null | undefined,
): CodexResearchRouteSearch {
  const trimmedThreadId = typeof threadId === "string" ? threadId.trim() : "";
  return trimmedThreadId.length > 0 ? { threadId: trimmedThreadId } : {};
}
