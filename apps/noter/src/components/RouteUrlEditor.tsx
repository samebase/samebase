import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ChangeEvent,
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

function formatRouteUrlEditorDisplayAddress(args: {
  address: string;
  focused: boolean;
  host: string;
  origin: string;
  status: RouteUrlEditorDraftReality["status"];
}): string {
  if (args.status === "raw") {
    return args.address;
  }

  return `${args.focused ? args.origin : args.host}${args.address}`;
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

type RouteUrlEditorDraftReality =
  | {
      status: "same-origin";
      address: string;
    }
  | {
      status: "raw";
      address: string;
    };

function readRouteUrlEditorSameOriginDraftAddress(args: {
  host: string;
  origin: string;
  rawAddress: string;
}): string | null {
  const trimmedAddress = args.rawAddress.trim();
  const sameOriginPrefixes = [args.origin, args.host];

  for (const prefix of sameOriginPrefixes) {
    if (trimmedAddress === prefix) {
      return "/";
    }

    if (
      trimmedAddress.startsWith(`${prefix}/`) ||
      trimmedAddress.startsWith(`${prefix}?`) ||
      trimmedAddress.startsWith(`${prefix}#`)
    ) {
      return trimmedAddress.slice(prefix.length);
    }
  }

  return null;
}

function readRouteUrlEditorDraftFromInput(args: {
  currentHref: string;
  host: string;
  origin: string;
  rawAddress: string;
}): RouteUrlEditorDraftReality {
  const sameOriginAddress = readRouteUrlEditorSameOriginDraftAddress({
    host: args.host,
    origin: args.origin,
    rawAddress: args.rawAddress,
  });
  if (sameOriginAddress) {
    return {
      status: "same-origin",
      address: sameOriginAddress,
    };
  }

  const result = normalizeRouteUrlEditorHref({
    currentHref: args.currentHref,
    origin: args.origin,
    rawHref: args.rawAddress,
  });

  if (result.status === "valid") {
    return {
      status: "same-origin",
      address:
        args.rawAddress.startsWith("/") ||
        args.rawAddress.startsWith("?") ||
        args.rawAddress.startsWith("#")
          ? args.rawAddress
          : formatRouteUrlEditorAddress(result.href),
    };
  }

  return {
    status: "raw",
    address: args.rawAddress,
  };
}

function isRouteUrlEditorIncompleteOptionDraft(address: string): boolean {
  return address.endsWith("?") || address.endsWith("#");
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
  const inputId = useId();
  const [forwardRouteHistoryIndex, setForwardRouteHistoryIndex] =
    useState(currentRouteHistoryIndex);
  const [inputFocused, setInputFocused] = useState(false);
  const origin = readRouteUrlEditorOrigin();
  const host = readRouteUrlEditorHost();
  const urlRealityAddress = formatRouteUrlEditorAddress(currentHref);
  const [draftReality, setDraftReality] = useState<RouteUrlEditorDraftReality>({
    status: "same-origin",
    address: urlRealityAddress,
  });
  const draftRouteAddress = draftReality.address;
  const draftRouteResult = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid =
    draftRouteAddress.trim() !== "" && draftRouteResult.status === "invalid";
  const routeInputTitle =
    draftRouteResult.status === "valid" ? `${host}${draftRouteResult.href}` : draftRouteAddress;
  const inputValue = formatRouteUrlEditorDisplayAddress({
    address: draftRouteAddress,
    focused: inputFocused,
    host,
    origin,
    status: draftReality.status,
  });

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

  // Links and Back/Forward change URL reality; focused edits keep their draft
  // text so live search/hash navigation cannot race the caret.
  useEffect(() => {
    if (inputFocused) {
      return;
    }

    setDraftReality({
      status: "same-origin",
      address: urlRealityAddress,
    });
  }, [inputFocused, urlRealityAddress]);

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

  const focusInput = useCallback(() => {
    setInputFocused(true);
  }, []);

  const blurInput = useCallback(() => {
    setInputFocused(false);
  }, []);

  const changeDraftRouteAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraftReality = readRouteUrlEditorDraftFromInput({
        currentHref,
        host,
        origin,
        rawAddress: event.currentTarget.value,
      });
      setDraftReality(nextDraftReality);

      if (nextDraftReality.status === "raw") {
        return;
      }

      const nextHrefResult = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: nextDraftReality.address,
      });

      if (nextHrefResult.status === "invalid" || nextHrefResult.href === currentHref) {
        return;
      }

      if (isRouteUrlEditorIncompleteOptionDraft(nextDraftReality.address)) {
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
    [currentHref, host, origin, router],
  );

  const resetInput = useCallback(() => {
    setDraftReality({
      status: "same-origin",
      address: urlRealityAddress,
    });
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

      setDraftReality({
        status: "same-origin",
        address: result.href,
      });

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
        onBlur={blurInput}
        onChange={changeDraftRouteAddress}
        onFocus={focusInput}
        onKeyDown={handleInputKeyDown}
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
