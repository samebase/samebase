import { useEffect, useState } from "react";

const TOUCH_SHEET_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

function getTouchSheetMediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(TOUCH_SHEET_MEDIA_QUERY);
}

/**
 * Prefer bottom sheets on touch-first devices while keeping desktop browsers on
 * lightweight anchored popovers even at narrow widths.
 */
export function useUsesTouchSheet() {
  const [usesTouchSheet, setUsesTouchSheet] = useState(() => {
    const touchDeviceQuery = getTouchSheetMediaQuery();
    if (!touchDeviceQuery) {
      return false;
    }

    return touchDeviceQuery.matches;
  });

  useEffect(() => {
    const touchDeviceQuery = getTouchSheetMediaQuery();
    if (!touchDeviceQuery) {
      return;
    }

    const updateUsesTouchSheet = () => {
      setUsesTouchSheet(touchDeviceQuery.matches);
    };

    updateUsesTouchSheet();
    touchDeviceQuery.addEventListener("change", updateUsesTouchSheet);
    return () => touchDeviceQuery.removeEventListener("change", updateUsesTouchSheet);
  }, []);

  return usesTouchSheet;
}
