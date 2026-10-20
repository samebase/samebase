import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeToMobileViewport(onViewportChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onViewportChange);
  return () => mql.removeEventListener("change", onViewportChange);
}

function readIsMobileViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function readServerIsMobileViewport() {
  return false;
}

/**
The server cannot measure the viewport, so the server and hydration renders use the desktop
variant; later renders read the viewport width.
*/
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileViewport,
    readIsMobileViewport,
    readServerIsMobileViewport,
  );
}
