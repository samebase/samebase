export const SEARCH_RESET_QUERY_PARAM = "reset";
export const SEARCH_RESET_LINK_LABEL = `?${SEARCH_RESET_QUERY_PARAM}`;

export function isSearchResetValue(value: unknown): boolean {
  return value === true || value === "" || value === "true";
}

export function hasSearchResetParam(
  search: string | URLSearchParams | undefined,
): boolean {
  return new URLSearchParams(search).has(SEARCH_RESET_QUERY_PARAM);
}
