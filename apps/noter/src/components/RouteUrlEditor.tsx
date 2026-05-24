import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
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
  applyRouteUrlEditorSuggestion,
  readRouteUrlEditorSuggestionKind,
  readRouteUrlEditorSuggestions,
  type RouteUrlEditorSuggestion,
  type RouteUrlEditorSuggestionKind,
} from "@/lib/routeUrlEditorSuggestions";
import { RETAINED_ROOT_SEARCH_KEYS, validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { api } from "../../convex/_generated/api";

const routeUrlEditorIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const routeUrlEditorSubmitButtonClassName =
  "pointer-events-none flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:pointer-events-none disabled:opacity-50";

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

/**
 * Focus restores the absolute URL boundary for editing. Blur hides browser
 * boilerplate: protocol, plus the bare root slash when it carries no route text.
 */
function readRouteUrlEditorInputValue(args: {
  focused: boolean;
  origin: string;
  routeAddress: string;
}): string {
  const displayOrigin = args.focused ? args.origin : new URL(args.origin).host;
  if (!args.focused && args.routeAddress === "/") {
    return displayOrigin;
  }

  return `${displayOrigin}${args.routeAddress}`;
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
 * Displays route reality plus a focused local draft in one controlled URL
 * input. Route-option edits can apply while typing, but router normalization
 * does not replace the draft text until the user leaves the field.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const inputSelectionBeforeChangeRef = useRef<RouteUrlEditorInputSelection | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const origin = readRouteUrlEditorOrigin();
  const [draftRouteAddress, setDraftRouteAddress] = useState(currentHref);
  const [inputFocused, setInputFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionDraftEditedSinceFocus, setSuggestionDraftEditedSinceFocus] = useState(false);
  const [suggestionKind, setSuggestionKind] = useState<RouteUrlEditorSuggestionKind>("path");
  const [selectionRouteIndex, setSelectionRouteIndex] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const viewerIsAdmin = useQuery(api.users.isCurrentUserAdmin);
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = readRouteUrlEditorInputValue({
    focused: inputFocused,
    origin,
    routeAddress: draftRouteAddress,
  });
  const focusedInputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? focusedInputValue : `${origin}${draftHref}`;
  const suggestions = readRouteUrlEditorSuggestions({
    currentHref,
    draftEditedSinceFocus: suggestionDraftEditedSinceFocus,
    draftRouteAddress,
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

  // Links and Back/Forward change URL reality. While the input is focused,
  // draft text is allowed to be temporarily invalid or non-canonical.
  useEffect(() => {
    if (inputFocused) {
      return;
    }

    setDraftRouteAddress(currentHref);
  }, [currentHref, inputFocused]);

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

  const refreshRoute = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Intentionally match address-bar refresh: this is a browser reload, not a
    // router navigation.
    window.location.reload();
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
      setActiveSuggestionIndex(null);
    },
    [origin],
  );

  const syncSuggestionSelectionFromInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
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

  const changeDraftRouteAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraftRouteAddress = readRouteUrlEditorDraftRouteAddress({
        inputValue: event.currentTarget.value,
        origin,
      });
      if (nextDraftRouteAddress === null) {
        restoreRouteUrlEditorRejectedInput({
          input: event.currentTarget,
          selection: inputSelectionBeforeChangeRef.current,
          value: inputValue,
        });
        return;
      }

      setDraftRouteAddress(nextDraftRouteAddress);
      setSuggestionDraftEditedSinceFocus(true);
      setSuggestionsDismissed(false);
      syncSuggestionSelection(event.currentTarget, nextDraftRouteAddress);

      const nextHref = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: nextDraftRouteAddress,
      });

      if (nextHref === null || nextHref === currentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref,
        nextHref,
        origin,
      });

      if (commitMode === "route-options") {
        const nextUrl = new URL(nextHref, new URL(origin));
        void router.navigate({
          hash: readRouteUrlEditorHash(nextUrl),
          replace: true,
          search: () =>
            readRouteUrlEditorExactSearch({
              currentHref,
              nextHref,
              origin,
            }),
          resetScroll: false,
          to: nextUrl.pathname,
        });
      }
    },
    [currentHref, inputValue, origin, router, syncSuggestionSelection],
  );

  const resetInput = useCallback(() => {
    setDraftRouteAddress(currentHref);
  }, [currentHref]);

  const commitInput = useCallback(
    (rawAddress: string, options: { replaceRouteOptions: boolean }) => {
      const href = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (href === null) {
        setDraftRouteAddress(currentHref);
        return;
      }

      setDraftRouteAddress(href);

      if (href === currentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref,
        nextHref: href,
        origin,
      });

      switch (commitMode) {
        case "route-options": {
          const routeOptionsUrl = new URL(href, new URL(origin));
          void router.navigate({
            hash: readRouteUrlEditorHash(routeOptionsUrl),
            replace: options.replaceRouteOptions,
            search: () =>
              readRouteUrlEditorExactSearch({
                currentHref,
                nextHref: href,
                origin,
              }),
            resetScroll: false,
            to: routeOptionsUrl.pathname,
          });
          return;
        }
        case "route-navigation": {
          const routeNavigationUrl = new URL(href, new URL(origin));
          void router.navigate({
            hash: readRouteUrlEditorHash(routeNavigationUrl),
            search: () =>
              readRouteUrlEditorExactSearch({
                currentHref,
                nextHref: href,
                origin,
              }),
            to: routeNavigationUrl.pathname,
          });
          return;
        }
      }
    },
    [currentHref, origin, router],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      commitInput(draftRouteAddress, { replaceRouteOptions: false });
    },
    [commitInput, draftRouteAddress],
  );

  const blurInput = useCallback(() => {
    setInputFocused(false);
    setSuggestionsDismissed(false);
    setSuggestionDraftEditedSinceFocus(false);

    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      setDraftRouteAddress(currentHref);
      return;
    }

    commitInput(draftRouteAddress, { replaceRouteOptions: true });
  }, [commitInput, currentHref, draftRouteAddress]);

  const focusInput = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      syncSuggestionSelection(event.currentTarget, draftRouteAddress);
      setInputFocused(true);
      setSuggestionsDismissed(false);
      setSuggestionDraftEditedSinceFocus(false);
    },
    [draftRouteAddress, syncSuggestionSelection],
  );

  const moveActiveSuggestion = useCallback(
    (step: number) => {
      setActiveSuggestionIndex((currentActiveSuggestionIndex) => {
        if (!suggestionsVisible || suggestions.length === 0) {
          return null;
        }

        if (currentActiveSuggestionIndex === null) {
          return step > 0 ? 0 : suggestions.length - 1;
        }

        return (currentActiveSuggestionIndex + step + suggestions.length) % suggestions.length;
      });
    },
    [suggestions.length, suggestionsVisible],
  );

  const selectSuggestion = useCallback(
    (suggestion: RouteUrlEditorSuggestion) => {
      const nextDraftRouteAddress = applyRouteUrlEditorSuggestion({
        routeAddress: draftRouteAddress,
        selectionRouteIndex,
        suggestion,
      });
      setDraftRouteAddress(nextDraftRouteAddress);
      setSuggestionsDismissed(true);
      setSuggestionDraftEditedSinceFocus(false);
      commitInput(nextDraftRouteAddress, { replaceRouteOptions: false });
      inputRef.current?.focus();
    },
    [commitInput, draftRouteAddress, selectionRouteIndex],
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
        case "Escape":
          skipNextBlurCommitRef.current = true;
          resetInput();
          event.currentTarget.blur();
          return;
      }
    },
    [activeSuggestion, moveActiveSuggestion, resetInput, selectSuggestion, suggestionsVisible],
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
      className="group relative flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
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
        onClick={refreshRoute}
        title="Refresh"
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
      </button>
      {/*
        URL reality comes from the router. Draft reality stays local in one
        native input so host/path text selection remains browser-owned.
      */}
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
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-sm leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive"
        data-testid="route-url-editor-input"
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
      <button
        aria-label="Go to route URL"
        className={routeUrlEditorSubmitButtonClassName}
        title="Go to route URL"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
      {routeInputInvalid ? (
        <span className="sr-only" id={`${inputId}-error`}>
          Enter a same-origin app URL.
        </span>
      ) : null}
    </form>
  );
}
