import { useLocation, useRouter } from "@tanstack/react-router";
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
import { RETAINED_ROOT_SEARCH_KEYS, validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";

const routeUrlEditorIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const routeUrlEditorSubmitButtonClassName =
  "pointer-events-none flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:pointer-events-none disabled:opacity-50";

function readRouteUrlEditorOrigin(): string {
  return typeof window === "undefined" ? "https://noter.local" : window.location.origin;
}

function readRouteUrlEditorDisplayOrigin(args: { focused: boolean; origin: string }): string {
  return args.focused ? args.origin : new URL(args.origin).host;
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
  const [forwardRouteHistoryIndex, setForwardRouteHistoryIndex] =
    useState(currentRouteHistoryIndex);
  const inputSelectionBeforeChangeRef = useRef<RouteUrlEditorInputSelection | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const origin = readRouteUrlEditorOrigin();
  const [draftRouteAddress, setDraftRouteAddress] = useState(currentHref);
  const [inputFocused, setInputFocused] = useState(false);
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = `${readRouteUrlEditorDisplayOrigin({ focused: inputFocused, origin })}${draftRouteAddress}`;
  const focusedInputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? focusedInputValue : `${origin}${draftHref}`;

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
    [currentHref, inputValue, origin, router],
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

    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      setDraftRouteAddress(currentHref);
      return;
    }

    commitInput(draftRouteAddress, { replaceRouteOptions: true });
  }, [commitInput, currentHref, draftRouteAddress]);

  const focusInput = useCallback(() => {
    setInputFocused(true);
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      inputSelectionBeforeChangeRef.current = readRouteUrlEditorInputSelection(event.currentTarget);

      if (event.key !== "Escape") {
        return;
      }

      skipNextBlurCommitRef.current = true;
      resetInput();
      event.currentTarget.blur();
    },
    [resetInput],
  );

  return (
    <form
      className="group flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
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
        aria-describedby={routeInputInvalid ? `${inputId}-error` : undefined}
        aria-invalid={routeInputInvalid}
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
        onFocus={focusInput}
        onKeyDown={handleInputKeyDown}
        onSelect={rememberInputSelection}
        spellCheck={false}
        suppressHydrationWarning
        title={routeInputTitle}
        type="text"
        value={inputValue}
      />
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
