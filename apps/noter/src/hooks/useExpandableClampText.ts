import { useEffect, useRef, useState, type RefObject } from "react";

type UseExpandableClampTextOptions = {
  text: string | null;
  defaultExpanded?: boolean;
  lineClamp?: number;
};

type ExpandableClampTextState = {
  isExpandable: boolean;
  isExpanded: boolean;
  measurementRef: RefObject<HTMLDivElement | null>;
  toggleExpanded: () => void;
};

/**
 * Measure the unclamped rendered block so callers only render an expansion
 * affordance when the visible line clamp actually hides part of the text.
 */
export function useExpandableClampText(
  options: UseExpandableClampTextOptions,
): ExpandableClampTextState {
  const { defaultExpanded = false, lineClamp = 2, text } = options;
  const measurementRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isExpandable, setIsExpandable] = useState(false);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, text]);

  useEffect(() => {
    if (!text) {
      setIsExpandable(false);
      return;
    }

    const measurementNode = measurementRef.current;
    if (!measurementNode) {
      setIsExpandable(false);
      return;
    }

    const updateIsExpandable = () => {
      const measuredHeight = measurementNode.getBoundingClientRect().height;
      const lineHeight = Number.parseFloat(window.getComputedStyle(measurementNode).lineHeight);

      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setIsExpandable(false);
        return;
      }

      setIsExpandable(measuredHeight > lineHeight * lineClamp + 1);
    };

    updateIsExpandable();

    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", updateIsExpandable);
      return () => {
        window.removeEventListener("resize", updateIsExpandable);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateIsExpandable();
    });
    resizeObserver.observe(measurementNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [lineClamp, text]);

  return {
    isExpandable,
    isExpanded,
    measurementRef,
    toggleExpanded: () => {
      setIsExpanded((current) => !current);
    },
  };
}
