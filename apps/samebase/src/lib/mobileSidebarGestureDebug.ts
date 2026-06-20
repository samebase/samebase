export const MOBILE_SIDEBAR_DEBUG_QUERY_PARAM = "swipe-debug";

export function isMobileSidebarDebugEnabled(search: string | URLSearchParams | undefined): boolean {
  return new URLSearchParams(search).has(MOBILE_SIDEBAR_DEBUG_QUERY_PARAM);
}
