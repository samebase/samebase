import { useEffectEvent, useLayoutEffect, type RefObject } from "react";

export type ElementSize = {
  heightPx: number;
  widthPx: number;
};

export function useElementSize(
  measureRef: RefObject<HTMLElement | null>,
  onElementSizeChange: (elementSize: ElementSize) => void,
) {
  const publishElementSize = useEffectEvent((node: HTMLElement) => {
    const bounds = node.getBoundingClientRect();
    onElementSizeChange({
      heightPx: Math.max(0, Math.round(bounds.height)),
      widthPx: Math.max(0, Math.round(bounds.width)),
    });
  });

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }

    const updateElementSize = () => {
      publishElementSize(node);
    };

    updateElementSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateElementSize);
      return () => {
        window.removeEventListener("resize", updateElementSize);
      };
    }

    const resizeObserver = new ResizeObserver(updateElementSize);
    resizeObserver.observe(node);
    window.addEventListener("resize", updateElementSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateElementSize);
    };
  }, [measureRef]);
}
