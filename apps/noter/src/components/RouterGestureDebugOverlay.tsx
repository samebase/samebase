import { GlobalGestureDebugOverlay } from "#src/components/GlobalGestureDebugOverlay.tsx";
import { useLocation } from "@tanstack/react-router";
import { isMobileSidebarDebugEnabled } from "#src/lib/mobileSidebarGestureDebug.ts";

export function RouterGestureDebugOverlay() {
  const search = useLocation({
    select: (location) => location.searchStr,
  });
  const isLocalDebugHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (!import.meta.env.DEV && !isLocalDebugHost) {
    return null;
  }

  return isMobileSidebarDebugEnabled(search) ? (
    <GlobalGestureDebugOverlay />
  ) : null;
}
