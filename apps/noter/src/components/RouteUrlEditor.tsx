import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
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

function formatRouteUrlEditorAddress(href: string): string {
  const origin = readRouteUrlEditorOrigin();

  try {
    const url = new URL(href, origin);
    const originUrl = new URL(origin);
    if (url.origin === originUrl.origin) {
      return `${url.host}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return href;
  }

  return href;
}

export function RouteUrlEditor() {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const currentAddress = formatRouteUrlEditorAddress(currentHref);
  const currentHistoryIndex = location.state.__TSR_index;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalidInput, setInvalidInput] = useState(false);
  const [forwardHistoryIndex, setForwardHistoryIndex] = useState(currentHistoryIndex);

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

  const clearInvalidInput = useCallback(() => {
    if (invalidInput) {
      setInvalidInput(false);
    }
  }, [invalidInput]);

  const resetInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.value = currentAddress;
    setInvalidInput(false);
  }, [currentAddress]);

  const commitInput = useCallback(
    (rawAddress: string) => {
      const result = normalizeRouteUrlEditorHref({
        currentHref,
        origin: readRouteUrlEditorOrigin(),
        rawHref: rawAddress,
      });

      if (result.status === "invalid") {
        setInvalidInput(true);
        return;
      }

      const input = inputRef.current;
      if (input) {
        input.value = formatRouteUrlEditorAddress(result.href);
      }
      setInvalidInput(false);

      if (result.href === currentHref) {
        return;
      }

      void router.navigate({
        href: result.href,
      });
    },
    [currentHref, router],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const input = inputRef.current;
      if (!input) {
        return;
      }

      commitInput(input.value);
    },
    [commitInput],
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
        Keep typing uncontrolled: URL changes remount the input, but ordinary
        keystrokes do not copy address text through React state.
      */}
      <input
        key={currentHref}
        ref={inputRef}
        aria-describedby={invalidInput ? `${inputId}-error` : undefined}
        aria-invalid={invalidInput}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-sm leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive"
        data-testid="route-url-editor-input"
        defaultValue={currentAddress}
        id={inputId}
        inputMode="url"
        name="routeHref"
        onInput={clearInvalidInput}
        onKeyDown={handleInputKeyDown}
        spellCheck={false}
        title={currentAddress}
        type="text"
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
