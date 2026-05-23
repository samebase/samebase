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

const routeUrlEditorIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const routeUrlEditorSubmitButtonClassName =
  "pointer-events-none flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 disabled:pointer-events-none disabled:opacity-50";

function readRouteUrlEditorOrigin(): string {
  return typeof window === "undefined" ? "https://noter.local" : window.location.origin;
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

/**
 * Displays route reality plus a local draft in one controlled URL input. Edits
 * stay local until blur or submit so route normalization cannot move the cursor
 * while the user is still typing.
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
  const origin = readRouteUrlEditorOrigin();
  const [draftRouteAddress, setDraftRouteAddress] = useState(currentHref);
  const draftHref = normalizeRouteUrlEditorHref({
    currentHref,
    origin,
    rawHref: draftRouteAddress,
  });
  const routeInputInvalid = draftRouteAddress.trim() !== "" && draftHref === null;
  const inputValue = `${origin}${draftRouteAddress}`;
  const routeInputTitle = draftHref === null ? inputValue : `${origin}${draftHref}`;

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

  // Links, Back/Forward, and committed edits change URL reality. Draft text
  // stays local between keystrokes so route parsing only wins on commit.
  useEffect(() => {
    setDraftRouteAddress(currentHref);
  }, [currentHref]);

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
    },
    [inputValue, origin],
  );

  const resetInput = useCallback(() => {
    setDraftRouteAddress(currentHref);
  }, [currentHref]);

  const commitInput = useCallback(
    (rawAddress: string) => {
      const href = normalizeRouteUrlEditorHref({
        currentHref,
        origin,
        rawHref: rawAddress,
      });

      if (href === null) {
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
        case "route-options":
          void router.navigate({
            href,
            resetScroll: false,
          });
          return;
        case "route-navigation":
          void router.navigate({
            href,
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

  const blurInput = useCallback(() => {
    commitInput(draftRouteAddress);
  }, [commitInput, draftRouteAddress]);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      inputSelectionBeforeChangeRef.current = readRouteUrlEditorInputSelection(event.currentTarget);

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
        onBeforeInput={rememberInputSelection}
        onBlur={blurInput}
        onChange={changeDraftRouteAddress}
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
