import * as React from "react";
import { type CornerNotchType } from "@/lib/cornerNotch";

const CORNER_BRIDGE_SIZE_VARS = [
  "--samebase-corner-notch-bridge-top-left-size",
  "--samebase-corner-notch-bridge-top-right-size",
  "--samebase-corner-notch-bridge-bottom-right-size",
  "--samebase-corner-notch-bridge-bottom-left-size",
] as const;

function assignForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

function toPixels(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "0px";
  }

  return `${parsed}px`;
}

function clearBridgePaint(element: HTMLElement) {
  element.style.removeProperty("--samebase-corner-notch-bridge-color");
  for (const variableName of CORNER_BRIDGE_SIZE_VARS) {
    element.style.removeProperty(variableName);
  }
}

function syncBridgePaint(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const borderTopWidth = Number.parseFloat(styles.borderTopWidth) || 0;
  const borderRightWidth = Number.parseFloat(styles.borderRightWidth) || 0;
  const borderBottomWidth = Number.parseFloat(styles.borderBottomWidth) || 0;
  const borderLeftWidth = Number.parseFloat(styles.borderLeftWidth) || 0;

  element.style.setProperty("--samebase-corner-notch-bridge-color", styles.borderTopColor);
  element.style.setProperty(
    "--samebase-corner-notch-bridge-top-left-size",
    toPixels(Math.min(borderTopWidth, borderLeftWidth).toString()),
  );
  element.style.setProperty(
    "--samebase-corner-notch-bridge-top-right-size",
    toPixels(Math.min(borderTopWidth, borderRightWidth).toString()),
  );
  element.style.setProperty(
    "--samebase-corner-notch-bridge-bottom-right-size",
    toPixels(Math.min(borderBottomWidth, borderRightWidth).toString()),
  );
  element.style.setProperty(
    "--samebase-corner-notch-bridge-bottom-left-size",
    toPixels(Math.min(borderBottomWidth, borderLeftWidth).toString()),
  );
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
      clearBridgePaint(element);
      return;
    }

    const updateBridgePaint = () => {
      syncBridgePaint(element);
    };

    updateBridgePaint();

    const themeObserver = new MutationObserver(() => {
      updateBridgePaint();
    });

    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    });

    const handleResize = () => {
      updateBridgePaint();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      themeObserver.disconnect();
    };
  }, [className, cornerNotch]);

  return ref;
}
