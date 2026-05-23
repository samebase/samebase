import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";

const routeUrlEditorIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const routeUrlEditorSubmitButtonClassName =
  "pointer-events-none flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:pointer-events-none disabled:opacity-50";

function readRouteUrlEditorOrigin(): string {
  return typeof window === "undefined" ? "https://noter.local" : window.location.origin;
}

function readRouteUrlEditorHost(): string {
  if (typeof window !== "undefined") {
    return window.location.host;
  }

  return new URL(readRouteUrlEditorOrigin()).host;
}

function formatRouteUrlEditorAddress(href: string): string {
  const origin = readRouteUrlEditorOrigin();

  try {
    const url = new URL(href, origin);
    if (url.origin === origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return href;
  }

  return href;
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

export function RouteUrlEditor() {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const currentRouteHistoryIndex = location.state.__TSR_index;
  const originInputId = useId();
  const routeInputId = useId();
  const [forwardRouteHistoryIndex, setForwardRouteHistoryIndex] =
    useState(currentRouteHistoryIndex);
  const [editorFocused, setEditorFocused] = useState(false);
  const [routeInputFocused, setRouteInputFocused] = useState(false);
  const origin = readRouteUrlEditorOrigin();
  const host = readRouteUrlEditorHost();
  const urlRealityAddress = formatRouteUrlEditorAddress(currentHref);
  const [draftRouteAddress, setDraftRouteAddress] = useState(urlRealityAddress);
  const draftRouteResult = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid =
    draftRouteAddress.trim() !== "" && draftRouteResult.status === "invalid";
  const routeInputTitle =
    draftRouteResult.status === "valid" ? `${host}${draftRouteResult.href}` : draftRouteAddress;
  const originInputValue = editorFocused ? origin : host;
  const originInputSize = Math.max(originInputValue.length, 1);

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

  // Links and Back/Forward change URL reality; focused route edits keep their
  // draft text so live search/hash navigation cannot race the caret.
  useEffect(() => {
    if (routeInputFocused) {
      return;
    }

    setDraftRouteAddress(urlRealityAddress);
  }, [routeInputFocused, urlRealityAddress]);

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

  const focusRouteUrlEditor = useCallback(() => {
    setEditorFocused(true);
  }, []);

  const blurRouteUrlEditor = useCallback((event: FocusEvent<HTMLFormElement>) => {
    const nextFocusedTarget = event.relatedTarget;
    if (nextFocusedTarget instanceof Node && event.currentTarget.contains(nextFocusedTarget)) {
      return;
    }

    setEditorFocused(false);
  }, []);

  const focusRouteInput = useCallback(() => {
    setRouteInputFocused(true);
  }, []);

  const blurRouteInput = useCallback(() => {
    setRouteInputFocused(false);
  }, []);

  const changeDraftRouteAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraftRouteAddress = event.currentTarget.value;
      setDraftRouteAddress(nextDraftRouteAddress);
      const nextHrefResult = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: nextDraftRouteAddress,
      });

      if (nextHrefResult.status === "invalid" || nextHrefResult.href === currentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref,
        nextHref: nextHrefResult.href,
        origin,
      });

      if (commitMode === "route-options") {
        void router.navigate({
          href: nextHrefResult.href,
          replace: true,
          resetScroll: false,
        });
      }
    },
    [currentHref, origin, router],
  );

  const resetInput = useCallback(() => {
    setDraftRouteAddress(urlRealityAddress);
  }, [urlRealityAddress]);

  const commitInput = useCallback(
    (rawAddress: string) => {
      const result = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (result.status === "invalid") {
        return;
      }

      setDraftRouteAddress(result.href);

      if (result.href === currentHref) {
        return;
      }

      const commitMode = getRouteUrlEditorCommitMode({
        currentHref,
        nextHref: result.href,
        origin,
      });

      switch (commitMode) {
        case "route-options":
          void router.navigate({
            href: result.href,
            resetScroll: false,
          });
          return;
        case "route-navigation":
          void router.navigate({
            href: result.href,
          });
          return;
      }
    },
    [currentHref, origin, router],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      commitInput(draftRouteAddress);
    },
    [commitInput, draftRouteAddress],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") {
        return;
      }

      resetInput();
      event.currentTarget.blur();
    },
    [resetInput],
  );

  return (
    <form
      className="group flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
      data-testid="route-url-editor"
      onBlur={blurRouteUrlEditor}
      onFocus={focusRouteUrlEditor}
      onSubmit={submitInput}
    >
      <label className="sr-only" htmlFor={originInputId}>
        Route origin
      </label>
      <label className="sr-only" htmlFor={routeInputId}>
        Route path
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
      <div className="flex min-w-0 flex-1 items-center">
        <input
          aria-label="Route origin"
          className="h-7 min-w-[6ch] max-w-[45%] shrink-0 border-0 bg-transparent p-0 font-mono text-sm leading-7 text-muted-foreground outline-none selection:bg-primary/20 focus:text-foreground"
          data-testid="route-url-editor-origin-input"
          id={originInputId}
          readOnly
          size={originInputSize}
          suppressHydrationWarning
          title={origin}
          type="text"
          value={originInputValue}
        />
        {/*
          URL reality comes from the router. The route draft is the only
          editable field; same-path search/hash edits can apply live.
        */}
        <input
          aria-describedby={routeInputInvalid ? `${routeInputId}-error` : undefined}
          aria-invalid={routeInputInvalid}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-sm leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive"
          data-testid="route-url-editor-input"
          id={routeInputId}
          inputMode="url"
          name="routeHref"
          onBlur={blurRouteInput}
          onChange={changeDraftRouteAddress}
          onFocus={focusRouteInput}
          onKeyDown={handleInputKeyDown}
          spellCheck={false}
          suppressHydrationWarning
          title={routeInputTitle}
          type="text"
          value={draftRouteAddress}
        />
      </div>
      <button
        aria-label="Go to route URL"
        className={routeUrlEditorSubmitButtonClassName}
        title="Go to route URL"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
      {routeInputInvalid ? (
        <span className="sr-only" id={`${routeInputId}-error`}>
          Enter a same-origin app URL.
        </span>
      ) : null}
    </form>
  );
}
