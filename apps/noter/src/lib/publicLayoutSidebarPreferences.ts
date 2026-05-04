type SearchParamReader = {
  get: (key: string) => string | null;
};
type SearchFlagReader = SearchParamReader | Readonly<Record<string, unknown>>;

export const PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY =
  "noter_public_layout_sidebar_state";
export const PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM = "sidebar-reset";
export const PUBLIC_LAYOUT_SIDEBAR_RESET_LINK_LABEL = `?${PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM}`;

export type PublicLayoutSidebarPreferenceSource = "default" | "local" | "reset";

export const PUBLIC_LAYOUT_SIDEBAR_STORAGE_VALUE_LABELS = {
  default: "missing",
  local: "present",
  reset: "cleared",
} as const satisfies Record<PublicLayoutSidebarPreferenceSource, string>;

function isSearchFlagEnabled(value: unknown): boolean {
  return value === true || value === "" || value === "true";
}

function hasSearchParamReader(
  search: SearchFlagReader,
): search is SearchParamReader {
  return typeof search.get === "function";
}

function hasSearchFlag(search: SearchFlagReader, key: string): boolean {
  const value = hasSearchParamReader(search) ? search.get(key) : search[key];
  return isSearchFlagEnabled(value);
}

export function isPublicLayoutSidebarResetRequested(
  search: SearchFlagReader,
): boolean {
  return hasSearchFlag(search, PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM);
}
