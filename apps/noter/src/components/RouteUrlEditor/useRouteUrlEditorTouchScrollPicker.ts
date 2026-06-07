import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Suggestion } from "./RouteUrlEditorSuggestions";

const routeUrlEditorTouchScrollPickerMediaQuery = "(hover: none), (pointer: coarse)";
const routeUrlEditorTouchScrollSlateOptionOffset = 2;

export const routeUrlEditorTouchSuggestionRowHeightPx = 28;
const routeUrlEditorTouchScrollSettleDelayMs = 80;

type RouteUrlEditorTouchScrollPickerMetrics = {
  bottomSpacerHeightPx: number;
  slateTopPx: number;
  topSpacerHeightPx: number;
};

type RouteUrlEditorTouchScrollPickerCommon = {
  enabled: boolean;
  handleSuggestionsScroll: () => void;
  handleSuggestionsTouchStart: () => void;
  handleSuggestionsWheel: () => void;
  resetScrollPosition: () => void;
  suggestionsRef: RefObject<HTMLDivElement | null>;
};

type RouteUrlEditorTouchScrollPicker =
  | (RouteUrlEditorTouchScrollPickerCommon & {
      active: false;
      metrics: null;
    })
  | (RouteUrlEditorTouchScrollPickerCommon & {
      active: true;
      metrics: RouteUrlEditorTouchScrollPickerMetrics;
    });

function readCssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSlateCenterPx(scrollportHeightPx: number): number {
  const rowHalfHeightPx = routeUrlEditorTouchSuggestionRowHeightPx / 2;
  const requestedSlateCenterPx =
    rowHalfHeightPx +
    (routeUrlEditorTouchScrollSlateOptionOffset - 1) * routeUrlEditorTouchSuggestionRowHeightPx;
  const maxSlateCenterPx = Math.max(rowHalfHeightPx, scrollportHeightPx - rowHalfHeightPx);

  return Math.min(Math.max(requestedSlateCenterPx, rowHalfHeightPx), maxSlateCenterPx);
}

function readTouchScrollPickerMetrics(
  scrollport: HTMLElement,
): RouteUrlEditorTouchScrollPickerMetrics {
  const rowHalfHeightPx = routeUrlEditorTouchSuggestionRowHeightPx / 2;
  const scrollportHeightPx = Math.max(0, scrollport.clientHeight);
  const scrollportStyle = window.getComputedStyle(scrollport);
  const scrollportPaddingBottomPx = readCssPx(scrollportStyle.paddingBottom);
  const scrollportPaddingTopPx = readCssPx(scrollportStyle.paddingTop);
  const slateCenterPx = readSlateCenterPx(scrollportHeightPx);
  const topSpacerHeightPx = Math.max(0, slateCenterPx - scrollportPaddingTopPx - rowHalfHeightPx);
  const bottomSpacerHeightPx = Math.max(
    0,
    scrollportHeightPx - scrollportPaddingBottomPx - slateCenterPx - rowHalfHeightPx,
  );

  return {
    bottomSpacerHeightPx,
    slateTopPx: Math.max(0, slateCenterPx - rowHalfHeightPx),
    topSpacerHeightPx,
  };
}

/**
Owns the mobile scroll-picker mechanics for the suggestion list.

Touch lists get spacer rows plus a fixed slate. Scrolling a row under that slate calls
`previewTouchSuggestion`. The same mechanics run for short and long lists so mobile has one
suggestion behavior.
*/
export function useRouteUrlEditorTouchScrollPicker({
  previewTouchSuggestion,
  suggestions,
  suggestionsVisible,
}: {
  previewTouchSuggestion: (suggestion: Suggestion, suggestionIndex: number) => void;
  suggestions: readonly Suggestion[];
  suggestionsVisible: boolean;
}): RouteUrlEditorTouchScrollPicker {
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const touchScrollSettleTimeoutRef = useRef<number | null>(null);
  const touchScrollPickingArmedRef = useRef(false);
  const skipNextTouchScrollEventRef = useRef(false);
  const [touchScrollPickerEnabled, setTouchScrollPickerEnabled] = useState(false);
  const [touchScrollPickerMetrics, setTouchScrollPickerMetrics] =
    useState<RouteUrlEditorTouchScrollPickerMetrics | null>(null);

  const clearTouchScrollSettleTimeout = useCallback(() => {
    if (touchScrollSettleTimeoutRef.current === null || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(touchScrollSettleTimeoutRef.current);
    touchScrollSettleTimeoutRef.current = null;
  }, []);

  const resetScrollPosition = useCallback(() => {
    clearTouchScrollSettleTimeout();
    touchScrollPickingArmedRef.current = false;

    const suggestionsElement = suggestionsRef.current;
    if (!suggestionsElement || suggestionsElement.scrollTop === 0) {
      return;
    }

    skipNextTouchScrollEventRef.current = true;
    suggestionsElement.scrollTop = 0;
  }, [clearTouchScrollSettleTimeout]);

  const handleSuggestionsTouchStart = useCallback(() => {
    touchScrollPickingArmedRef.current = true;
  }, []);

  const handleSuggestionsWheel = useCallback(() => {
    touchScrollPickingArmedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(routeUrlEditorTouchScrollPickerMediaQuery);
    const syncTouchScrollPickerEnabled = () => {
      setTouchScrollPickerEnabled(mediaQuery.matches);
    };

    syncTouchScrollPickerEnabled();
    mediaQuery.addEventListener("change", syncTouchScrollPickerEnabled);

    return () => {
      mediaQuery.removeEventListener("change", syncTouchScrollPickerEnabled);
    };
  }, []);

  useEffect(() => () => clearTouchScrollSettleTimeout(), [clearTouchScrollSettleTimeout]);

  useLayoutEffect(() => {
    if (!touchScrollPickerEnabled || !suggestionsVisible) {
      touchScrollPickingArmedRef.current = false;
      setTouchScrollPickerMetrics(null);
      return;
    }

    const suggestionsElement = suggestionsRef.current;
    if (!suggestionsElement) {
      setTouchScrollPickerMetrics(null);
      return;
    }

    const syncMetrics = () => {
      setTouchScrollPickerMetrics(readTouchScrollPickerMetrics(suggestionsElement));
    };

    syncMetrics();
    window.addEventListener("resize", syncMetrics);

    return () => {
      window.removeEventListener("resize", syncMetrics);
    };
  }, [suggestionsVisible, touchScrollPickerEnabled]);

  const handleSuggestionsScroll = useCallback(() => {
    if (skipNextTouchScrollEventRef.current) {
      skipNextTouchScrollEventRef.current = false;
      return;
    }

    clearTouchScrollSettleTimeout();

    if (
      !touchScrollPickingArmedRef.current ||
      !touchScrollPickerEnabled ||
      touchScrollPickerMetrics === null ||
      !suggestionsVisible ||
      typeof window === "undefined"
    ) {
      return;
    }

    touchScrollSettleTimeoutRef.current = window.setTimeout(() => {
      touchScrollSettleTimeoutRef.current = null;
      const suggestionsElement = suggestionsRef.current;
      if (!suggestionsElement || suggestions.length === 0) {
        return;
      }

      const suggestionIndex = Math.min(
        suggestions.length - 1,
        Math.max(
          0,
          Math.round(suggestionsElement.scrollTop / routeUrlEditorTouchSuggestionRowHeightPx),
        ),
      );
      const suggestion = suggestions[suggestionIndex];
      previewTouchSuggestion(suggestion, suggestionIndex);
    }, routeUrlEditorTouchScrollSettleDelayMs);
  }, [
    clearTouchScrollSettleTimeout,
    previewTouchSuggestion,
    suggestions,
    suggestionsVisible,
    touchScrollPickerEnabled,
    touchScrollPickerMetrics,
  ]);

  const common = {
    enabled: touchScrollPickerEnabled,
    handleSuggestionsScroll,
    handleSuggestionsTouchStart,
    handleSuggestionsWheel,
    resetScrollPosition,
    suggestionsRef,
  };

  if (touchScrollPickerEnabled && touchScrollPickerMetrics !== null) {
    return {
      ...common,
      active: true,
      metrics: touchScrollPickerMetrics,
    };
  }

  return {
    ...common,
    active: false,
    metrics: null,
  };
}
