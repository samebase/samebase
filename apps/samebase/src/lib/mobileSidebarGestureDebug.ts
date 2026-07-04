export const MOBILE_SIDEBAR_DEBUG_QUERY_PARAM = "swipe-debug";
export const WORKSPACE_MERGE_DEBUG_QUERY_PARAM = "merge-debug";

function hasDebugSearchParam(search: string | URLSearchParams | undefined, key: string): boolean {
  return new URLSearchParams(search).has(key);
}

export function isMobileSidebarDebugEnabled(search: string | URLSearchParams | undefined): boolean {
  return hasDebugSearchParam(search, MOBILE_SIDEBAR_DEBUG_QUERY_PARAM);
}

export function isWorkspaceMergeDebugEnabled(
  search: string | URLSearchParams | undefined,
): boolean {
  return hasDebugSearchParam(search, WORKSPACE_MERGE_DEBUG_QUERY_PARAM);
}
