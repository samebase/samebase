import { useLocation, useRouter } from "@tanstack/react-router";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { isObject } from "@samebase/sure";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
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

const routeUrlEditorHistoryIndexesStateKey = "__noter_route_url_editor_history_indexes";
const routeUrlEditorTouchScrollPickerMediaQuery = "(hover: none), (pointer: coarse)";
const routeUrlEditorSuggestionRowHeightPx = 28;
const routeUrlEditorTouchScrollSlateOptionOffset = 2;
const routeUrlEditorEndPointerInsetPx = 8;

export type RouteUrlEditorTouchScrollPickerMetrics = {
  bottomSpacerHeightPx: number;
  slateTopPx: number;
  topSpacerHeightPx: number;
};

export type RouteUrlEditorSuggestionState = {
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

export type RouteUrlEditorStoreState = {
  currentRouteHistoryIndex: number;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  inputFocused: boolean;
  // Suggestion previews can replace the visible draft; baseRouteAddress remains the user-typed URL.
  suggestionState: RouteUrlEditorSuggestionState;
  touchScrollPickerEnabled: boolean;
  touchScrollPickerMetrics: RouteUrlEditorTouchScrollPickerMetrics | null;
};

type RouteUrlEditorHistoryIndexes = {
  currentRouteHistoryIndex: number;
  forwardRouteHistoryIndex: number;
};

export type RouteUrlEditorDebugState = {
  activeSuggestionId: string | undefined;
  activeSuggestionIndex: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
  currentHref: string;
  currentRouteHistoryIndex: number;
  draftHref: string | null;
  inputValue: string;
  origin: string;
  pointerPreviewBase: {
    draftRouteAddress: string;
    href: string;
    previewBaseHrefBeforePointerPreview: string | null;
  } | null;
  previewBaseHref: string | null;
  routeInputInvalid: boolean;
  routeInputTitle: string;
  store: RouteUrlEditorStoreState;
  suggestionCount: number;
  suggestionCurrentHref: string;
  suggestionPreviewActive: boolean;
  suggestionsVisible: boolean;
  touchScrollPickerVisible: boolean;
  touchScrollPreviewCommitPending: boolean;
  touchScrollPreviewDraftRouteAddress: string | null;
  viewerIsAdmin: boolean;
};

type RouteUrlEditorProps = {
  onDebugStateChange?: (state: RouteUrlEditorDebugState) => void;
};

function useCreateRouteUrlEditorStore(args: {
  currentHref: string;
  currentRouteHistoryIndex: number;
  forwardRouteHistoryIndex: number;
}) {
  const initialState: RouteUrlEditorStoreState = {
    currentRouteHistoryIndex: args.currentRouteHistoryIndex,
    documentHashSuggestionKeys: [],
    draftRouteAddress: args.currentHref,
    forwardRouteHistoryIndex: args.forwardRouteHistoryIndex,
    inputFocused: false,
    suggestionState: {
      activeIndex: null,
      baseRouteAddress: args.currentHref,
      dismissed: false,
      draftEditedSinceFocus: false,
      kind: "path",
      selectionRouteIndex: 0,
    },
    touchScrollPickerEnabled: false,
    touchScrollPickerMetrics: null,
  };

  return useCreateStore(initialState, ({ setState }) => ({
    clearTouchScrollPickerMetrics: () => {
      setState((state) =>
        state.touchScrollPickerMetrics === null
          ? state
          : { ...state, touchScrollPickerMetrics: null },
      );
    },
    patchSuggestionState: (nextState: Partial<RouteUrlEditorSuggestionState>) => {
      setState((state) => ({
        ...state,
        suggestionState: { ...state.suggestionState, ...nextState },
      }));
    },
    setDocumentHashSuggestionKeys: (documentHashSuggestionKeys: readonly string[]) => {
      setState((state) =>
        areRouteUrlEditorHashSuggestionKeysEqual(
          state.documentHashSuggestionKeys,
          documentHashSuggestionKeys,
        )
          ? state
          : { ...state, documentHashSuggestionKeys },
      );
    },
    setDraftRouteAddress: (draftRouteAddress: string) => {
      setState((state) =>
        state.draftRouteAddress === draftRouteAddress ? state : { ...state, draftRouteAddress },
      );
    },
    setInputFocused: (inputFocused: boolean) => {
      setState((state) =>
        state.inputFocused === inputFocused ? state : { ...state, inputFocused },
      );
    },
    setTouchScrollPickerEnabled: (touchScrollPickerEnabled: boolean) => {
      setState((state) =>
        state.touchScrollPickerEnabled === touchScrollPickerEnabled
          ? state
          : { ...state, touchScrollPickerEnabled },
      );
    },
    syncTouchScrollPickerMetrics: (
      touchScrollPickerMetrics: RouteUrlEditorTouchScrollPickerMetrics,
    ) => {
      setState((state) =>
        areRouteUrlEditorTouchScrollPickerMetricsEqual(
          state.touchScrollPickerMetrics,
          touchScrollPickerMetrics,
        )
          ? state
          : { ...state, touchScrollPickerMetrics },
      );
    },
    updateRouteHistoryIndexes: (
      readNextRouteHistoryIndexes: (
        routeHistoryIndexes: RouteUrlEditorHistoryIndexes,
      ) => RouteUrlEditorHistoryIndexes,
    ) => {
      setState((state) => {
        const routeHistoryIndexes = readNextRouteHistoryIndexes(state);
        const forwardRouteHistoryIndex = Math.max(
          routeHistoryIndexes.currentRouteHistoryIndex,
          routeHistoryIndexes.forwardRouteHistoryIndex,
        );
        return state.currentRouteHistoryIndex === routeHistoryIndexes.currentRouteHistoryIndex &&
          state.forwardRouteHistoryIndex === forwardRouteHistoryIndex
          ? state
          : {
              ...state,
              currentRouteHistoryIndex: routeHistoryIndexes.currentRouteHistoryIndex,
              forwardRouteHistoryIndex,
            };
      });
    },
    updateSuggestionState: (
      readNextSuggestionState: (
        suggestionState: RouteUrlEditorSuggestionState,
      ) => RouteUrlEditorSuggestionState,
    ) => {
      setState((state) => {
        const suggestionState = readNextSuggestionState(state.suggestionState);
        return state.suggestionState === suggestionState ? state : { ...state, suggestionState };
      });
    },
  }));
}

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
  if (suggestion.kind === "search-value" && typeof suggestion.sampleValueStart === "number") {
    return (
      <>
        {suggestion.value.slice(0, suggestion.sampleValueStart)}
        <span className={getRouteUrlEditorSuggestionSampleValueClassName(active)}>
          {suggestion.value.slice(suggestion.sampleValueStart)}
        </span>
      </>
    );
  }

  if (suggestion.kind !== "search" || suggestion.searchParamKind !== "value") {
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

type RouteUrlEditorInputSelection = {
  direction: "backward" | "forward" | "none";
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

type RouteUrlEditorRouteBoundaryDeletion = {
  inputValue: string;
  routeAddress: string;
  selectionOffset: number;
};

// Native deletes can cross the hidden origin text; keep origin + slash
// immutable and delete only route-owned text after that boundary.
function readRouteUrlEditorRouteBoundaryDeletion(args: {
  deleteEnd: number;
  inputValue: string;
  origin: string;
}): RouteUrlEditorRouteBoundaryDeletion | null {
  const routeInputPrefix = `${args.origin}/`;
  const deleteEnd = Math.max(args.deleteEnd, routeInputPrefix.length);
  const inputValue = `${routeInputPrefix}${args.inputValue.slice(deleteEnd)}`;
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

function readRouteUrlEditorRouteBoundaryBackspace(args: {
  input: HTMLInputElement;
  origin: string;
}): RouteUrlEditorRouteBoundaryDeletion | null {
  const selection = readRouteUrlEditorInputSelection(args.input);
  if (!selection) {
    return null;
  }

  return readRouteUrlEditorRouteBoundaryDeletion({
    deleteEnd: Math.max(selection.start, selection.end),
    inputValue: args.input.value,
    origin: args.origin,
  });
}

function readRouteUrlEditorRouteBoundarySelectionDelete(args: {
  inputValue: string;
  origin: string;
  rejectedInputValue: string;
  selection: RouteUrlEditorInputSelection | null;
}): RouteUrlEditorRouteBoundaryDeletion | null {
  const selection = args.selection;
  if (!selection || selection.start === selection.end) {
    return null;
  }

  const routeInputPrefix = `${args.origin}/`;
  if (selection.start >= routeInputPrefix.length || selection.end <= routeInputPrefix.length) {
    return null;
  }

  const rejectedInputValue =
    args.inputValue.slice(0, selection.start) + args.inputValue.slice(selection.end);
  if (args.rejectedInputValue !== rejectedInputValue) {
    return null;
  }

  return readRouteUrlEditorRouteBoundaryDeletion({
    deleteEnd: selection.end,
    inputValue: args.inputValue,
    origin: args.origin,
  });
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

type RouteUrlEditorSuggestionFollowup = {
  draftRouteAddress: string;
  kind: "search" | "search-value";
  selectionRouteIndex: number;
};

type RouteUrlEditorSearchContinuation = {
  draftRouteAddress: string;
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
}): "route-options" | "route-navigation" {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentHref, appOrigin);
  const nextUrl = new URL(args.nextHref, appOrigin);

  return currentUrl.pathname === nextUrl.pathname ? "route-options" : "route-navigation";
}

function readRouteUrlEditorHash(url: URL): string {
  return url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
}

function readRouteUrlEditorBrowserHref(fallbackHref: string): string {
  if (typeof window === "undefined") {
    return fallbackHref;
  }

  const historyState: unknown = window.history.state;
  if (
    !isObject(historyState) ||
    readRouteUrlEditorHistoryIndex(historyState.__TSR_index) === null
  ) {
    return fallbackHref;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

function readRouteUrlEditorSearchContinuationDraft(args: {
  routeAddress: string;
  selectionRouteIndex: number;
}): string | null {
  const hashIndex = args.routeAddress.indexOf("#");
  if (hashIndex !== -1 && args.selectionRouteIndex > hashIndex) {
    return null;
  }

  const searchEnd = hashIndex === -1 ? args.routeAddress.length : hashIndex;
  if (args.selectionRouteIndex !== searchEnd) {
    return null;
  }

  const searchIndex = args.routeAddress.indexOf("?");
  if (searchIndex === -1 || searchIndex > searchEnd) {
    if (args.routeAddress === "/") {
      return null;
    }

    return readRouteUrlEditorSearchTriggerDraft(args.routeAddress);
  }

  return readRouteUrlEditorNextSearchDraft(args.routeAddress);
}

function readRouteUrlEditorPointerSelectionRouteIndex(args: {
  event: SyntheticEvent<HTMLInputElement>;
  routeAddress: string;
}): number | null {
  const nativeEvent = args.event.nativeEvent;
  if (!(nativeEvent instanceof MouseEvent)) {
    return null;
  }

  const inputRect = args.event.currentTarget.getBoundingClientRect();
  if (nativeEvent.clientX < inputRect.right - routeUrlEditorEndPointerInsetPx) {
    return null;
  }

  return args.routeAddress.length;
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

function readRouteUrlEditorHistoryIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readRouteUrlEditorHistoryIndexesFromState(args: {
  currentRouteHistoryIndex: number;
  historyState: unknown;
}): RouteUrlEditorHistoryIndexes {
  const fallback = {
    currentRouteHistoryIndex: args.currentRouteHistoryIndex,
    forwardRouteHistoryIndex: args.currentRouteHistoryIndex,
  };

  if (!isObject(args.historyState)) {
    return fallback;
  }

  const persistedIndexes = args.historyState[routeUrlEditorHistoryIndexesStateKey];
  if (!isObject(persistedIndexes)) {
    return fallback;
  }

  const persistedCurrentRouteHistoryIndex = readRouteUrlEditorHistoryIndex(
    persistedIndexes.currentRouteHistoryIndex,
  );
  const persistedForwardRouteHistoryIndex = readRouteUrlEditorHistoryIndex(
    persistedIndexes.forwardRouteHistoryIndex,
  );
  if (persistedCurrentRouteHistoryIndex === null || persistedForwardRouteHistoryIndex === null) {
    return fallback;
  }

  return {
    currentRouteHistoryIndex: persistedCurrentRouteHistoryIndex,
    forwardRouteHistoryIndex: Math.max(
      persistedCurrentRouteHistoryIndex,
      persistedForwardRouteHistoryIndex,
    ),
  };
}

function persistRouteUrlEditorHistoryIndexes(args: {
  currentRouteHistoryIndex: number;
  forwardRouteHistoryIndex: number;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const historyState: unknown = window.history.state;
  if (!isObject(historyState)) {
    return;
  }

  const historyRouteIndex = readRouteUrlEditorHistoryIndex(historyState.__TSR_index);
  if (historyRouteIndex !== null && historyRouteIndex !== args.currentRouteHistoryIndex) {
    return;
  }

  const nextIndexes: RouteUrlEditorHistoryIndexes = {
    currentRouteHistoryIndex: args.currentRouteHistoryIndex,
    forwardRouteHistoryIndex: args.forwardRouteHistoryIndex,
  };
  const currentIndexes = historyState[routeUrlEditorHistoryIndexesStateKey];

  if (isObject(currentIndexes)) {
    const currentRouteHistoryIndex = readRouteUrlEditorHistoryIndex(
      currentIndexes.currentRouteHistoryIndex,
    );
    const forwardRouteHistoryIndex = readRouteUrlEditorHistoryIndex(
      currentIndexes.forwardRouteHistoryIndex,
    );
    if (
      currentRouteHistoryIndex === nextIndexes.currentRouteHistoryIndex &&
      forwardRouteHistoryIndex === nextIndexes.forwardRouteHistoryIndex
    ) {
      return;
    }
  }

  window.history.replaceState(
    {
      ...historyState,
      [routeUrlEditorHistoryIndexesStateKey]: nextIndexes,
    },
    "",
  );
}

/**
 * Displays route reality separately from the focused local draft. Valid edits
 * apply while typing, but router normalization does not replace the draft text
 * until the user leaves the field.
 */
export function RouteUrlEditor({ onDebugStateChange }: RouteUrlEditorProps = {}) {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const locationRouteHistoryIndex = location.state.__TSR_index;
  const inputId = useId();
  const suggestionsId = `${inputId}-suggestions`;
  // Keep SSR and the first client render identical; the layout effect below
  // reads the browser entry before paint and updates the live controls.
  const routeUrlEditorStore = useCreateRouteUrlEditorStore({
    currentHref,
    currentRouteHistoryIndex: 0,
    forwardRouteHistoryIndex: 0,
  });
  const {
    currentRouteHistoryIndex,
    documentHashSuggestionKeys,
    draftRouteAddress,
    forwardRouteHistoryIndex,
    inputFocused,
    suggestionState,
    touchScrollPickerEnabled,
    touchScrollPickerMetrics,
  } = useSelector(routeUrlEditorStore);
  const {
    clearTouchScrollPickerMetrics,
    patchSuggestionState,
    setDocumentHashSuggestionKeys,
    setDraftRouteAddress: setDraftRouteAddressAction,
    setInputFocused,
    setTouchScrollPickerEnabled,
    syncTouchScrollPickerMetrics,
    updateRouteHistoryIndexes,
    updateSuggestionState,
  } = routeUrlEditorStore.actions;
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
  const currentHrefRef = useRef(currentHref);
  const draftRouteAddressRef = useRef(draftRouteAddress);
  const optimisticHrefRef = useRef<string | null>(null);
  const routeNavigationQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Keyboard edits can render suggestions under a stationary cursor; hover previews resume after pointer movement.
  const suppressSuggestionMousePreviewUntilMoveRef = useRef(false);
  // Arrow-key previews rewrite the input value, while suggestions stay anchored
  // to the text the user typed until they type, click, blur, or commit.
  const suggestionPreviewActiveRef = useRef(false);
  const restoredRouteHistoryIndexesRef = useRef(false);
  const origin = readIsomorphicOrigin();
  draftRouteAddressRef.current = draftRouteAddress;
  const setDraftRouteAddress = useCallback(
    (nextDraftRouteAddress: string) => {
      draftRouteAddressRef.current = nextDraftRouteAddress;
      setDraftRouteAddressAction(nextDraftRouteAddress);
    },
    [setDraftRouteAddressAction],
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
  const latestRouteHref = currentHrefRef.current;
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref: latestRouteHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? inputValue : `${origin}${draftHref}`;
  const suggestionCurrentHref = previewBaseHrefRef.current ?? latestRouteHref;
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
  const suggestionCount = suggestions.length;
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

  useLayoutEffect(() => {
    const latestLocationHref = readRouteUrlEditorBrowserHref(router.latestLocation.href);
    if (optimisticHrefRef.current === latestLocationHref) {
      optimisticHrefRef.current = null;
    }
    if (optimisticHrefRef.current !== null) {
      return;
    }
    currentHrefRef.current = latestLocationHref;
  }, [currentHref, router]);

  // Research fixtures can observe the real editor without replacing its store,
  // event handlers, router behavior, or suggestion logic.
  useEffect(() => {
    if (!onDebugStateChange) {
      return;
    }

    onDebugStateChange({
      activeSuggestionId,
      activeSuggestionIndex,
      canGoBack,
      canGoForward,
      currentHref,
      currentRouteHistoryIndex,
      draftHref,
      inputValue,
      origin,
      pointerPreviewBase: pointerPreviewBaseRef.current,
      previewBaseHref: previewBaseHrefRef.current,
      routeInputInvalid,
      routeInputTitle,
      store: {
        currentRouteHistoryIndex,
        documentHashSuggestionKeys,
        draftRouteAddress,
        forwardRouteHistoryIndex,
        inputFocused,
        suggestionState,
        touchScrollPickerEnabled,
        touchScrollPickerMetrics,
      },
      suggestionCount,
      suggestionCurrentHref,
      suggestionPreviewActive: suggestionPreviewActiveRef.current,
      suggestionsVisible,
      touchScrollPickerVisible,
      touchScrollPreviewCommitPending: touchScrollPreviewCommitPendingRef.current,
      touchScrollPreviewDraftRouteAddress: touchScrollPreviewDraftRouteAddressRef.current,
      viewerIsAdmin: viewerIsAdmin === true,
    });
  }, [
    activeSuggestionId,
    activeSuggestionIndex,
    canGoBack,
    canGoForward,
    currentHref,
    currentRouteHistoryIndex,
    documentHashSuggestionKeys,
    draftHref,
    draftRouteAddress,
    forwardRouteHistoryIndex,
    inputFocused,
    inputValue,
    onDebugStateChange,
    origin,
    routeInputInvalid,
    routeInputTitle,
    suggestionCount,
    suggestionCurrentHref,
    suggestionState,
    suggestionsVisible,
    touchScrollPickerEnabled,
    touchScrollPickerMetrics,
    touchScrollPickerVisible,
    viewerIsAdmin,
  ]);

  // TanStack writes __TSR_index into each route entry. When our saved indexes
  // are present on that entry, prefer them so reloads keep Back/Forward state.
  useEffect(
    () =>
      router.history.subscribe(({ action, location: nextLocation }) => {
        const nextHistoryIndex = nextLocation.state.__TSR_index;
        updateRouteHistoryIndexes((currentRouteHistoryIndexes) => {
          if (action.type === "PUSH") {
            return {
              currentRouteHistoryIndex: nextHistoryIndex,
              forwardRouteHistoryIndex: nextHistoryIndex,
            };
          }

          if (action.type === "REPLACE") {
            return currentRouteHistoryIndexes;
          }

          const nextRouteHistoryIndexes = readRouteUrlEditorHistoryIndexesFromState({
            currentRouteHistoryIndex: nextHistoryIndex,
            historyState: nextLocation.state,
          });
          return {
            currentRouteHistoryIndex: nextRouteHistoryIndexes.currentRouteHistoryIndex,
            forwardRouteHistoryIndex: Math.max(
              currentRouteHistoryIndexes.forwardRouteHistoryIndex,
              nextRouteHistoryIndexes.forwardRouteHistoryIndex,
            ),
          };
        });
      }),
    [router, updateRouteHistoryIndexes],
  );

  // Keep the first render server-compatible, then restore saved browser-entry
  // indexes before paint so reloads do not visibly disable working controls.
  useLayoutEffect(() => {
    if (restoredRouteHistoryIndexesRef.current) {
      return;
    }

    restoredRouteHistoryIndexesRef.current = true;
    updateRouteHistoryIndexes(() =>
      readRouteUrlEditorHistoryIndexesFromState({
        currentRouteHistoryIndex: locationRouteHistoryIndex,
        historyState: typeof window === "undefined" ? undefined : window.history.state,
      }),
    );
  }, [locationRouteHistoryIndex, updateRouteHistoryIndexes]);

  // If the user hard-refreshes, browser session history remains but TanStack
  // can restart its current index at zero; carry the app-history position on
  // each browser history entry so this chrome can re-enable Back/Forward.
  useEffect(() => {
    persistRouteUrlEditorHistoryIndexes({
      currentRouteHistoryIndex,
      forwardRouteHistoryIndex,
    });
  }, [currentHref, currentRouteHistoryIndex, forwardRouteHistoryIndex]);

  // Links and Back/Forward change URL reality. Keep an untouched focused input
  // aligned with the route while preserving user-edited local drafts.
  useEffect(() => {
    if (suggestionPreviewActiveRef.current) {
      return;
    }

    const latestLocationHref = readRouteUrlEditorBrowserHref(router.latestLocation.href);

    if (optimisticHrefRef.current !== null && optimisticHrefRef.current !== latestLocationHref) {
      return;
    }

    if (inputFocused && suggestionDraftEditedSinceFocus) {
      return;
    }

    setDraftRouteAddress(latestLocationHref);
    patchSuggestionState({ baseRouteAddress: latestLocationHref });
  }, [
    currentHref,
    inputFocused,
    patchSuggestionState,
    router,
    setDraftRouteAddress,
    suggestionDraftEditedSinceFocus,
  ]);

  useEffect(() => {
    updateSuggestionState((currentState) => {
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
  }, [suggestions.length, suggestionsVisible, updateSuggestionState]);

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
  }, [setTouchScrollPickerEnabled]);

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
      clearTouchScrollPickerMetrics();
      return;
    }

    const suggestionsElement = suggestionsRef.current;
    if (!suggestionsElement || typeof window === "undefined") {
      return;
    }

    const syncMetrics = () => {
      const nextMetrics = readRouteUrlEditorTouchScrollPickerMetrics(suggestionsElement);
      syncTouchScrollPickerMetrics(nextMetrics);
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
  }, [
    clearTouchScrollPickerMetrics,
    suggestionsVisible,
    syncTouchScrollPickerMetrics,
    touchScrollPickerEnabled,
  ]);

  const goBack = useCallback(() => {
    router.history.back();
  }, [router]);

  const goForward = useCallback(() => {
    router.history.forward();
  }, [router]);

  const refreshPage = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.location.reload();
  }, []);

  const refreshDocumentHashSuggestionKeys = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const nextKeys = readRouteUrlEditorDocumentHashSuggestionKeys(document);
    setDocumentHashSuggestionKeys(nextKeys);
  }, [setDocumentHashSuggestionKeys]);

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

  const readSearchContinuationFromSelection = useCallback(
    (
      routeAddress: string,
      selectionRouteIndex: number,
    ): RouteUrlEditorSearchContinuation | null => {
      const latestCurrentHref = currentHrefRef.current;
      const draftRouteAddress = readRouteUrlEditorSearchContinuationDraft({
        routeAddress,
        selectionRouteIndex,
      });
      if (draftRouteAddress === null || draftRouteAddress === routeAddress) {
        return null;
      }

      if (
        !isRouteUrlEditorRouteUpdateReady({
          currentHref: latestCurrentHref,
          draftRouteAddress: routeAddress,
          origin,
          routesByPath: router.routesByPath,
          viewer: { isAdmin: viewerIsAdmin === true },
        })
      ) {
        return null;
      }

      if (
        !isRouteUrlPathReadyForNavigation({
          currentHref: latestCurrentHref,
          draftHref: routeAddress,
          origin,
          routesByPath: router.routesByPath,
          viewer: { isAdmin: viewerIsAdmin === true },
        })
      ) {
        return null;
      }

      const continuationSelectionRouteIndex =
        readRouteUrlEditorSearchDraftSelectionRouteIndex(draftRouteAddress);
      const continuationSuggestions = readRouteUrlEditorSuggestions({
        currentHref: latestCurrentHref,
        draftEditedSinceFocus: true,
        draftRouteAddress,
        hashKeys: [],
        kind: "search",
        origin,
        routesByPath: router.routesByPath,
        selectionRouteIndex: continuationSelectionRouteIndex,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      if (continuationSuggestions.length === 0) {
        return null;
      }

      return {
        draftRouteAddress,
        selectionRouteIndex: continuationSelectionRouteIndex,
      };
    },
    [origin, router.routesByPath, viewerIsAdmin],
  );

  const openSearchContinuationFromInput = useCallback(
    (input: HTMLInputElement, routeAddress: string, pointerSelectionRouteIndex: number | null) => {
      const selectionRouteIndex =
        pointerSelectionRouteIndex ??
        readRouteUrlEditorInputRouteIndex({
          input,
          origin,
          routeAddress,
        });
      const continuation = readSearchContinuationFromSelection(routeAddress, selectionRouteIndex);
      if (continuation === null) {
        return;
      }

      setDraftRouteAddress(continuation.draftRouteAddress);
      suppressSuggestionMousePreviewUntilMoveRef.current = true;
      patchSuggestionState({
        activeIndex: null,
        baseRouteAddress: continuation.draftRouteAddress,
        dismissed: false,
        draftEditedSinceFocus: true,
        kind: "search",
        selectionRouteIndex: continuation.selectionRouteIndex,
      });
      restoreRouteUrlEditorInputSelection({
        input,
        origin,
        selectionRouteIndex: continuation.selectionRouteIndex,
      });
    },
    [origin, patchSuggestionState, readSearchContinuationFromSelection, setDraftRouteAddress],
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

  const syncSuggestionSelectionForInput = useCallback(
    (input: HTMLInputElement): string => {
      suggestionPreviewActiveRef.current = false;
      const nextDraftRouteAddress =
        readRouteUrlEditorDraftRouteAddress({
          inputValue: input.value,
          origin,
        }) ?? draftRouteAddress;
      syncSuggestionSelection(input, nextDraftRouteAddress);
      patchSuggestionState({ dismissed: false });

      return nextDraftRouteAddress;
    },
    [draftRouteAddress, origin, patchSuggestionState, syncSuggestionSelection],
  );

  const syncSuggestionSelectionFromInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      if (suggestionPreviewActiveRef.current && event.type === "select") {
        return;
      }

      syncSuggestionSelectionForInput(event.currentTarget);
    },
    [syncSuggestionSelectionForInput],
  );

  const syncSuggestionSelectionFromInputAndOpenSearch = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      if (suggestionPreviewActiveRef.current && event.type === "select") {
        return;
      }

      const nextDraftRouteAddress = syncSuggestionSelectionForInput(event.currentTarget);
      // The hidden origin indent can leave right-edge clicks at selectionStart 0;
      // treat that pointer zone as the end of the editable route text.
      openSearchContinuationFromInput(
        event.currentTarget,
        nextDraftRouteAddress,
        readRouteUrlEditorPointerSelectionRouteIndex({
          event,
          routeAddress: nextDraftRouteAddress,
        }),
      );
    },
    [openSearchContinuationFromInput, syncSuggestionSelectionForInput],
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
      navigationCurrentHref = currentHrefRef.current,
    ) => {
      const commitMode = getRouteUrlEditorCommitMode({
        currentHref: navigationCurrentHref,
        nextHref,
        origin,
      });
      const nextUrl = new URL(nextHref, new URL(origin));
      const nextRouteHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      currentHrefRef.current = nextRouteHref;
      optimisticHrefRef.current = nextRouteHref;

      const runNavigation = async () => {
        switch (commitMode) {
          case "route-options": {
            await router.navigate({
              hash: readRouteUrlEditorHash(nextUrl),
              replace: options.replaceRouteOptions,
              search: () =>
                readRouteUrlEditorExactSearch({
                  currentHref: navigationCurrentHref,
                  nextHref,
                  origin,
                }),
              resetScroll: false,
              to: nextUrl.pathname,
            });
            break;
          }
          case "route-navigation": {
            await router.navigate({
              hash: readRouteUrlEditorHash(nextUrl),
              replace: options.replaceRouteNavigation,
              search: () =>
                readRouteUrlEditorExactSearch({
                  currentHref: navigationCurrentHref,
                  nextHref,
                  origin,
                }),
              to: nextUrl.pathname,
            });
            break;
          }
        }

        if (optimisticHrefRef.current === nextRouteHref) {
          const latestLocationHref = readRouteUrlEditorBrowserHref(router.latestLocation.href);
          currentHrefRef.current = latestLocationHref;
          optimisticHrefRef.current = null;
        }
      };
      const navigation = routeNavigationQueueRef.current.then(runNavigation, runNavigation);
      routeNavigationQueueRef.current = navigation.catch(() => {});
      return navigation;
    },
    [origin, router],
  );

  const previewDraftRouteAddress = useCallback(
    (nextDraftRouteAddress: string) => {
      const latestCurrentHref = currentHrefRef.current;
      const routeUpdateDraftRouteAddress = readRouteUrlEditorRouteUpdateDraft({
        currentHref: latestCurrentHref,
        draftRouteAddress: nextDraftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      const nextHref = normalizeRouteUrlEditorHref({
        currentHref: latestCurrentHref,
        origin,
        rawHref: routeUpdateDraftRouteAddress,
      });

      if (nextHref === null || nextHref === latestCurrentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref: latestCurrentHref,
        nextHref,
        origin,
      });
      if (
        commitMode === "route-navigation" &&
        !isRouteUrlPathReadyForNavigation({
          currentHref: latestCurrentHref,
          draftHref: nextHref,
          origin,
          routesByPath: router.routesByPath,
          viewer: { isAdmin: viewerIsAdmin === true },
        })
      ) {
        return;
      }

      previewBaseHrefRef.current ??= latestCurrentHref;
      void navigateRouteUrlEditorHref(nextHref, {
        replaceRouteNavigation: true,
        replaceRouteOptions: true,
      });
    },
    [navigateRouteUrlEditorHref, origin, router.routesByPath, viewerIsAdmin],
  );

  const applyRouteBoundaryDeletion = useCallback(
    (input: HTMLInputElement, deletion: RouteUrlEditorRouteBoundaryDeletion) => {
      input.value = deletion.inputValue;
      input.setSelectionRange(deletion.selectionOffset, deletion.selectionOffset);
      suggestionPreviewActiveRef.current = false;
      pointerPreviewBaseRef.current = null;
      touchScrollPreviewCommitPendingRef.current = false;
      touchScrollPreviewDraftRouteAddressRef.current = null;
      syncSuggestionSelection(input, deletion.routeAddress);
      patchSuggestionState({ dismissed: false });

      if (deletion.routeAddress === draftRouteAddress) {
        return;
      }

      setDraftRouteAddress(deletion.routeAddress);
      patchSuggestionState({ draftEditedSinceFocus: true });
      suppressSuggestionMousePreviewUntilMoveRef.current = true;
      previewDraftRouteAddress(deletion.routeAddress);
    },
    [
      draftRouteAddress,
      patchSuggestionState,
      previewDraftRouteAddress,
      setDraftRouteAddress,
      syncSuggestionSelection,
    ],
  );

  const changeDraftRouteAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraftRouteAddress = readRouteUrlEditorDraftRouteAddress({
        inputValue: event.currentTarget.value,
        origin,
      });
      if (nextDraftRouteAddress === null) {
        const routeBoundarySelectionDelete = readRouteUrlEditorRouteBoundarySelectionDelete({
          inputValue,
          origin,
          rejectedInputValue: event.currentTarget.value,
          selection: inputSelectionBeforeChangeRef.current,
        });
        if (routeBoundarySelectionDelete !== null) {
          applyRouteBoundaryDeletion(event.currentTarget, routeBoundarySelectionDelete);
          return;
        }

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
    [
      applyRouteBoundaryDeletion,
      inputValue,
      origin,
      patchSuggestionState,
      previewDraftRouteAddress,
      setDraftRouteAddress,
      syncSuggestionSelection,
    ],
  );

  const resetInput = useCallback(() => {
    const latestCurrentHref = currentHrefRef.current;
    suggestionPreviewActiveRef.current = false;
    pointerPreviewBaseRef.current = null;
    previewBaseHrefRef.current = null;
    touchScrollPreviewCommitPendingRef.current = false;
    touchScrollPreviewDraftRouteAddressRef.current = null;
    setDraftRouteAddress(latestCurrentHref);
    patchSuggestionState({ baseRouteAddress: latestCurrentHref });
  }, [patchSuggestionState, setDraftRouteAddress]);

  const commitInput = useCallback(
    async (rawAddress: string, options: RouteUrlEditorCommitOptions) => {
      const latestCurrentHref = currentHrefRef.current;
      const draftHref = normalizeRouteUrlEditorHref({
        currentHref: latestCurrentHref,
        origin,
        rawHref: rawAddress,
      });

      if (draftHref === null) {
        suggestionPreviewActiveRef.current = false;
        pointerPreviewBaseRef.current = null;
        previewBaseHrefRef.current = null;
        setDraftRouteAddress(latestCurrentHref);
        patchSuggestionState({ baseRouteAddress: latestCurrentHref });
        return;
      }

      const routeUpdateDraftRouteAddress = readRouteUrlEditorRouteUpdateDraft({
        currentHref: latestCurrentHref,
        draftRouteAddress: draftHref,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      const href = normalizeRouteUrlEditorHref({
        currentHref: latestCurrentHref,
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
          if (href !== latestCurrentHref) {
            await navigateRouteUrlEditorHref(
              href,
              {
                replaceRouteNavigation: true,
                replaceRouteOptions: true,
              },
              latestCurrentHref,
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
          latestCurrentHref,
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

      if (href === latestCurrentHref) {
        return;
      }

      await navigateRouteUrlEditorHref(href, {
        replaceRouteNavigation: false,
        replaceRouteOptions: options.replaceRouteOptions,
      });
    },
    [
      navigateRouteUrlEditorHref,
      origin,
      patchSuggestionState,
      router.routesByPath,
      setDraftRouteAddress,
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
      setInputFocused,
      syncSuggestionSelection,
    ],
  );

  const previewSuggestionByIndex = useCallback(
    (nextActiveSuggestionIndex: number) => {
      const nextSuggestion = suggestions[nextActiveSuggestionIndex];

      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        mode: "preview",
        routeAddress: suggestionBaseRouteAddress,
        selectionRouteIndex,
        suggestion: nextSuggestion,
      });

      updateSuggestionState((currentState) =>
        currentState.activeIndex === nextActiveSuggestionIndex
          ? currentState
          : { ...currentState, activeIndex: nextActiveSuggestionIndex },
      );
      setDraftRouteAddress(nextDraftRouteAddress);
      suggestionPreviewActiveRef.current = true;

      previewDraftRouteAddress(nextDraftRouteAddress);
      return nextDraftRouteAddress;
    },
    [
      previewDraftRouteAddress,
      selectionRouteIndex,
      suggestionBaseRouteAddress,
      setDraftRouteAddress,
      suggestions,
      updateSuggestionState,
    ],
  );

  const previewSuggestionByPointerIndex = useCallback(
    (nextActiveSuggestionIndex: number) => {
      pointerPreviewBaseRef.current ??= {
        draftRouteAddress,
        href: currentHrefRef.current,
        previewBaseHrefBeforePointerPreview: previewBaseHrefRef.current,
      };

      return previewSuggestionByIndex(nextActiveSuggestionIndex);
    },
    [draftRouteAddress, previewSuggestionByIndex],
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

      const latestCurrentHref = currentHrefRef.current;
      if (pointerPreviewBase.href !== latestCurrentHref) {
        void navigateRouteUrlEditorHref(
          pointerPreviewBase.href,
          {
            replaceRouteNavigation: true,
            replaceRouteOptions: true,
          },
          latestCurrentHref,
        );
      }

      return true;
    },
    [navigateRouteUrlEditorHref, patchSuggestionState, setDraftRouteAddress],
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
      const latestCurrentHref = currentHrefRef.current;
      skipNextBlurCommitRef.current = false;
      setDraftRouteAddress(latestCurrentHref);
      patchSuggestionState({ baseRouteAddress: latestCurrentHref });
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
    draftRouteAddress,
    patchSuggestionState,
    previewSuggestionUnderTouchScrollSlate,
    restorePointerSuggestionPreview,
    setDraftRouteAddress,
    setInputFocused,
  ]);

  const moveActiveSuggestion = useCallback(
    (step: number) => {
      if (!suggestionsVisible || suggestions.length === 0) {
        updateSuggestionState((currentState) =>
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
    [
      activeSuggestionIndex,
      previewSuggestionByIndex,
      suggestions,
      suggestionsVisible,
      updateSuggestionState,
    ],
  );

  const selectSuggestion = useCallback(
    (suggestion: RouteUrlEditorSuggestion) => {
      const latestCurrentHref = currentHrefRef.current;
      touchScrollPreviewCommitPendingRef.current = false;
      touchScrollPreviewDraftRouteAddressRef.current = null;
      pointerPreviewBaseRef.current = null;
      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: suggestionBaseRouteAddress,
        selectionRouteIndex,
        suggestion,
      });
      const routeUpdateReady = isRouteUrlEditorRouteUpdateReady({
        currentHref: latestCurrentHref,
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
        if (suggestion.searchParamKind === "value") {
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
              currentHref: latestCurrentHref,
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
      const selectedDraftRouteAddress = nextDraftRouteAddress;
      void commitInput(nextDraftRouteAddress, {
        commitPreviewToHistory: true,
        replaceRouteOptions: false,
        resetIncompleteDraft: false,
      }).then(() => {
        if (draftRouteAddressRef.current !== selectedDraftRouteAddress) {
          return;
        }

        if (activeFollowup === null) {
          if (suggestion.kind === "search" && suggestion.searchParamKind === "value") {
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
      documentHashSuggestionKeys,
      origin,
      patchSuggestionState,
      router.routesByPath,
      selectionRouteIndex,
      setDraftRouteAddress,
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
          applyRouteBoundaryDeletion(event.currentTarget, routeBoundaryBackspace);
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
      applyRouteBoundaryDeletion,
      moveActiveSuggestion,
      origin,
      resetInput,
      selectSuggestion,
      suggestionsVisible,
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
      <button
        aria-label="Refresh"
        className={routeUrlEditorIconButtonClassName}
        onClick={refreshPage}
        title="Refresh"
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
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
        onClick={syncSuggestionSelectionFromInputAndOpenSearch}
        onCut={rememberInputSelection}
        onFocus={focusInput}
        onKeyDown={handleInputKeyDown}
        onKeyUp={handleInputKeyUp}
        onMouseUp={syncSuggestionSelectionFromInputAndOpenSearch}
        onSelect={syncSuggestionSelectionFromInput}
        spellCheck={false}
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
