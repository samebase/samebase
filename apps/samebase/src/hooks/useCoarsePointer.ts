import { useEffect, useState } from "react";

const COARSE_POINTER_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

function getCoarsePointerMediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
}

/**
True on touch-first devices (no hover, coarse pointer). Drives touch
conventions such as bottom sheets over anchored popovers and hidden editor
scrollbars, independent of viewport or pane width. Width-driven layout uses
container variants against the workspace pane instead.
*/
export function useCoarsePointer() {
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    const coarsePointerQuery = getCoarsePointerMediaQuery();
    if (!coarsePointerQuery) {
      return false;
    }

    return coarsePointerQuery.matches;
  });

  useEffect(() => {
    const coarsePointerQuery = getCoarsePointerMediaQuery();
    if (!coarsePointerQuery) {
      return;
    }

    const updateIsCoarsePointer = () => {
      setIsCoarsePointer(coarsePointerQuery.matches);
    };

    updateIsCoarsePointer();
    coarsePointerQuery.addEventListener("change", updateIsCoarsePointer);
    return () => coarsePointerQuery.removeEventListener("change", updateIsCoarsePointer);
  }, []);

  return isCoarsePointer;
}
