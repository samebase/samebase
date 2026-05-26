import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import {
  ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_ATTRIBUTES,
  readRouteUrlEditorDocumentHashSuggestionKeys,
} from "@/lib/routeUrlEditorHashSuggestions";
import {
  applyRouteUrlEditorSuggestion,
  isRouteUrlEditorRouteUpdateReady,
  readRouteUrlEditorRouteUpdateDraft,
  readRouteUrlEditorSuggestionKind,
  readRouteUrlEditorSuggestions,
  type RouteUrlEditorSuggestion,
  type RouteUrlEditorSuggestionKind,
} from "@/lib/routeUrlEditorSuggestions";
import { RETAINED_ROOT_SEARCH_KEYS, validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { isRouteUrlPathReadyForNavigation } from "@/lib/routeUrlPathSuggestions";
import { api } from "../../convex/_generated/api";

const routeUrlEditorIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

// iOS WebKit zooms focused text controls below 16 CSS px, which breaks the route editor chrome.
const routeUrlEditorInputClassName =
  "h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-base leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive";

const routeUrlEditorBlurredInputClassName = `${routeUrlEditorInputClassName} cursor-text hover:bg-muted`;

const routeUrlEditorSuggestionsPopoverClassName =
  "absolute inset-x-1 top-full z-50 mt-1 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10";

const routeUrlEditorTouchSuggestionsPopoverClassName =
  "absolute inset-x-1 top-full z-50 mt-1 overflow-hidden rounded-md bg-background/35 text-popover-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-sm";

const routeUrlEditorSuggestionsScrollportClassName = "relative max-h-72 overflow-y-auto py-1";

const routeUrlEditorTouchSuggestionsScrollportClassName =
  "relative max-h-[min(18rem,calc(100dvh-4rem))] overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const routeUrlEditorTouchScrollSlateClassName =
  "pointer-events-none absolute inset-x-0 z-10 bg-accent/80 ring-1 ring-ring/30";

const routeUrlEditorTouchScrollPickerMediaQuery = "(hover: none), (pointer: coarse)";
const routeUrlEditorSuggestionRowHeightPx = 28;
const routeUrlEditorTouchScrollSlateOptionOffset = 2;

type RouteUrlEditorTouchScrollPickerMetrics = {
  bottomSpacerHeightPx: number;
  slateTopPx: number;
  topSpacerHeightPx: number;
};

type RouteUrlEditorSuggestionState = {
  activeIndex: number | null;
  baseRouteAddress: string;
  dismissed: boolean;
  draftEditedSinceFocus: boolean;
  kind: RouteUrlEditorSuggestionKind;
  selectionRouteIndex: number;
};

type RouteUrlEditorPointerPreviewBase = {
  draftRouteAddress: string;
  href: string;
  previewBaseHrefBeforePointerPreview: string | null;
};

function getRouteUrlEditorSuggestionButtonClassName(active: boolean): string {
  return active
    ? "flex h-7 w-full min-w-0 items-center bg-accent px-2 font-mono text-sm text-accent-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
    : "flex h-7 w-full min-w-0 items-center px-2 font-mono text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";
}

function getRouteUrlEditorSuggestionDetailClassName(active: boolean): string {
  return active
    ? "ml-auto shrink-0 pl-3 text-accent-foreground/75"
    : "ml-auto shrink-0 pl-3 text-muted-foreground";
}

function getRouteUrlEditorSuggestionSampleValueClassName(active: boolean): string {
  return active ? "text-accent-foreground/60" : "text-muted-foreground";
}

function readRouteUrlEditorSuggestionLabel(suggestion: RouteUrlEditorSuggestion): string {
  return typeof suggestion.detail === "string"
    ? `${suggestion.value} ${suggestion.detail}`
    : suggestion.value;
}

function renderRouteUrlEditorSuggestionValue(
  suggestion: RouteUrlEditorSuggestion,
  active: boolean,
) {
  if (suggestion.kind !== "search" || suggestion.valueKind !== "value") {
    return suggestion.value;
  }

  const valueStart = suggestion.value.indexOf("=");
  if (valueStart === -1 || valueStart === suggestion.value.length - 1) {
    return suggestion.value;
  }

  return (
    <>
      {suggestion.value.slice(0, valueStart + 1)}
      <span className={getRouteUrlEditorSuggestionSampleValueClassName(active)}>
        {suggestion.value.slice(valueStart + 1)}
      </span>
    </>
  );
}

function readRouteUrlEditorSuggestionOptionId(args: {
  index: number;
  suggestionsId: string;
}): string {
  return `${args.suggestionsId}-${args.index}`;
}

function readRouteUrlEditorOrigin(): string {
  return typeof window === "undefined" ? "https://noter.local" : window.location.origin;
}

function areRouteUrlEditorHashSuggestionKeysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (const [index, value] of left.entries()) {
    if (value !== right[index]) {
      return false;
    }
  }

  return true;
}

function areRouteUrlEditorTouchScrollPickerMetricsEqual(
  left: RouteUrlEditorTouchScrollPickerMetrics | null,
  right: RouteUrlEditorTouchScrollPickerMetrics,
): boolean {
  return (
    left !== null &&
    left.bottomSpacerHeightPx === right.bottomSpacerHeightPx &&
    left.slateTopPx === right.slateTopPx &&
    left.topSpacerHeightPx === right.topSpacerHeightPx
  );
}

function readRouteUrlEditorCssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRouteUrlEditorTouchScrollSlateCenterPx(scrollportHeightPx: number): number {
  const rowHalfHeightPx = routeUrlEditorSuggestionRowHeightPx / 2;
  const requestedSlateCenterPx =
    rowHalfHeightPx +
    (routeUrlEditorTouchScrollSlateOptionOffset - 1) * routeUrlEditorSuggestionRowHeightPx;
  const maxSlateCenterPx = Math.max(rowHalfHeightPx, scrollportHeightPx - rowHalfHeightPx);

  return Math.min(Math.max(requestedSlateCenterPx, rowHalfHeightPx), maxSlateCenterPx);
}

function readRouteUrlEditorTouchScrollPickerMetrics(
  scrollport: HTMLElement,
): RouteUrlEditorTouchScrollPickerMetrics {
  const rowHalfHeightPx = routeUrlEditorSuggestionRowHeightPx / 2;
  const scrollportHeightPx = Math.max(0, scrollport.clientHeight);
  const scrollportStyle = window.getComputedStyle(scrollport);
  const scrollportPaddingBottomPx = readRouteUrlEditorCssPx(scrollportStyle.paddingBottom);
  const scrollportPaddingTopPx = readRouteUrlEditorCssPx(scrollportStyle.paddingTop);
  const slateCenterPx = readRouteUrlEditorTouchScrollSlateCenterPx(scrollportHeightPx);

  return {
    bottomSpacerHeightPx: Math.max(
      0,
      scrollportHeightPx - scrollportPaddingBottomPx - slateCenterPx - rowHalfHeightPx,
    ),
    slateTopPx: Math.max(0, slateCenterPx - rowHalfHeightPx),
    topSpacerHeightPx: Math.max(0, slateCenterPx - scrollportPaddingTopPx - rowHalfHeightPx),
  };
}

type RouteUrlEditorInputSelectionDirection = "backward" | "forward" | "none";

type RouteUrlEditorInputSelection = {
  direction: RouteUrlEditorInputSelectionDirection;
  end: number;
  start: number;
};

function readRouteUrlEditorInputSelection(
  input: HTMLInputElement,
): RouteUrlEditorInputSelection | null {
  const { selectionDirection, selectionEnd, selectionStart } = input;
  if (selectionStart === null || selectionEnd === null) {
    return null;
  }

  const direction =
    selectionDirection === "backward" || selectionDirection === "forward"
      ? selectionDirection
      : "none";

  return {
    direction,
    end: selectionEnd,
    start: selectionStart,
  };
}

function restoreRouteUrlEditorRejectedInput(args: {
  input: HTMLInputElement;
  selection: RouteUrlEditorInputSelection | null;
  value: string;
}): void {
  args.input.value = args.value;

  if (!args.selection) {
    return;
  }

  const start = Math.min(args.selection.start, args.value.length);
  const end = Math.min(args.selection.end, args.value.length);
  args.input.setSelectionRange(start, end, args.selection.direction);
}

function readRouteUrlEditorDraftRouteAddress(args: {
  inputValue: string;
  origin: string;
}): string | null {
  const enforcedInputPrefix = `${args.origin}/`;
  if (!args.inputValue.startsWith(enforcedInputPrefix)) {
    return null;
  }

  return `/${args.inputValue.slice(enforcedInputPrefix.length)}`;
}

type RouteUrlEditorRouteBoundaryBackspace = {
  inputValue: string;
  routeAddress: string;
  selectionOffset: number;
};

// Modified Backspace can delete across the origin text; keep origin + slash
// immutable and delete only route-owned text after that boundary.
function readRouteUrlEditorRouteBoundaryBackspace(args: {
  input: HTMLInputElement;
  origin: string;
}): RouteUrlEditorRouteBoundaryBackspace | null {
  const selection = readRouteUrlEditorInputSelection(args.input);
  if (!selection) {
    return null;
  }

  const routeInputPrefix = `${args.origin}/`;
  const deleteEnd = Math.max(selection.start, selection.end, routeInputPrefix.length);
  const inputValue = `${routeInputPrefix}${args.input.value.slice(deleteEnd)}`;
  const routeAddress = readRouteUrlEditorDraftRouteAddress({
    inputValue,
    origin: args.origin,
  });

  if (routeAddress === null) {
    return null;
  }

  return {
    inputValue,
    routeAddress,
    selectionOffset: routeInputPrefix.length,
  };
}

function readRouteUrlEditorInputRouteIndex(args: {
  input: HTMLInputElement;
  origin: string;
  routeAddress: string;
}): number {
  const selectionStart = args.input.selectionStart ?? args.input.value.length;
  const routeIndex = selectionStart - args.origin.length;
  return Math.min(Math.max(routeIndex, 0), args.routeAddress.length);
}

type RouteUrlEditorCommitMode = "route-options" | "route-navigation";

type RouteUrlEditorSuggestionFollowup = {
  draftRouteAddress: string;
  kind: "search" | "search-value";
  selectionRouteIndex: number;
};

type RouteUrlEditorCommitOptions = {
  commitPreviewToHistory: boolean;
  replaceRouteOptions: boolean;
  resetIncompleteDraft: boolean;
};

function getRouteUrlEditorCommitMode(args: {
  currentHref: string;
  nextHref: string;
  origin: string;
}): RouteUrlEditorCommitMode {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentHref, appOrigin);
  const nextUrl = new URL(args.nextHref, appOrigin);

  return currentUrl.pathname === nextUrl.pathname ? "route-options" : "route-navigation";
}

function readRouteUrlEditorHash(url: URL): string {
  return url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
}

function readRouteUrlEditorSearchDraftSelectionRouteIndex(routeAddress: string): number {
  const hashIndex = routeAddress.indexOf("#");
  return hashIndex === -1 ? routeAddress.length : hashIndex;
}

function readRouteUrlEditorSearchTriggerDraft(routeAddress: string): string {
  const hashIndex = routeAddress.indexOf("#");
  const searchIndex = routeAddress.indexOf("?");
  if (searchIndex !== -1 && (hashIndex === -1 || searchIndex < hashIndex)) {
    return routeAddress;
  }

  if (hashIndex === -1) {
    return `${routeAddress}?`;
  }

  return `${routeAddress.slice(0, hashIndex)}?${routeAddress.slice(hashIndex)}`;
}

// Keep the committed query exact while opening a local empty token before any hash.
function readRouteUrlEditorNextSearchDraft(routeAddress: string): string {
  const hashIndex = routeAddress.indexOf("#");
  const searchIndex = routeAddress.indexOf("?");
  if (searchIndex === -1 || (hashIndex !== -1 && searchIndex > hashIndex)) {
    return routeAddress;
  }

  const searchEnd = hashIndex === -1 ? routeAddress.length : hashIndex;
  if (routeAddress.slice(searchIndex + 1, searchEnd).endsWith("&")) {
    return routeAddress;
  }

  if (hashIndex === -1) {
    return `${routeAddress}&`;
  }

  return `${routeAddress.slice(0, hashIndex)}&${routeAddress.slice(hashIndex)}`;
}

function restoreRouteUrlEditorInputSelection(args: {
  input: HTMLInputElement;
  origin: string;
  selectionRouteIndex: number;
}): void {
  const selectionIndex = args.origin.length + args.selectionRouteIndex;
  const restoreSelection = () => {
    if (
      !args.input.isConnected ||
      (typeof document !== "undefined" && document.activeElement !== args.input)
    ) {
      return;
    }

    args.input.setSelectionRange(selectionIndex, selectionIndex);
  };

  if (typeof window === "undefined") {
    restoreSelection();
    return;
  }

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(restoreSelection);
    return;
  }

  window.setTimeout(restoreSelection, 0);
}

/**
 * readRouteUrlEditorExactSearch keeps RETAINED_ROOT_SEARCH_KEYS exact by
 * returning undefined tombstones when the user removes a retained key.
 */
function readRouteUrlEditorExactSearch(args: {
  currentHref: string;
  nextHref: string;
  origin: string;
}): Record<string, unknown> {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentHref, appOrigin);
  const nextUrl = new URL(args.nextHref, appOrigin);
  const nextSearch: Record<string, unknown> =
    nextUrl.pathname === "/"
      ? validateRootRouteSearch(parseTanStackSearch(nextUrl.search))
      : parseTanStackSearch(nextUrl.search);

  for (const key of RETAINED_ROOT_SEARCH_KEYS) {
    if (currentUrl.searchParams.has(key) && !nextUrl.searchParams.has(key)) {
      nextSearch[key] = undefined;
    }
  }

  return nextSearch;
}

/**
 * Displays route reality separately from the focused local draft. Valid edits
 * apply while typing, but router normalization does not replace the draft text
 * until the user leaves the field.
 */
export function RouteUrlEditor() {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const currentRouteHistoryIndex = location.state.__TSR_index;
  const inputId = useId();
  const suggestionsId = `${inputId}-suggestions`;
  const [forwardRouteHistoryIndex, setForwardRouteHistoryIndex] =
    useState(currentRouteHistoryIndex);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputSelectionBeforeChangeRef = useRef<RouteUrlEditorInputSelection | null>(null);
  const touchScrollPreviewFrameRef = useRef<number | null>(null);
  const touchScrollPreviewCommitPendingRef = useRef(false);
  const touchScrollPreviewDraftRouteAddressRef = useRef<string | null>(null);
  // Preview replaces the current entry; explicit selection restores this base
  // before pushing the selected URL so Back returns to the pre-preview page.
  const previewBaseHrefRef = useRef<string | null>(null);
  const pointerPreviewBaseRef = useRef<RouteUrlEditorPointerPreviewBase | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  // Keyboard edits can render suggestions under a stationary cursor; hover previews resume after pointer movement.
  const suppressSuggestionMousePreviewUntilMoveRef = useRef(false);
  // Arrow-key previews rewrite the input value, while suggestions stay anchored
  // to the text the user typed until they type, click, blur, or commit.
  const suggestionPreviewActiveRef = useRef(false);
  const origin = readRouteUrlEditorOrigin();
  const [draftRouteAddress, setDraftRouteAddress] = useState(currentHref);
  const [inputFocused, setInputFocused] = useState(false);
  const [touchScrollPickerEnabled, setTouchScrollPickerEnabled] = useState(false);
  const [touchScrollPickerMetrics, setTouchScrollPickerMetrics] =
    useState<RouteUrlEditorTouchScrollPickerMetrics | null>(null);
  // The draft can temporarily be a highlighted suggestion; this is the
  // user-edited URL that filters the suggestion list.
  const [suggestionState, setSuggestionState] = useState<RouteUrlEditorSuggestionState>({
    activeIndex: null,
    baseRouteAddress: currentHref,
    dismissed: false,
    draftEditedSinceFocus: false,
    kind: "path",
    selectionRouteIndex: 0,
  });
  const [documentHashSuggestionKeys, setDocumentHashSuggestionKeys] = useState<readonly string[]>(
    [],
  );
  const {
    activeIndex: activeSuggestionIndex,
    baseRouteAddress: suggestionBaseRouteAddress,
    dismissed: suggestionsDismissed,
    draftEditedSinceFocus: suggestionDraftEditedSinceFocus,
    kind: suggestionKind,
    selectionRouteIndex,
  } = suggestionState;
  const viewerIsAdmin = useQuery(api.users.isCurrentUserAdmin);
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? inputValue : `${origin}${draftHref}`;
  const suggestionCurrentHref = previewBaseHrefRef.current ?? currentHref;
  const suggestions = readRouteUrlEditorSuggestions({
    currentHref: suggestionCurrentHref,
    draftEditedSinceFocus: suggestionDraftEditedSinceFocus,
    draftRouteAddress: suggestionBaseRouteAddress,
    hashKeys: documentHashSuggestionKeys,
    kind: suggestionKind,
    origin,
    routesByPath: router.routesByPath,
    selectionRouteIndex,
    viewer: { isAdmin: viewerIsAdmin === true },
  });
  const suggestionsVisible = inputFocused && !suggestionsDismissed && suggestions.length > 0;
  const touchScrollPickerVisible = touchScrollPickerEnabled && touchScrollPickerMetrics !== null;
  const activeSuggestion =
    activeSuggestionIndex === null ? undefined : suggestions[activeSuggestionIndex];
  const activeSuggestionId =
    suggestionsVisible && activeSuggestionIndex !== null
      ? readRouteUrlEditorSuggestionOptionId({
          index: activeSuggestionIndex,
          suggestionsId,
        })
      : undefined;

  const canGoBack = currentRouteHistoryIndex > 0;
  const canGoForward = currentRouteHistoryIndex < forwardRouteHistoryIndex;
  const patchSuggestionState = useCallback((nextState: Partial<RouteUrlEditorSuggestionState>) => {
    setSuggestionState((currentState) => ({ ...currentState, ...nextState }));
  }, []);

  // TanStack writes __TSR_index into each route entry; keep the largest seen
  // index so Forward only enables after this chrome has observed one.
  useEffect(
    () =>
      router.history.subscribe(({ action, location: nextLocation }) => {
        const nextHistoryIndex = nextLocation.state.__TSR_index;
        setForwardRouteHistoryIndex((currentForwardHistoryIndex) => {
          if (action.type === "PUSH") {
            return nextHistoryIndex;
          }

          if (action.type === "FORWARD" || action.type === "GO") {
            return Math.max(currentForwardHistoryIndex, nextHistoryIndex);
          }

          return currentForwardHistoryIndex;
        });
      }),
    [router],
  );

  // Links and Back/Forward change URL reality. Keep an untouched focused input
  // aligned with the route while preserving user-edited local drafts.
  useEffect(() => {
    if (inputFocused && suggestionDraftEditedSinceFocus) {
      return;
    }

    setDraftRouteAddress(currentHref);
    patchSuggestionState({ baseRouteAddress: currentHref });
  }, [currentHref, inputFocused, patchSuggestionState, suggestionDraftEditedSinceFocus]);

  useEffect(() => {
    setSuggestionState((currentState) => {
      if (!suggestionsVisible) {
        return currentState.activeIndex === null
          ? currentState
          : { ...currentState, activeIndex: null };
      }

      if (currentState.activeIndex === null) {
        return currentState;
      }

      const nextActiveIndex = Math.min(currentState.activeIndex, suggestions.length - 1);
      return nextActiveIndex === currentState.activeIndex
        ? currentState
        : { ...currentState, activeIndex: nextActiveIndex };
    });
  }, [suggestions.length, suggestionsVisible]);

  useEffect(() => {
    if (!activeSuggestionId) {
      return;
    }

    document.getElementById(activeSuggestionId)?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionId]);

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

  useEffect(
    () => () => {
      if (touchScrollPreviewFrameRef.current === null || typeof window === "undefined") {
        return;
      }

      window.cancelAnimationFrame(touchScrollPreviewFrameRef.current);
      touchScrollPreviewFrameRef.current = null;
    },
    [],
  );

  // The mobile picker uses extra scroll space so the first and last options can
  // pass through the fixed slate instead of sticking to the scrollport edges.
  useLayoutEffect(() => {
    if (!touchScrollPickerEnabled || !suggestionsVisible) {
      setTouchScrollPickerMetrics(null);
      return;
    }

    const suggestionsElement = suggestionsRef.current;
    if (!suggestionsElement || typeof window === "undefined") {
      return;
    }

    const syncMetrics = () => {
      const nextMetrics = readRouteUrlEditorTouchScrollPickerMetrics(suggestionsElement);
      setTouchScrollPickerMetrics((currentMetrics) =>
        areRouteUrlEditorTouchScrollPickerMetricsEqual(currentMetrics, nextMetrics)
          ? currentMetrics
          : nextMetrics,
      );
    };

    syncMetrics();
    window.addEventListener("resize", syncMetrics);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", syncMetrics);
      };
    }

    const observer = new ResizeObserver(syncMetrics);
    observer.observe(suggestionsElement);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncMetrics);
    };
  }, [suggestionsVisible, touchScrollPickerEnabled]);

  const goBack = useCallback(() => {
    router.history.back();
  }, [router]);

  const goForward = useCallback(() => {
    router.history.forward();
  }, [router]);

  const refreshDocumentHashSuggestionKeys = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const nextKeys = readRouteUrlEditorDocumentHashSuggestionKeys(document);
    setDocumentHashSuggestionKeys((currentKeys) =>
      areRouteUrlEditorHashSuggestionKeysEqual(currentKeys, nextKeys) ? currentKeys : nextKeys,
    );
  }, []);

  const rememberInputSelection = useCallback((event: SyntheticEvent<HTMLInputElement>) => {
    inputSelectionBeforeChangeRef.current = readRouteUrlEditorInputSelection(event.currentTarget);
  }, []);

  const syncSuggestionSelection = useCallback(
    (input: HTMLInputElement, routeAddress: string) => {
      inputSelectionBeforeChangeRef.current = readRouteUrlEditorInputSelection(input);
      const nextSelectionRouteIndex = readRouteUrlEditorInputRouteIndex({
        input,
        origin,
        routeAddress,
      });
      patchSuggestionState({
        activeIndex: null,
        baseRouteAddress: routeAddress,
        kind: readRouteUrlEditorSuggestionKind(routeAddress, nextSelectionRouteIndex),
        selectionRouteIndex: nextSelectionRouteIndex,
      });
    },
    [origin, patchSuggestionState],
  );

  useEffect(() => {
    refreshDocumentHashSuggestionKeys();
  }, [currentHref, refreshDocumentHashSuggestionKeys]);

  // A page scroll gesture means the user left URL editing; gestures inside
  // suggestions stay editor-owned so long lists remain usable.
  useEffect(() => {
    if (!inputFocused || typeof window === "undefined") {
      return;
    }

    const blurInputOnPageScrollGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && formRef.current?.contains(target)) {
        return;
      }

      inputRef.current?.blur();
    };

    window.addEventListener("touchmove", blurInputOnPageScrollGesture, true);
    window.addEventListener("wheel", blurInputOnPageScrollGesture, true);

    return () => {
      window.removeEventListener("touchmove", blurInputOnPageScrollGesture, true);
      window.removeEventListener("wheel", blurInputOnPageScrollGesture, true);
    };
  }, [inputFocused]);

  useEffect(() => {
    if (
      !inputFocused ||
      typeof document === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }

    refreshDocumentHashSuggestionKeys();
    const observer = new MutationObserver(refreshDocumentHashSuggestionKeys);
    observer.observe(document.body, {
      attributeFilter: [...ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_ATTRIBUTES],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [inputFocused, refreshDocumentHashSuggestionKeys]);

  const syncSuggestionSelectionFromInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      if (suggestionPreviewActiveRef.current && event.type === "select") {
        return;
      }

      suggestionPreviewActiveRef.current = false;
      const nextDraftRouteAddress =
        readRouteUrlEditorDraftRouteAddress({
          inputValue: event.currentTarget.value,
          origin,
        }) ?? draftRouteAddress;
      syncSuggestionSelection(event.currentTarget, nextDraftRouteAddress);
      patchSuggestionState({ dismissed: false });
    },
    [draftRouteAddress, origin, patchSuggestionState, syncSuggestionSelection],
  );

  /**
   * Applies one URL draft through the router for typing previews, suggestion
   * previews, and explicit commits. Same-path edits preserve scroll and can
   * replace the current entry independently from route-changing previews.
   */
  const navigateRouteUrlEditorHref = useCallback(
    (
      nextHref: string,
      options: { replaceRouteNavigation: boolean; replaceRouteOptions: boolean },
      navigationCurrentHref = currentHref,
    ) => {
      const commitMode = getRouteUrlEditorCommitMode({
        currentHref: navigationCurrentHref,
        nextHref,
        origin,
      });

      switch (commitMode) {
        case "route-options": {
          const routeOptionsUrl = new URL(nextHref, new URL(origin));
          return router.navigate({
            hash: readRouteUrlEditorHash(routeOptionsUrl),
            replace: options.replaceRouteOptions,
            search: () =>
              readRouteUrlEditorExactSearch({
                currentHref: navigationCurrentHref,
                nextHref,
                origin,
              }),
            resetScroll: false,
            to: routeOptionsUrl.pathname,
          });
        }
        case "route-navigation": {
          const routeNavigationUrl = new URL(nextHref, new URL(origin));
          return router.navigate({
            hash: readRouteUrlEditorHash(routeNavigationUrl),
            replace: options.replaceRouteNavigation,
            search: () =>
              readRouteUrlEditorExactSearch({
                currentHref: navigationCurrentHref,
                nextHref,
                origin,
              }),
            to: routeNavigationUrl.pathname,
          });
        }
      }
    },
    [currentHref, origin, router],
  );

  const previewDraftRouteAddress = useCallback(
    (nextDraftRouteAddress: string) => {
      const routeUpdateDraftRouteAddress = readRouteUrlEditorRouteUpdateDraft({
        currentHref,
        draftRouteAddress: nextDraftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      const nextHref = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: routeUpdateDraftRouteAddress,
      });

      if (nextHref === null || nextHref === currentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref,
        nextHref,
        origin,
      });
      if (
        commitMode === "route-navigation" &&
        !isRouteUrlPathReadyForNavigation({
          currentHref,
          draftHref: nextHref,
          origin,
          routesByPath: router.routesByPath,
          viewer: { isAdmin: viewerIsAdmin === true },
        })
      ) {
        return;
      }

      previewBaseHrefRef.current ??= currentHref;
      void navigateRouteUrlEditorHref(nextHref, {
        replaceRouteNavigation: true,
        replaceRouteOptions: true,
      });
    },
    [currentHref, navigateRouteUrlEditorHref, origin, router.routesByPath, viewerIsAdmin],
  );

  const changeDraftRouteAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraftRouteAddress = readRouteUrlEditorDraftRouteAddress({
        inputValue: event.currentTarget.value,
        origin,
      });
      if (nextDraftRouteAddress === null) {
        suggestionPreviewActiveRef.current = false;
        pointerPreviewBaseRef.current = null;
        previewBaseHrefRef.current = null;
        touchScrollPreviewCommitPendingRef.current = false;
        touchScrollPreviewDraftRouteAddressRef.current = null;
        restoreRouteUrlEditorRejectedInput({
          input: event.currentTarget,
          selection: inputSelectionBeforeChangeRef.current,
          value: inputValue,
        });
        return;
      }

      setDraftRouteAddress(nextDraftRouteAddress);
      suggestionPreviewActiveRef.current = false;
      pointerPreviewBaseRef.current = null;
      touchScrollPreviewCommitPendingRef.current = false;
      touchScrollPreviewDraftRouteAddressRef.current = null;
      suppressSuggestionMousePreviewUntilMoveRef.current = true;
      syncSuggestionSelection(event.currentTarget, nextDraftRouteAddress);
      patchSuggestionState({
        dismissed: false,
        draftEditedSinceFocus: true,
      });

      previewDraftRouteAddress(nextDraftRouteAddress);
    },
    [inputValue, origin, patchSuggestionState, previewDraftRouteAddress, syncSuggestionSelection],
  );

  const resetInput = useCallback(() => {
    suggestionPreviewActiveRef.current = false;
    pointerPreviewBaseRef.current = null;
    previewBaseHrefRef.current = null;
    touchScrollPreviewCommitPendingRef.current = false;
    touchScrollPreviewDraftRouteAddressRef.current = null;
    setDraftRouteAddress(currentHref);
    patchSuggestionState({ baseRouteAddress: currentHref });
  }, [currentHref, patchSuggestionState]);

  const commitInput = useCallback(
    async (rawAddress: string, options: RouteUrlEditorCommitOptions) => {
      const draftHref = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (draftHref === null) {
        suggestionPreviewActiveRef.current = false;
        pointerPreviewBaseRef.current = null;
        previewBaseHrefRef.current = null;
        setDraftRouteAddress(currentHref);
        patchSuggestionState({ baseRouteAddress: currentHref });
        return;
      }

      const routeUpdateDraftRouteAddress = readRouteUrlEditorRouteUpdateDraft({
        currentHref,
        draftRouteAddress: draftHref,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      const href = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: routeUpdateDraftRouteAddress,
      });
      if (href === null) {
        return;
      }

      const previewBaseHref = previewBaseHrefRef.current;
      previewBaseHrefRef.current = null;
      suggestionPreviewActiveRef.current = false;
      pointerPreviewBaseRef.current = null;
      const nextDraftRouteAddress =
        routeUpdateDraftRouteAddress === draftHref || options.resetIncompleteDraft
          ? href
          : draftHref;
      setDraftRouteAddress(nextDraftRouteAddress);
      patchSuggestionState({ baseRouteAddress: nextDraftRouteAddress });

      if (options.commitPreviewToHistory && previewBaseHref !== null) {
        if (href === previewBaseHref) {
          if (href !== currentHref) {
            await navigateRouteUrlEditorHref(
              href,
              {
                replaceRouteNavigation: true,
                replaceRouteOptions: true,
              },
              currentHref,
            );
          }
          return;
        }

        await navigateRouteUrlEditorHref(
          previewBaseHref,
          {
            replaceRouteNavigation: true,
            replaceRouteOptions: true,
          },
          currentHref,
        );
        await navigateRouteUrlEditorHref(
          href,
          {
            replaceRouteNavigation: false,
            replaceRouteOptions: options.replaceRouteOptions,
          },
          previewBaseHref,
        );
        return;
      }

      if (href === currentHref) {
        return;
      }

      await navigateRouteUrlEditorHref(href, {
        replaceRouteNavigation: false,
        replaceRouteOptions: options.replaceRouteOptions,
      });
    },
    [
      currentHref,
      navigateRouteUrlEditorHref,
      origin,
      patchSuggestionState,
      router.routesByPath,
      viewerIsAdmin,
    ],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void commitInput(draftRouteAddress, {
        commitPreviewToHistory: true,
        replaceRouteOptions: false,
        resetIncompleteDraft: false,
      });
    },
    [commitInput, draftRouteAddress],
  );

  const focusInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      suggestionPreviewActiveRef.current = false;
      pointerPreviewBaseRef.current = null;
      touchScrollPreviewCommitPendingRef.current = false;
      touchScrollPreviewDraftRouteAddressRef.current = null;
      refreshDocumentHashSuggestionKeys();
      syncSuggestionSelection(event.currentTarget, draftRouteAddress);
      setInputFocused(true);
      patchSuggestionState({
        dismissed: false,
        draftEditedSinceFocus: false,
      });
    },
    [
      draftRouteAddress,
      patchSuggestionState,
      refreshDocumentHashSuggestionKeys,
      syncSuggestionSelection,
    ],
  );

  const previewSuggestionByIndex = useCallback(
    (nextActiveSuggestionIndex: number) => {
      const nextSuggestion = suggestions[nextActiveSuggestionIndex];

      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        routeAddress: suggestionBaseRouteAddress,
        selectionRouteIndex,
        suggestion: nextSuggestion,
      });

      setSuggestionState((currentState) =>
        currentState.activeIndex === nextActiveSuggestionIndex
          ? currentState
          : { ...currentState, activeIndex: nextActiveSuggestionIndex },
      );
      setDraftRouteAddress(nextDraftRouteAddress);
      suggestionPreviewActiveRef.current = true;

      previewDraftRouteAddress(nextDraftRouteAddress);
      return nextDraftRouteAddress;
    },
    [previewDraftRouteAddress, selectionRouteIndex, suggestionBaseRouteAddress, suggestions],
  );

  const previewSuggestionByPointerIndex = useCallback(
    (nextActiveSuggestionIndex: number) => {
      pointerPreviewBaseRef.current ??= {
        draftRouteAddress,
        href: currentHref,
        previewBaseHrefBeforePointerPreview: previewBaseHrefRef.current,
      };

      return previewSuggestionByIndex(nextActiveSuggestionIndex);
    },
    [currentHref, draftRouteAddress, previewSuggestionByIndex],
  );

  const restorePointerSuggestionPreview = useCallback(
    (options: { preservePreviewBase: boolean }) => {
      const pointerPreviewBase = pointerPreviewBaseRef.current;
      if (pointerPreviewBase === null) {
        return false;
      }

      pointerPreviewBaseRef.current = null;
      suggestionPreviewActiveRef.current = false;
      previewBaseHrefRef.current = options.preservePreviewBase
        ? pointerPreviewBase.previewBaseHrefBeforePointerPreview
        : null;
      setDraftRouteAddress(pointerPreviewBase.draftRouteAddress);
      patchSuggestionState({
        activeIndex: null,
        baseRouteAddress: pointerPreviewBase.draftRouteAddress,
      });

      if (pointerPreviewBase.href !== currentHref) {
        void navigateRouteUrlEditorHref(
          pointerPreviewBase.href,
          {
            replaceRouteNavigation: true,
            replaceRouteOptions: true,
          },
          currentHref,
        );
      }

      return true;
    },
    [currentHref, navigateRouteUrlEditorHref, patchSuggestionState],
  );

  const previewSuggestionUnderTouchScrollSlate = useCallback(() => {
    const suggestionsElement = suggestionsRef.current;
    if (!touchScrollPickerEnabled || !suggestionsVisible || !suggestionsElement) {
      return;
    }

    const nextActiveSuggestionIndex = Math.min(
      suggestions.length - 1,
      Math.max(0, Math.round(suggestionsElement.scrollTop / routeUrlEditorSuggestionRowHeightPx)),
    );
    if (nextActiveSuggestionIndex === activeSuggestionIndex) {
      return;
    }

    touchScrollPreviewCommitPendingRef.current = true;
    touchScrollPreviewDraftRouteAddressRef.current =
      previewSuggestionByIndex(nextActiveSuggestionIndex);
  }, [
    activeSuggestionIndex,
    previewSuggestionByIndex,
    suggestions.length,
    suggestionsVisible,
    touchScrollPickerEnabled,
  ]);

  const handleSuggestionsScroll = useCallback(() => {
    if (
      !touchScrollPickerEnabled ||
      typeof window === "undefined" ||
      touchScrollPreviewFrameRef.current !== null
    ) {
      return;
    }

    touchScrollPreviewFrameRef.current = window.requestAnimationFrame(() => {
      touchScrollPreviewFrameRef.current = null;
      previewSuggestionUnderTouchScrollSlate();
    });
  }, [previewSuggestionUnderTouchScrollSlate, touchScrollPickerEnabled]);

  const blurInput = useCallback(() => {
    setInputFocused(false);
    patchSuggestionState({
      dismissed: false,
      draftEditedSinceFocus: false,
    });
    suggestionPreviewActiveRef.current = false;
    const restoredPointerPreview = restorePointerSuggestionPreview({
      preservePreviewBase: false,
    });
    if (touchScrollPreviewFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(touchScrollPreviewFrameRef.current);
      touchScrollPreviewFrameRef.current = null;
      previewSuggestionUnderTouchScrollSlate();
    }
    const commitTouchScrollPreview = touchScrollPreviewCommitPendingRef.current;
    const commitDraftRouteAddress =
      touchScrollPreviewDraftRouteAddressRef.current ?? draftRouteAddress;
    touchScrollPreviewCommitPendingRef.current = false;
    touchScrollPreviewDraftRouteAddressRef.current = null;

    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      setDraftRouteAddress(currentHref);
      patchSuggestionState({ baseRouteAddress: currentHref });
      return;
    }

    if (restoredPointerPreview) {
      return;
    }

    void commitInput(commitDraftRouteAddress, {
      commitPreviewToHistory: commitTouchScrollPreview,
      replaceRouteOptions: true,
      resetIncompleteDraft: true,
    });
  }, [
    commitInput,
    currentHref,
    draftRouteAddress,
    patchSuggestionState,
    previewSuggestionUnderTouchScrollSlate,
    restorePointerSuggestionPreview,
  ]);

  const moveActiveSuggestion = useCallback(
    (step: number) => {
      if (!suggestionsVisible || suggestions.length === 0) {
        setSuggestionState((currentState) =>
          currentState.activeIndex === null ? currentState : { ...currentState, activeIndex: null },
        );
        return;
      }

      const nextActiveSuggestionIndex =
        activeSuggestionIndex === null
          ? step > 0
            ? 0
            : suggestions.length - 1
          : (activeSuggestionIndex + step + suggestions.length) % suggestions.length;
      previewSuggestionByIndex(nextActiveSuggestionIndex);
    },
    [activeSuggestionIndex, previewSuggestionByIndex, suggestions, suggestionsVisible],
  );

  const selectSuggestion = useCallback(
    (suggestion: RouteUrlEditorSuggestion) => {
      touchScrollPreviewCommitPendingRef.current = false;
      touchScrollPreviewDraftRouteAddressRef.current = null;
      pointerPreviewBaseRef.current = null;
      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        routeAddress: suggestionBaseRouteAddress,
        selectionRouteIndex,
        suggestion,
      });
      const routeUpdateReady = isRouteUrlEditorRouteUpdateReady({
        currentHref,
        draftRouteAddress: nextDraftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      let searchFollowup: RouteUrlEditorSuggestionFollowup | null = null;
      if (suggestion.kind === "path") {
        const draftRouteAddress = readRouteUrlEditorSearchTriggerDraft(nextDraftRouteAddress);
        if (draftRouteAddress !== nextDraftRouteAddress) {
          searchFollowup = {
            draftRouteAddress,
            kind: "search",
            selectionRouteIndex:
              readRouteUrlEditorSearchDraftSelectionRouteIndex(draftRouteAddress),
          };
        }
      } else if (suggestion.kind === "search") {
        if (suggestion.valueKind === "value" && suggestion.commitsValue) {
          const draftRouteAddress = readRouteUrlEditorNextSearchDraft(nextDraftRouteAddress);
          if (draftRouteAddress !== nextDraftRouteAddress) {
            searchFollowup = {
              draftRouteAddress,
              kind: "search",
              selectionRouteIndex:
                readRouteUrlEditorSearchDraftSelectionRouteIndex(draftRouteAddress),
            };
          }
        } else if (suggestion.valueKind === "value" && suggestion.valueSuggestions.length > 0) {
          searchFollowup = {
            draftRouteAddress: nextDraftRouteAddress,
            kind: "search-value",
            selectionRouteIndex:
              readRouteUrlEditorSearchDraftSelectionRouteIndex(nextDraftRouteAddress),
          };
        } else if (suggestion.valueKind === "presence") {
          const draftRouteAddress = readRouteUrlEditorNextSearchDraft(nextDraftRouteAddress);
          if (draftRouteAddress !== nextDraftRouteAddress) {
            searchFollowup = {
              draftRouteAddress,
              kind: "search",
              selectionRouteIndex:
                readRouteUrlEditorSearchDraftSelectionRouteIndex(draftRouteAddress),
            };
          }
        }
      } else if (suggestion.kind === "search-value") {
        if (!routeUpdateReady) {
          searchFollowup = {
            draftRouteAddress: nextDraftRouteAddress,
            kind: "search-value",
            selectionRouteIndex:
              readRouteUrlEditorSearchDraftSelectionRouteIndex(nextDraftRouteAddress),
          };
        } else {
          const draftRouteAddress = readRouteUrlEditorNextSearchDraft(nextDraftRouteAddress);
          if (draftRouteAddress !== nextDraftRouteAddress) {
            searchFollowup = {
              draftRouteAddress,
              kind: "search",
              selectionRouteIndex:
                readRouteUrlEditorSearchDraftSelectionRouteIndex(draftRouteAddress),
            };
          }
        }
      }

      const followupSuggestions =
        searchFollowup === null
          ? []
          : readRouteUrlEditorSuggestions({
              currentHref,
              draftEditedSinceFocus: true,
              draftRouteAddress: searchFollowup.draftRouteAddress,
              hashKeys: documentHashSuggestionKeys,
              kind: searchFollowup.kind,
              origin,
              routesByPath: router.routesByPath,
              selectionRouteIndex: searchFollowup.selectionRouteIndex,
              viewer: { isAdmin: viewerIsAdmin === true },
            });
      const activeFollowup =
        searchFollowup !== null && followupSuggestions.length > 0 ? searchFollowup : null;
      setDraftRouteAddress(nextDraftRouteAddress);
      patchSuggestionState({
        dismissed: activeFollowup === null,
        draftEditedSinceFocus: activeFollowup !== null || !routeUpdateReady,
      });
      void commitInput(nextDraftRouteAddress, {
        commitPreviewToHistory: true,
        replaceRouteOptions: false,
        resetIncompleteDraft: false,
      }).then(() => {
        if (activeFollowup === null) {
          if (suggestion.kind === "search" && suggestion.valueKind === "value") {
            const input = inputRef.current;
            if (input) {
              restoreRouteUrlEditorInputSelection({
                input,
                origin,
                selectionRouteIndex:
                  readRouteUrlEditorSearchDraftSelectionRouteIndex(nextDraftRouteAddress),
              });
            }
          }
          return;
        }

        suggestionPreviewActiveRef.current = true;
        suppressSuggestionMousePreviewUntilMoveRef.current = true;
        setDraftRouteAddress(activeFollowup.draftRouteAddress);
        patchSuggestionState({
          activeIndex: null,
          baseRouteAddress: activeFollowup.draftRouteAddress,
          dismissed: false,
          draftEditedSinceFocus: true,
          kind: activeFollowup.kind,
          selectionRouteIndex: activeFollowup.selectionRouteIndex,
        });

        const input = inputRef.current;
        if (input) {
          restoreRouteUrlEditorInputSelection({
            input,
            origin,
            selectionRouteIndex: activeFollowup.selectionRouteIndex,
          });
        }
      });
      inputRef.current?.focus();
    },
    [
      commitInput,
      currentHref,
      documentHashSuggestionKeys,
      origin,
      patchSuggestionState,
      router.routesByPath,
      selectionRouteIndex,
      suggestionBaseRouteAddress,
      viewerIsAdmin,
    ],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      inputSelectionBeforeChangeRef.current = readRouteUrlEditorInputSelection(event.currentTarget);

      switch (event.key) {
        case "ArrowDown":
          if (suggestionsVisible) {
            event.preventDefault();
            moveActiveSuggestion(1);
          }
          return;
        case "ArrowUp":
          if (suggestionsVisible) {
            event.preventDefault();
            moveActiveSuggestion(-1);
          }
          return;
        case "Enter":
          if (suggestionsVisible && activeSuggestion) {
            event.preventDefault();
            selectSuggestion(activeSuggestion);
          }
          return;
        case "Backspace": {
          if (!event.metaKey && !event.ctrlKey) {
            return;
          }

          const routeBoundaryBackspace = readRouteUrlEditorRouteBoundaryBackspace({
            input: event.currentTarget,
            origin,
          });
          if (routeBoundaryBackspace === null) {
            return;
          }

          event.preventDefault();
          event.currentTarget.value = routeBoundaryBackspace.inputValue;
          event.currentTarget.setSelectionRange(
            routeBoundaryBackspace.selectionOffset,
            routeBoundaryBackspace.selectionOffset,
          );
          syncSuggestionSelection(event.currentTarget, routeBoundaryBackspace.routeAddress);
          patchSuggestionState({ dismissed: false });

          if (routeBoundaryBackspace.routeAddress === draftRouteAddress) {
            return;
          }

          setDraftRouteAddress(routeBoundaryBackspace.routeAddress);
          patchSuggestionState({ draftEditedSinceFocus: true });
          suppressSuggestionMousePreviewUntilMoveRef.current = true;
          previewDraftRouteAddress(routeBoundaryBackspace.routeAddress);
          return;
        }
        case "Escape":
          skipNextBlurCommitRef.current = true;
          resetInput();
          event.currentTarget.blur();
          return;
      }
    },
    [
      activeSuggestion,
      draftRouteAddress,
      moveActiveSuggestion,
      origin,
      patchSuggestionState,
      previewDraftRouteAddress,
      resetInput,
      selectSuggestion,
      suggestionsVisible,
      syncSuggestionSelection,
    ],
  );

  const handleInputKeyUp = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        return;
      }

      syncSuggestionSelectionFromInput(event);
    },
    [syncSuggestionSelectionFromInput],
  );

  return (
    <form
      ref={formRef}
      className="relative flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
      data-testid="route-url-editor"
      onSubmit={submitInput}
    >
      <label className="sr-only" htmlFor={inputId}>
        Route URL
      </label>
      <button
        aria-label="Back"
        className={routeUrlEditorIconButtonClassName}
        disabled={!canGoBack}
        onClick={goBack}
        title="Back"
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label="Forward"
        className={routeUrlEditorIconButtonClassName}
        disabled={!canGoForward}
        onClick={goForward}
        title="Forward"
        type="button"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
      <input
        ref={inputRef}
        aria-activedescendant={activeSuggestionId}
        aria-describedby={routeInputInvalid ? `${inputId}-error` : undefined}
        aria-controls={suggestionsVisible ? suggestionsId : undefined}
        aria-expanded={suggestionsVisible}
        aria-invalid={routeInputInvalid}
        aria-autocomplete="list"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className={
          inputFocused ? routeUrlEditorInputClassName : routeUrlEditorBlurredInputClassName
        }
        data-testid={inputFocused ? "route-url-editor-input" : "route-url-editor-display"}
        id={inputId}
        inputMode="url"
        name="routeHref"
        onBeforeInput={rememberInputSelection}
        onBlur={blurInput}
        onChange={changeDraftRouteAddress}
        onClick={syncSuggestionSelectionFromInput}
        onFocus={focusInput}
        onKeyDown={handleInputKeyDown}
        onKeyUp={handleInputKeyUp}
        onMouseUp={syncSuggestionSelectionFromInput}
        onSelect={syncSuggestionSelectionFromInput}
        spellCheck={false}
        suppressHydrationWarning
        style={{ textIndent: `-${origin.length}ch` }}
        title={routeInputTitle}
        type="text"
        value={inputValue}
      />
      {suggestionsVisible ? (
        <div
          className={
            touchScrollPickerEnabled
              ? routeUrlEditorTouchSuggestionsPopoverClassName
              : routeUrlEditorSuggestionsPopoverClassName
          }
          data-testid="route-url-editor-suggestions-popover"
        >
          {touchScrollPickerVisible ? (
            <div
              aria-hidden="true"
              className={routeUrlEditorTouchScrollSlateClassName}
              data-testid="route-url-editor-scroll-slate"
              style={{
                height: routeUrlEditorSuggestionRowHeightPx,
                top: touchScrollPickerMetrics.slateTopPx,
              }}
            />
          ) : null}
          <div
            ref={suggestionsRef}
            className={
              touchScrollPickerEnabled
                ? routeUrlEditorTouchSuggestionsScrollportClassName
                : routeUrlEditorSuggestionsScrollportClassName
            }
            data-suggestion-kind={suggestionKind}
            data-testid="route-url-editor-suggestions"
            id={suggestionsId}
            onMouseLeave={() => {
              restorePointerSuggestionPreview({ preservePreviewBase: true });
            }}
            onScroll={handleSuggestionsScroll}
            role="listbox"
          >
            {touchScrollPickerEnabled ? (
              <div
                aria-hidden="true"
                style={{ height: touchScrollPickerMetrics?.topSpacerHeightPx ?? 0 }}
              />
            ) : null}
            {suggestions.map((suggestion, suggestionIndex) => {
              const active = suggestionIndex === activeSuggestionIndex;
              const suggestionLabel = readRouteUrlEditorSuggestionLabel(suggestion);
              return (
                <button
                  aria-label={`Use ${suggestionLabel}`}
                  aria-selected={
                    active || (suggestion.kind === "path" && suggestion.value === draftRouteAddress)
                  }
                  className={getRouteUrlEditorSuggestionButtonClassName(active)}
                  data-testid="route-url-editor-suggestion"
                  id={readRouteUrlEditorSuggestionOptionId({
                    index: suggestionIndex,
                    suggestionsId,
                  })}
                  key={`${suggestion.kind}:${suggestion.value}`}
                  onClick={() => selectSuggestion(suggestion)}
                  onMouseEnter={() => {
                    if (suppressSuggestionMousePreviewUntilMoveRef.current) {
                      return;
                    }

                    previewSuggestionByPointerIndex(suggestionIndex);
                  }}
                  onMouseMove={() => {
                    if (!suppressSuggestionMousePreviewUntilMoveRef.current) {
                      return;
                    }

                    suppressSuggestionMousePreviewUntilMoveRef.current = false;
                    previewSuggestionByPointerIndex(suggestionIndex);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {renderRouteUrlEditorSuggestionValue(suggestion, active)}
                  </span>
                  {typeof suggestion.detail === "string" ? (
                    <span className={getRouteUrlEditorSuggestionDetailClassName(active)}>
                      {suggestion.detail}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {touchScrollPickerEnabled ? (
              <div
                aria-hidden="true"
                style={{ height: touchScrollPickerMetrics?.bottomSpacerHeightPx ?? 0 }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {routeInputInvalid ? (
        <span className="sr-only" id={`${inputId}-error`}>
          Enter a same-origin app URL.
        </span>
      ) : null}
    </form>
  );
}
