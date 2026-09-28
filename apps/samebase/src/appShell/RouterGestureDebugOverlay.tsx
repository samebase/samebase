import { GlobalGestureDebugOverlay } from "@/appShell/GlobalGestureDebugOverlay";
import { useLocation } from "@tanstack/react-router";
import { isMobileSidebarDebugEnabled } from "@/appShell/mobileSidebarGestureDebug";

export function RouterGestureDebugOverlay() {
  const search = useLocation({
    select: (location) => location.searchStr,
  });
  const isLocalDebugHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (!import.meta.env.DEV && !isLocalDebugHost) {
    return null;
  }

  return isMobileSidebarDebugEnabled(search) ? <GlobalGestureDebugOverlay /> : null;
}
