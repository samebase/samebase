export const SEARCH_RESET_QUERY_PARAM = "reset";
export const SEARCH_RESET_LINK_LABEL = `?${SEARCH_RESET_QUERY_PARAM}`;

export function isSearchResetValue(value: unknown): boolean {
  return value !== false && value !== null && typeof value !== "undefined";
}

export function hasSearchResetParam(
  search: string | URLSearchParams | undefined,
): boolean {
  return new URLSearchParams(search).has(SEARCH_RESET_QUERY_PARAM);
}
