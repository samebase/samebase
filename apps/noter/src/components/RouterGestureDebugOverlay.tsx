import { GlobalGestureDebugOverlay } from "@/components/GlobalGestureDebugOverlay";
import { useLocation } from "@/lib/router";
import { isMobileSidebarDebugEnabled } from "@/lib/mobileSidebarGestureDebug";

export function RouterGestureDebugOverlay() {
  const location = useLocation();
  const isLocalDebugHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (!import.meta.env.DEV && !isLocalDebugHost) {
    return null;
  }

  return isMobileSidebarDebugEnabled(location.search) ? (
    <GlobalGestureDebugOverlay />
  ) : null;
}
