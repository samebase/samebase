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
import { isRouteUrlEditorHostSegment, normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";

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

function readRouteUrlEditorProtocolPrefix(): string {
  return `${new URL(readRouteUrlEditorOrigin()).protocol}//`;
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

function readRouteUrlEditorExplicitSameOriginAddress(rawAddress: string): string | null {
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
    try {
      const url = new URL(hostAddress ? `//${trimmedAddress}` : trimmedAddress, origin);
      if (url.origin === origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readRouteUrlEditorDraftFromInput(rawAddress: string): RouteUrlEditorDraftReality {
  const explicitSameOriginAddress = readRouteUrlEditorExplicitSameOriginAddress(rawAddress);

  if (explicitSameOriginAddress) {
    return {
      status: "same-origin",
      address: explicitSameOriginAddress,
    };
  }

  const firstAddressSegment = rawAddress.trim().split(/[/?#]/, 1)[0] ?? "";
  const schemeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawAddress.trim());
  const hostLikeAddress =
    /^[a-z0-9.[\]-]+(?::\d+)?$/i.test(firstAddressSegment) &&
    isRouteUrlEditorHostSegment(firstAddressSegment);

  if (!schemeAddress && !hostLikeAddress) {
    return {
      status: "same-origin",
      address: rawAddress,
    };
  }

  return {
    status: "raw",
    address: rawAddress,
  };
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
  const currentHistoryIndex = location.state.__TSR_index;
  const inputId = useId();
  const [invalidInput, setInvalidInput] = useState(false);
  const [forwardHistoryIndex, setForwardHistoryIndex] = useState(currentHistoryIndex);
  const protocolPrefix = readRouteUrlEditorProtocolPrefix();
  const host = readRouteUrlEditorHost();
  const urlRealityAddress = formatRouteUrlEditorAddress(currentHref);
  const [draftReality, setDraftReality] = useState<RouteUrlEditorDraftReality>({
    status: "same-origin",
    address: urlRealityAddress,
  });
  const draftRealityAddress = draftReality.address;
  const urlRealityFullAddress = `${host}${urlRealityAddress}`;

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
    setDraftReality({
      status: "same-origin",
      address: urlRealityAddress,
    });
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
      setDraftReality(readRouteUrlEditorDraftFromInput(event.currentTarget.value));

      if (invalidInput) {
        setInvalidInput(false);
      }
    },
    [invalidInput],
  );

  const resetInput = useCallback(() => {
    setDraftReality({
      status: "same-origin",
      address: urlRealityAddress,
    });
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

      setDraftReality({
        status: "same-origin",
        address: formatRouteUrlEditorAddress(result.href),
      });
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
      {draftReality.status === "same-origin" ? (
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-sm leading-7 text-muted-foreground"
          data-testid="route-url-editor-origin"
          suppressHydrationWarning
        >
          <span
            className="hidden group-focus-within:inline"
            data-testid="route-url-editor-protocol"
          >
            {protocolPrefix}
          </span>
          <span data-testid="route-url-editor-host">{host}</span>
        </span>
      ) : null}
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
        suppressHydrationWarning
        title={urlRealityFullAddress}
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
