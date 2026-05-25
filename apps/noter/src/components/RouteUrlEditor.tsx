import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
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

const routeUrlEditorInputClassName =
  "h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-sm leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive";

const routeUrlEditorBlurredInputClassName = `${routeUrlEditorInputClassName} cursor-text hover:bg-muted`;

function getRouteUrlEditorSuggestionButtonClassName(active: boolean): string {
  return active
    ? "flex h-7 w-full items-center bg-accent px-2 font-mono text-sm text-accent-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
    : "flex h-7 w-full items-center px-2 font-mono text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";
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

function readRouteUrlEditorProtocolPrefix(origin: string): string {
  const protocolEndIndex = origin.indexOf("//");
  if (protocolEndIndex === -1) {
    return "";
  }

  return origin.slice(0, protocolEndIndex + "//".length);
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
  const inputSelectionBeforeChangeRef = useRef<RouteUrlEditorInputSelection | null>(null);
  // Preview replaces the current entry; explicit selection restores this base
  // before pushing the selected URL so Back returns to the pre-preview page.
  const previewBaseHrefRef = useRef<string | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  // Keyboard edits can render suggestions under a stationary cursor; hover previews resume after pointer movement.
  const suppressSuggestionMousePreviewUntilMoveRef = useRef(false);
  // Arrow-key previews rewrite the input value, while suggestions stay anchored
  // to the text the user typed until they type, click, blur, or commit.
  const suggestionPreviewActiveRef = useRef(false);
  const origin = readRouteUrlEditorOrigin();
  const [draftRouteAddress, setDraftRouteAddress] = useState(currentHref);
  const [inputFocused, setInputFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionDraftEditedSinceFocus, setSuggestionDraftEditedSinceFocus] = useState(false);
  // The draft can temporarily be a highlighted suggestion; this is the
  // user-edited URL that filters the suggestion list.
  const [suggestionBaseRouteAddress, setSuggestionBaseRouteAddress] = useState(currentHref);
  const [suggestionKind, setSuggestionKind] = useState<RouteUrlEditorSuggestionKind>("path");
  const [selectionRouteIndex, setSelectionRouteIndex] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const [documentHashSuggestionKeys, setDocumentHashSuggestionKeys] = useState<readonly string[]>(
    [],
  );
  const viewerIsAdmin = useQuery(api.users.isCurrentUserAdmin);
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? inputValue : `${origin}${draftHref}`;
  const suggestions = readRouteUrlEditorSuggestions({
    currentHref,
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
    setSuggestionBaseRouteAddress(currentHref);
  }, [currentHref, inputFocused, suggestionDraftEditedSinceFocus]);

  useEffect(() => {
    setActiveSuggestionIndex((currentActiveSuggestionIndex) => {
      if (!suggestionsVisible) {
        return null;
      }

      if (currentActiveSuggestionIndex === null) {
        return null;
      }

      return Math.min(currentActiveSuggestionIndex, suggestions.length - 1);
    });
  }, [suggestions.length, suggestionsVisible]);

  useEffect(() => {
    if (!activeSuggestionId) {
      return;
    }

    document.getElementById(activeSuggestionId)?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionId]);

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
      setSelectionRouteIndex(nextSelectionRouteIndex);
      setSuggestionKind(readRouteUrlEditorSuggestionKind(routeAddress, nextSelectionRouteIndex));
      setSuggestionBaseRouteAddress(routeAddress);
      setActiveSuggestionIndex(null);
    },
    [origin],
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
      setSuggestionsDismissed(false);
    },
    [draftRouteAddress, origin, syncSuggestionSelection],
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
        previewBaseHrefRef.current = null;
        restoreRouteUrlEditorRejectedInput({
          input: event.currentTarget,
          selection: inputSelectionBeforeChangeRef.current,
          value: inputValue,
        });
        return;
      }

      setDraftRouteAddress(nextDraftRouteAddress);
      setSuggestionBaseRouteAddress(nextDraftRouteAddress);
      suggestionPreviewActiveRef.current = false;
      suppressSuggestionMousePreviewUntilMoveRef.current = true;
      setSuggestionDraftEditedSinceFocus(true);
      setSuggestionsDismissed(false);
      syncSuggestionSelection(event.currentTarget, nextDraftRouteAddress);

      previewDraftRouteAddress(nextDraftRouteAddress);
    },
    [inputValue, origin, previewDraftRouteAddress, syncSuggestionSelection],
  );

  const resetInput = useCallback(() => {
    suggestionPreviewActiveRef.current = false;
    previewBaseHrefRef.current = null;
    setDraftRouteAddress(currentHref);
    setSuggestionBaseRouteAddress(currentHref);
  }, [currentHref]);

  const commitInput = useCallback(
    async (rawAddress: string, options: RouteUrlEditorCommitOptions) => {
      const draftHref = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (draftHref === null) {
        suggestionPreviewActiveRef.current = false;
        previewBaseHrefRef.current = null;
        setDraftRouteAddress(currentHref);
        setSuggestionBaseRouteAddress(currentHref);
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
      const nextDraftRouteAddress =
        routeUpdateDraftRouteAddress === draftHref || options.resetIncompleteDraft
          ? href
          : draftHref;
      setDraftRouteAddress(nextDraftRouteAddress);
      setSuggestionBaseRouteAddress(nextDraftRouteAddress);

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
    [currentHref, navigateRouteUrlEditorHref, origin, router.routesByPath, viewerIsAdmin],
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

  const blurInput = useCallback(() => {
    setInputFocused(false);
    setSuggestionsDismissed(false);
    setSuggestionDraftEditedSinceFocus(false);
    suggestionPreviewActiveRef.current = false;

    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      setDraftRouteAddress(currentHref);
      setSuggestionBaseRouteAddress(currentHref);
      return;
    }

    void commitInput(draftRouteAddress, {
      commitPreviewToHistory: false,
      replaceRouteOptions: true,
      resetIncompleteDraft: true,
    });
  }, [commitInput, currentHref, draftRouteAddress]);

  const focusInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      suggestionPreviewActiveRef.current = false;
      refreshDocumentHashSuggestionKeys();
      syncSuggestionSelection(event.currentTarget, draftRouteAddress);
      setInputFocused(true);
      setSuggestionsDismissed(false);
      setSuggestionDraftEditedSinceFocus(false);
    },
    [draftRouteAddress, refreshDocumentHashSuggestionKeys, syncSuggestionSelection],
  );

  const previewSuggestionByIndex = useCallback(
    (nextActiveSuggestionIndex: number) => {
      const nextSuggestion = suggestions[nextActiveSuggestionIndex];

      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        routeAddress: draftRouteAddress,
        selectionRouteIndex,
        suggestion: nextSuggestion,
      });

      setActiveSuggestionIndex(nextActiveSuggestionIndex);
      setDraftRouteAddress(nextDraftRouteAddress);
      suggestionPreviewActiveRef.current = true;

      previewDraftRouteAddress(nextDraftRouteAddress);
    },
    [draftRouteAddress, previewDraftRouteAddress, selectionRouteIndex, suggestions],
  );

  const moveActiveSuggestion = useCallback(
    (step: number) => {
      if (!suggestionsVisible || suggestions.length === 0) {
        setActiveSuggestionIndex(null);
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
      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        routeAddress: draftRouteAddress,
        selectionRouteIndex,
        suggestion,
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
      } else if (
        suggestion.kind === "search" &&
        suggestion.valueKind === "value" &&
        suggestion.valueSuggestions.length > 0
      ) {
        searchFollowup = {
          draftRouteAddress: nextDraftRouteAddress,
          kind: "search-value",
          selectionRouteIndex:
            readRouteUrlEditorSearchDraftSelectionRouteIndex(nextDraftRouteAddress),
        };
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
      const routeUpdateReady = isRouteUrlEditorRouteUpdateReady({
        currentHref,
        draftRouteAddress: nextDraftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewer: { isAdmin: viewerIsAdmin === true },
      });
      setDraftRouteAddress(nextDraftRouteAddress);
      setSuggestionsDismissed(activeFollowup === null);
      setSuggestionDraftEditedSinceFocus(activeFollowup !== null || !routeUpdateReady);
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
        setSuggestionBaseRouteAddress(activeFollowup.draftRouteAddress);
        setSuggestionKind(activeFollowup.kind);
        setSelectionRouteIndex(activeFollowup.selectionRouteIndex);
        setActiveSuggestionIndex(null);
        setSuggestionsDismissed(false);
        setSuggestionDraftEditedSinceFocus(true);

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
      draftRouteAddress,
      origin,
      router.routesByPath,
      selectionRouteIndex,
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
          setSuggestionsDismissed(false);

          if (routeBoundaryBackspace.routeAddress === draftRouteAddress) {
            return;
          }

          setDraftRouteAddress(routeBoundaryBackspace.routeAddress);
          setSuggestionDraftEditedSinceFocus(true);
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
        style={{ textIndent: `-${readRouteUrlEditorProtocolPrefix(origin).length}ch` }}
        title={routeInputTitle}
        type="text"
        value={inputValue}
      />
      {suggestionsVisible ? (
        <div
          className="absolute inset-x-1 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          data-suggestion-kind={suggestionKind}
          data-testid="route-url-editor-suggestions"
          id={suggestionsId}
          role="listbox"
        >
          {suggestions.map((suggestion, suggestionIndex) => {
            const active = suggestionIndex === activeSuggestionIndex;
            return (
              <button
                aria-label={`Use ${suggestion.value}`}
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

                  previewSuggestionByIndex(suggestionIndex);
                }}
                onMouseMove={() => {
                  if (!suppressSuggestionMousePreviewUntilMoveRef.current) {
                    return;
                  }

                  suppressSuggestionMousePreviewUntilMoveRef.current = false;
                  previewSuggestionByIndex(suggestionIndex);
                }}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                {suggestion.value}
              </button>
            );
          })}
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
