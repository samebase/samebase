import { GlobalGestureDebugOverlay } from "@/components/GlobalGestureDebugOverlay";
import { useLocation } from "@tanstack/react-router";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { isMobileSidebarDebugEnabled } from "@/lib/mobileSidebarGestureDebug";
import { isLocalRouteHostname } from "@/routing/availability";

export function RouterGestureDebugOverlay() {
  const search = useLocation({
    select: (location) => location.searchStr,
  });

  if (!import.meta.env.DEV && !isLocalRouteHostname(new URL(readIsomorphicOrigin()).hostname)) {
    return null;
  }

  return isMobileSidebarDebugEnabled(search) ? <GlobalGestureDebugOverlay /> : null;
}
