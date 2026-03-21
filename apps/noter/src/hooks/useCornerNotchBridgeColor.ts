import * as React from "react";
import { type CornerNotchType } from "@/lib/cornerNotch";

function assignForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export function useCornerNotchBridgeColor<T extends HTMLElement>(
  cornerNotch: CornerNotchType | null | undefined,
  forwardedRef: React.ForwardedRef<T>,
  className?: string,
) {
  const localRef = React.useRef<T | null>(null);

  const ref = React.useCallback(
    (node: T | null) => {
      localRef.current = node;
      assignForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = localRef.current;
    if (!element) {
      return;
    }

    if (!cornerNotch) {
      element.style.removeProperty("--noter-corner-notch-bridge-color");
      return;
    }

    const borderColor = window.getComputedStyle(element).borderTopColor;
    element.style.setProperty("--noter-corner-notch-bridge-color", borderColor);
  }, [className, cornerNotch]);

  return ref;
}
