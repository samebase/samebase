import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Suggestion } from "./RouteUrlEditorSuggestions";

const routeUrlEditorTouchScrollPickerMediaQuery = "(hover: none), (pointer: coarse)";
const routeUrlEditorTouchScrollSlateOptionOffset = 2;

export const routeUrlEditorTouchSuggestionRowHeightPx = 28;

type RouteUrlEditorTouchScrollPickerMetrics = {
  bottomSpacerHeightPx: number;
  slateTopPx: number;
  topSpacerHeightPx: number;
};

type RouteUrlEditorTouchSuggestionScrollTarget = {
  scrollTopPx: number;
  suggestionIndex: number;
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
Measures selectable rows in scroll-content coordinates.

Group labels are not suggestions, so rendered positions cannot be derived from flat suggestion
indexes.
*/
function readTouchSuggestionScrollTargets(
  scrollport: HTMLElement,
  slateTopPx: number,
): RouteUrlEditorTouchSuggestionScrollTarget[] {
  const scrollportTopPx = scrollport.getBoundingClientRect().top + scrollport.clientTop;
  const targets: RouteUrlEditorTouchSuggestionScrollTarget[] = [];

  for (const option of scrollport.querySelectorAll<HTMLElement>(
    "[data-route-url-editor-suggestion-index]",
  )) {
    const suggestionIndex = Number(option.dataset["routeUrlEditorSuggestionIndex"]);
    if (!Number.isInteger(suggestionIndex) || suggestionIndex < 0) {
      continue;
    }

    const optionContentTopPx =
      option.getBoundingClientRect().top - scrollportTopPx + scrollport.scrollTop;
    targets.push({
      scrollTopPx: Math.max(0, optionContentTopPx - slateTopPx),
      suggestionIndex,
    });
  }

  return targets;
}

/**
Owns the mobile scroll-picker mechanics for the suggestion list.

Touch lists get spacer rows plus a fixed slate. Scrolling a row under that slate calls
`previewTouchSuggestion`. The same mechanics run for short and long lists so mobile has one
suggestion behavior.
*/
export function useRouteUrlEditorTouchScrollPicker({
  currentSuggestionIndex,
  currentSuggestionScrollEnabled,
  previewedTouchSuggestionIndex,
  previewTouchSuggestion,
  suggestions,
  suggestionsVisible,
}: {
  currentSuggestionIndex: number | null;
  currentSuggestionScrollEnabled: boolean;
  previewedTouchSuggestionIndex: number | null;
  previewTouchSuggestion: (suggestion: Suggestion, suggestionIndex: number) => void;
  suggestions: readonly Suggestion[];
  suggestionsVisible: boolean;
}): RouteUrlEditorTouchScrollPicker {
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const touchScrollPreviewFrameRef = useRef<number | null>(null);
  const previewedTouchSuggestionIndexRef = useRef(previewedTouchSuggestionIndex);
  const touchScrollPickingArmedRef = useRef(false);
  const skipNextTouchScrollEventRef = useRef(false);
  const [touchScrollPickerEnabled, setTouchScrollPickerEnabled] = useState(false);
  const [touchScrollPickerMetrics, setTouchScrollPickerMetrics] =
    useState<RouteUrlEditorTouchScrollPickerMetrics | null>(null);

  const cancelTouchScrollPreviewFrame = useCallback(() => {
    if (touchScrollPreviewFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(touchScrollPreviewFrameRef.current);
    touchScrollPreviewFrameRef.current = null;
  }, []);

  const scrollToSuggestionIndex = useCallback(
    (suggestionIndex: number | null) => {
      cancelTouchScrollPreviewFrame();
      touchScrollPickingArmedRef.current = false;

      const suggestionsElement = suggestionsRef.current;
      if (!suggestionsElement) {
        return;
      }

      let nextScrollTop = 0;
      if (suggestionIndex !== null) {
        const metrics = readTouchScrollPickerMetrics(suggestionsElement);
        const target = readTouchSuggestionScrollTargets(
          suggestionsElement,
          metrics.slateTopPx,
        ).find((candidate) => candidate.suggestionIndex === suggestionIndex);
        if (!target) {
          return;
        }

        nextScrollTop = target.scrollTopPx;
      }

      if (Math.abs(suggestionsElement.scrollTop - nextScrollTop) < 0.5) {
        return;
      }

      skipNextTouchScrollEventRef.current = true;
      suggestionsElement.scrollTop = nextScrollTop;
    },
    [cancelTouchScrollPreviewFrame],
  );

  const resetScrollPosition = useCallback(() => {
    scrollToSuggestionIndex(null);
  }, [scrollToSuggestionIndex]);

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

  useEffect(() => () => cancelTouchScrollPreviewFrame(), [cancelTouchScrollPreviewFrame]);

  useLayoutEffect(() => {
    // A scheduled frame can outlive the render that requested it. Read the current touch-owned
    // preview before the next paint so keyboard and pointer previews cannot leave this guard stale.
    previewedTouchSuggestionIndexRef.current = previewedTouchSuggestionIndex;
  }, [previewedTouchSuggestionIndex]);

  useLayoutEffect(() => {
    if (!touchScrollPickerEnabled || !suggestionsVisible) {
      cancelTouchScrollPreviewFrame();
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
  }, [cancelTouchScrollPreviewFrame, suggestionsVisible, touchScrollPickerEnabled]);

  useLayoutEffect(() => {
    if (
      !currentSuggestionScrollEnabled ||
      !touchScrollPickerEnabled ||
      touchScrollPickerMetrics === null ||
      !suggestionsVisible
    ) {
      return;
    }

    scrollToSuggestionIndex(currentSuggestionIndex);
  }, [
    currentSuggestionScrollEnabled,
    currentSuggestionIndex,
    scrollToSuggestionIndex,
    suggestions,
    suggestionsVisible,
    touchScrollPickerEnabled,
    touchScrollPickerMetrics,
  ]);

  const handleSuggestionsScroll = useCallback(() => {
    if (skipNextTouchScrollEventRef.current) {
      skipNextTouchScrollEventRef.current = false;
      return;
    }

    if (
      !touchScrollPickingArmedRef.current ||
      !touchScrollPickerEnabled ||
      touchScrollPickerMetrics === null ||
      !suggestionsVisible ||
      touchScrollPreviewFrameRef.current !== null
    ) {
      return;
    }

    // Native momentum can send several scroll events in one paint. Read layout once on the next
    // paint so the page follows the slate without waiting for scrolling to stop.
    touchScrollPreviewFrameRef.current = window.requestAnimationFrame(() => {
      touchScrollPreviewFrameRef.current = null;
      if (!touchScrollPickingArmedRef.current) {
        return;
      }

      const suggestionsElement = suggestionsRef.current;
      if (!suggestionsElement || suggestions.length === 0) {
        return;
      }

      const targets = readTouchSuggestionScrollTargets(
        suggestionsElement,
        touchScrollPickerMetrics.slateTopPx,
      );
      let nearestTarget: RouteUrlEditorTouchSuggestionScrollTarget | null = null;
      let nearestDistancePx = Number.POSITIVE_INFINITY;

      for (const target of targets) {
        if (target.suggestionIndex >= suggestions.length) {
          continue;
        }

        const distancePx = Math.abs(suggestionsElement.scrollTop - target.scrollTopPx);
        if (distancePx > nearestDistancePx) {
          continue;
        }

        nearestDistancePx = distancePx;
        nearestTarget = target;
      }

      if (
        nearestTarget === null ||
        nearestTarget.suggestionIndex === previewedTouchSuggestionIndexRef.current
      ) {
        return;
      }

      previewedTouchSuggestionIndexRef.current = nearestTarget.suggestionIndex;
      previewTouchSuggestion(
        suggestions[nearestTarget.suggestionIndex],
        nearestTarget.suggestionIndex,
      );
    });
  }, [
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
