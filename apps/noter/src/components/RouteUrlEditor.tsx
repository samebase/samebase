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

function formatRouteUrlEditorDraftAddress(rawAddress: string): string {
  const origin = readRouteUrlEditorOrigin();
  const host = readRouteUrlEditorHost();
  const trimmedAddress = rawAddress.trim();
  const fullOriginAddress =
    trimmedAddress === origin ||
    trimmedAddress.startsWith(`${origin}/`) ||
    trimmedAddress.startsWith(`${origin}?`) ||
    trimmedAddress.startsWith(`${origin}#`);
  const hostAddress =
    trimmedAddress === host ||
    trimmedAddress.startsWith(`${host}/`) ||
    trimmedAddress.startsWith(`${host}?`) ||
    trimmedAddress.startsWith(`${host}#`);

  if (fullOriginAddress || hostAddress) {
    return formatRouteUrlEditorAddress(hostAddress ? `//${trimmedAddress}` : trimmedAddress);
  }

  return rawAddress;
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
  const urlRealityAddress = formatRouteUrlEditorAddress(currentHref);
  const currentHistoryIndex = location.state.__TSR_index;
  const inputId = useId();
  const [invalidInput, setInvalidInput] = useState(false);
  const [forwardHistoryIndex, setForwardHistoryIndex] = useState(currentHistoryIndex);
  const [draftRealityAddress, setDraftRealityAddress] = useState(urlRealityAddress);

  const canGoBack = currentHistoryIndex > 0;
  const canGoForward = currentHistoryIndex < forwardHistoryIndex;

  // TanStack exposes back availability; keep the reached route index so Forward
  // only enables after this chrome has actually seen a later app entry.
  useEffect(
    () =>
      router.history.subscribe(({ action, location: nextLocation }) => {
        const nextHistoryIndex = nextLocation.state.__TSR_index;
        setForwardHistoryIndex((currentForwardHistoryIndex) => {
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

  // Links, Back/Forward, and committed edits change URL reality; uncommitted
  // draft text stays local only until one of those route commits lands.
  useEffect(() => {
    setDraftRealityAddress(urlRealityAddress);
    setInvalidInput(false);
  }, [urlRealityAddress]);

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

    window.location.reload();
  }, []);

  const changeDraftRealityAddress = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDraftRealityAddress(formatRouteUrlEditorDraftAddress(event.currentTarget.value));

      if (invalidInput) {
        setInvalidInput(false);
      }
    },
    [invalidInput],
  );

  const resetInput = useCallback(() => {
    setDraftRealityAddress(urlRealityAddress);
    setInvalidInput(false);
  }, [urlRealityAddress]);

  const commitInput = useCallback(
    (rawAddress: string) => {
      const origin = readRouteUrlEditorOrigin();
      const result = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (result.status === "invalid") {
        setInvalidInput(true);
        return;
      }

      setDraftRealityAddress(formatRouteUrlEditorAddress(result.href));
      setInvalidInput(false);

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
    [currentHref, router],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      commitInput(draftRealityAddress);
    },
    [commitInput, draftRealityAddress],
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
        URL reality comes from the router. Draft reality stays local until
        submit, so option edits never navigate while the user is typing.
      */}
      <input
        aria-describedby={invalidInput ? `${inputId}-error` : undefined}
        aria-invalid={invalidInput}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-sm leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive"
        data-testid="route-url-editor-input"
        id={inputId}
        inputMode="url"
        name="routeHref"
        onChange={changeDraftRealityAddress}
        onKeyDown={handleInputKeyDown}
        spellCheck={false}
        title={urlRealityAddress}
        type="text"
        value={draftRealityAddress}
      />
      <button
        aria-label="Go to route URL"
        className={routeUrlEditorSubmitButtonClassName}
        title="Go to route URL"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
      {invalidInput ? (
        <span className="sr-only" id={`${inputId}-error`}>
          Enter a same-origin app URL.
        </span>
      ) : null}
    </form>
  );
}
