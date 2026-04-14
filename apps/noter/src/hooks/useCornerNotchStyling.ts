import * as React from "react";
import {
  type CornerNotchFamily,
  type CornerNotchType,
} from "@/lib/cornerNotch";

const CORNER_BRIDGE_SIZE_VARS = [
  "--noter-corner-notch-bridge-top-left-size",
  "--noter-corner-notch-bridge-top-right-size",
  "--noter-corner-notch-bridge-bottom-right-size",
  "--noter-corner-notch-bridge-bottom-left-size",
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

function clearClipBridgePaint(element: HTMLElement) {
  element.style.removeProperty("--noter-corner-notch-bridge-color");
  for (const variableName of CORNER_BRIDGE_SIZE_VARS) {
    element.style.removeProperty(variableName);
  }
}

function syncClipBridgePaint(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const borderTopWidth = Number.parseFloat(styles.borderTopWidth) || 0;
  const borderRightWidth = Number.parseFloat(styles.borderRightWidth) || 0;
  const borderBottomWidth = Number.parseFloat(styles.borderBottomWidth) || 0;
  const borderLeftWidth = Number.parseFloat(styles.borderLeftWidth) || 0;

  element.style.setProperty(
    "--noter-corner-notch-bridge-color",
    styles.borderTopColor,
  );
  element.style.setProperty(
    "--noter-corner-notch-bridge-top-left-size",
    toPixels(Math.min(borderTopWidth, borderLeftWidth).toString()),
  );
  element.style.setProperty(
    "--noter-corner-notch-bridge-top-right-size",
    toPixels(Math.min(borderTopWidth, borderRightWidth).toString()),
  );
  element.style.setProperty(
    "--noter-corner-notch-bridge-bottom-right-size",
    toPixels(Math.min(borderBottomWidth, borderRightWidth).toString()),
  );
  element.style.setProperty(
    "--noter-corner-notch-bridge-bottom-left-size",
    toPixels(Math.min(borderBottomWidth, borderLeftWidth).toString()),
  );
}

function clearPixelBorderPaint(element: HTMLElement) {
  element.style.removeProperty("--noter-corner-notch-pixel-border-source");
  element.style.removeProperty("--noter-corner-notch-pixel-focus-filter");
}

function getPixelSvgPath(type: Exclude<CornerNotchType, 0>) {
  if (type === 1) {
    return {
      path: "M0 2h2v2H0zM2 0h2v2H2zM4 2h2v2H4zM2 4h2v2H2z",
      size: 6,
    };
  }

  return {
    path: "M2 2h2v2H2zM4 0h2v2H4zM10 4h2v2h-2zM0 4h2v2H0zM6 0h2v2H6zM8 2h2v2H8zM8 8h2v2H8zM6 10h2v2H6zM0 6h2v2H0zM10 6h2v2h-2zM4 10h2v2H4zM2 8h2v2H2z",
    size: 12,
  };
}

function createPixelBorderImage(
  color: string,
  type: Exclude<CornerNotchType, 0>,
) {
  const { path, size } = getPixelSvgPath(type);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${path}" fill="${color}" /></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function createPixelFocusFilter(color: string) {
  return [
    `drop-shadow(0 1px 0 ${color})`,
    `drop-shadow(0 -1px 0 ${color})`,
    `drop-shadow(1px 0 0 ${color})`,
    `drop-shadow(-1px 0 0 ${color})`,
    `drop-shadow(1px 1px 0 ${color})`,
    `drop-shadow(1px -1px 0 ${color})`,
    `drop-shadow(-1px 1px 0 ${color})`,
    `drop-shadow(-1px -1px 0 ${color})`,
  ].join(" ");
}

function syncPixelBorderPaint(
  element: HTMLElement,
  cornerNotch: Exclude<CornerNotchType, 0>,
) {
  const styles = window.getComputedStyle(element);
  const ringColor = styles.getPropertyValue("--tw-ring-color").trim();
  const borderColor = styles.borderTopColor;

  element.style.setProperty(
    "--noter-corner-notch-pixel-border-source",
    createPixelBorderImage(borderColor, cornerNotch),
  );
  element.style.setProperty(
    "--noter-corner-notch-pixel-focus-filter",
    createPixelFocusFilter(ringColor.length > 0 ? ringColor : borderColor),
  );
}

export function useCornerNotchStyling<T extends HTMLElement>(
  cornerNotch: CornerNotchType | null | undefined,
  family: CornerNotchFamily,
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
      clearClipBridgePaint(element);
      clearPixelBorderPaint(element);
      return;
    }

    const updateNotchPaint = () => {
      if (family === "pixel") {
        clearClipBridgePaint(element);
        syncPixelBorderPaint(element, cornerNotch);
        return;
      }

      clearPixelBorderPaint(element);
      syncClipBridgePaint(element);
    };

    updateNotchPaint();

    const themeObserver = new MutationObserver(() => {
      updateNotchPaint();
    });

    const elementObserver = new MutationObserver(() => {
      updateNotchPaint();
    });

    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    });
    elementObserver.observe(element, {
      attributeFilter: ["class", "style"],
      attributes: true,
    });

    const handleResize = () => {
      updateNotchPaint();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      elementObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [className, cornerNotch, family]);

  return ref;
}
