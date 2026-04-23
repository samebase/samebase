import { hasQueryParam } from "@/lib/queryParams";

export const MOBILE_SIDEBAR_DEBUG_QUERY_PARAM = "swipe-debug";

export function isMobileSidebarDebugEnabled(
  search: string | URLSearchParams | undefined,
): boolean {
  return hasQueryParam(search, MOBILE_SIDEBAR_DEBUG_QUERY_PARAM);
}
