import * as React from "react";
import { type CornerNotchType } from "@/cornerNotch/cornerNotch";

function assignForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

function clearPixelBorderPaint(element: HTMLElement) {
  element.style.removeProperty("--noter-corner-notch-border-source");
  element.style.removeProperty("--noter-corner-notch-focus-filter");
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

function createPixelFocusFilter(color: string, step: string) {
  return [
    `drop-shadow(${step} 0 0 ${color})`,
    `drop-shadow(calc(${step} * -1) 0 0 ${color})`,
    `drop-shadow(0 ${step} 0 ${color})`,
    `drop-shadow(0 calc(${step} * -1) 0 ${color})`,
  ].join(" ");
}

function syncPixelBorderPaint(
  element: HTMLElement,
  cornerNotch: Exclude<CornerNotchType, 0>,
) {
  const styles = window.getComputedStyle(element);
  const borderColor = styles.borderTopColor;
  const ringColor = styles.getPropertyValue("--tw-ring-color").trim();
  const focusStep =
    styles.getPropertyValue("--noter-corner-notch-preview-focus-step").trim() ||
    "1px";

  element.style.setProperty(
    "--noter-corner-notch-border-source",
    createPixelBorderImage(borderColor, cornerNotch),
  );
  element.style.setProperty(
    "--noter-corner-notch-focus-filter",
    createPixelFocusFilter(
      ringColor.length > 0 ? ringColor : borderColor,
      focusStep,
    ),
  );
}

export function useCornerNotchStyling<T extends HTMLElement>(
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
      clearPixelBorderPaint(element);
      return;
    }

    const updateNotchPaint = () => {
      syncPixelBorderPaint(element, cornerNotch);
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
  }, [className, cornerNotch]);

  return ref;
}
