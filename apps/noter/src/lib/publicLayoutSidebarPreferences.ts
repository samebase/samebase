type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

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

function hasSearchFlag(search: SearchFlagReader, key: string): boolean {
  if (search instanceof URLSearchParams) {
    return search.has(key);
  }

  const value = search[key];
  return value === true || value === "" || value === "true";
}

export function isPublicLayoutSidebarResetRequested(
  search: SearchFlagReader,
): boolean {
  return hasSearchFlag(search, PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM);
}
