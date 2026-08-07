import { useEffect, useState } from "react";

const ANY_HOVER_MEDIA_QUERY = "(any-hover: hover)";

function getAnyHoverMediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(ANY_HOVER_MEDIA_QUERY);
}

/**
True when at least one available pointing device can hover. Interaction
fallbacks use this capability instead of viewport width.
*/
export function useCanHover() {
  const [canHover, setCanHover] = useState(() => getAnyHoverMediaQuery()?.matches ?? true);

  useEffect(() => {
    const anyHoverMediaQuery = getAnyHoverMediaQuery();
    if (!anyHoverMediaQuery) {
      return;
    }

    const updateCanHover = () => {
      setCanHover(anyHoverMediaQuery.matches);
    };

    updateCanHover();
    anyHoverMediaQuery.addEventListener("change", updateCanHover);
    return () => anyHoverMediaQuery.removeEventListener("change", updateCanHover);
  }, []);

  return canHover;
}
