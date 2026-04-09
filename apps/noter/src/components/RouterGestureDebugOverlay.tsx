import { GlobalGestureDebugOverlay } from "@/components/GlobalGestureDebugOverlay";
import { useLocation } from "@tanstack/react-router";
import { isMobileSidebarDebugEnabled } from "@/lib/mobileSidebarGestureDebug";

export function RouterGestureDebugOverlay() {
  const search = useLocation({
    select: (location) => location.searchStr,
  });
  const hostname =
    typeof window === "undefined" ? null : window.location.hostname;
  const isLocalDebugHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!import.meta.env.DEV && !isLocalDebugHost) {
    return null;
  }

  return isMobileSidebarDebugEnabled(search) ? (
    <GlobalGestureDebugOverlay />
  ) : null;
}
