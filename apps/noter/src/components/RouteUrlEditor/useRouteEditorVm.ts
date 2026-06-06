import type {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  SyntheticEvent,
} from "react";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { includes } from "@noter-md/dependent";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { RETAINED_ROOT_SEARCH_KEYS, validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { api } from "../../../convex/_generated/api";
import {
  readRouteAddressReadiness,
  readSuggestions,
  type RouteAddressReadiness,
  type Suggestion,
} from "./RouteUrlEditorSuggestions";
import { keepState, runTransitionActions } from "./typedTransitionTable";
import { useTypedTransitionMachine } from "./useTypedTransitionMachine";
import type {
  TypedTransitionActionHandlerTable,
  TypedTransitionTable,
} from "./typedTransitionTable";

type RouteAddressSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

type RouteEditorSuggestionHoverPath = {
  draftPath: string;
  expectedRouteAddress: string;
};

/**
RouteEditorState stores route addresses, not full visible input values.

routeAddress while focused = hoverPath?.draftPath ?? draftPath

draftPath = the editable route address while `kind` is `"focused"`. Starts with `/`, never includes
`prefix`.

hoverPath = desktop suggestion hover. It changes the visible route address without changing
`draftPath`.

expectedRouteAddress = check only: what TanStack should already show. Do not use it as a second
source of truth for blurred display.

Blurred state does not store `committedRouteAddress`. It renders `committedRouteAddress` from
TanStack.

Example focused state:

{
  kind: "focused",
  prefix: "https://noter.md/",
  draftPath: "/logo?top=red-",
  expectedRouteAddress: "/logo",
  hoverPath: null,
  selection: { start: 22, end: 22, direction: "none" },
}

A partial query value can keep `draftPath` at `/logo?top=red-` while `expectedRouteAddress` stays
`/logo`.

Example desktop hover:

{
  kind: "focused",
  prefix: "https://noter.md/",
  draftPath: "/terms?top=red-",
  expectedRouteAddress: "/terms",
  hoverPath: {
    draftPath: "/privacy?top=red-",
    expectedRouteAddress: "/privacy",
  },
  selection: { start: 19, end: 19, direction: "none" },
}

Example blurred state:

{
  kind: "blurred",
  prefix: "https://noter.md/",
}
*/
export type RouteEditorState =
  | {
      kind: "blurred";
      prefix: string;
    }
  | {
      kind: "focused";
      draftPath: string;
      expectedRouteAddress: string;
      hoverPath: RouteEditorSuggestionHoverPath | null;
      prefix: string;
      selection: RouteAddressSelection;
    };

export type RouteEditorVmProps = {
  onDebugStateChange?: (state: RouteEditorState) => void;
};

type RouteEditorPreventNativeEditContext = {
  preventDefault: () => void;
};

type RouteEditorRouteActionContext = {
  replaceRoute: (routeAddress: string) => void;
};

type RouteEditorReplaceRouteContext = RouteEditorRouteActionContext & {
  readRouteAddressReadiness: (args: {
    currentRouteAddress: string;
    draftRouteAddress: string;
  }) => RouteAddressReadiness;
};

type RouteEditorEvent =
  // React input `onChange` sends the visible input value after native editing
  // already ran. `nextInputValue` includes `prefix`; `nextSelection` is the
  // browser selection after that edit.
  | {
      type: "changedInput";
      nextInputValue: string;
      nextSelection: RouteAddressSelection;
      context: RouteEditorReplaceRouteContext;
    }
  // React input `onSelect` sends `selection` for the current `inputValue`.
  //
  // Example: `draftPath` is `/terms?top=red-`, then `hoverPath.draftPath`
  // becomes `/privacy?top=red-`. The input visibly shows `hoverPath.draftPath`,
  // but `draftPath` is still `/terms?top=red-` until `selectedSuggestion`.
  // Cursor indexes from `hoverPath.draftPath` cannot be stored into `selection`
  // for `draftPath`.
  | {
      type: "changedSelection";
      selection: RouteAddressSelection;
    }
  // Root `onBlur` when focus leaves the editor subtree. Historical name:
  // `clickedOutside` is also sent by keyboard focus movement, not only clicks.
  | {
      type: "clickedOutside";
      context: RouteEditorRouteActionContext;
    }
  // Input focus/click that starts or resumes editing. `committedRouteAddress`
  // is the TanStack route when the input becomes editable.
  | {
      type: "clickedInput";
      committedRouteAddress: string;
      selection: RouteAddressSelection;
    }
  // Escape key while the input has focus. This asks the editor to close from the keyboard.
  | {
      type: "pressedEscape";
      context: RouteEditorRouteActionContext;
    }
  // Locked-prefix editing.
  // Plain Backspace would touch the locked prefix and may need synchronous preventDefault before
  // native editing runs.
  | {
      type: "requestedLockedPrefixBackspace";
      selection: RouteAddressSelection;
      context: RouteEditorPreventNativeEditContext;
    }
  // A native edit would change part of `prefix`. The FSM can change `selection`
  // first, then let the browser perform Delete, Cut, Paste, printable
  // replacement, or Mod+Backspace.
  | {
      type: "requestedEditableSelection";
      selection: RouteAddressSelection;
    }
  // User clicks a suggestion row while the editor stays focused.
  //
  // Example: `draftPath` is `/terms?top=red-` and the user clicks the
  // `/privacy` path row. `draftPath` becomes `/privacy?top=red-`, `hoverPath`
  // becomes `null`, and `selection` moves to `nextSelectionRouteIndex`.
  | {
      type: "selectedSuggestion";
      context: RouteEditorReplaceRouteContext;
      nextSelectionRouteIndex: number;
      routeAddress: string;
    }
  // Pointer moved over a suggestion row. This sets `hoverPath` without changing
  // `draftPath`.
  | {
      type: "hoveredSuggestion";
      context: RouteEditorReplaceRouteContext;
      routeAddress: string;
    }
  // Pointer left the suggestion list. This sets `hoverPath` back to `null`
  // while `kind` stays `"focused"`.
  | {
      type: "clearedHoverPath";
      context: RouteEditorRouteActionContext;
    }
  // TanStack `useLocation()` changed `committedRouteAddress`. `path` can match
  // `expectedRouteAddress`, match `hoverPath.expectedRouteAddress`, or be a
  // route change from outside this editor state.
  | {
      type: "changedCommittedRoute";
      path: string;
    };

type RouteEditorAction =
  // `blurInput` and `preventNativeEdit` run DOM methods synchronously.
  | {
      brand: "blurInput";
    }
  | {
      brand: "preventNativeEdit";
      context: RouteEditorPreventNativeEditContext;
    }
  // `setInputSelection` writes `selection` back into the input.
  | {
      brand: "setInputSelection";
      selection: RouteAddressSelection;
    }
  // `replaceRoute` replaces the TanStack route with `routeAddress`.
  | {
      brand: "replaceRoute";
      routeAddress: string;
      context: RouteEditorRouteActionContext;
    };

type RouteEditorActionHandlerTable = TypedTransitionActionHandlerTable<
  RouteEditorAction["brand"],
  RouteEditorAction
>;

type RouteEditorTransitionTable = TypedTransitionTable<
  RouteEditorState["kind"],
  RouteEditorEvent["type"],
  RouteEditorState,
  RouteEditorEvent,
  RouteEditorAction
>;

function readRouteAddressFocusedDraft(routeAddress: string): string {
  if (routeAddress === "/") {
    return routeAddress;
  }

  const continuation = routeAddress.includes("?") ? "&" : "?";
  return `${routeAddress}${continuation}`;
}

function readInputSelectionFromRouteIndex(
  prefix: string,
  routeIndex: number,
): RouteAddressSelection {
  const position = prefix.length + routeIndex - 1;

  return {
    direction: "none",
    end: position,
    start: position,
  };
}

const routeEditorTransition: RouteEditorTransitionTable = {
  blurred: {
    clickedInput: (prev, event) =>
      keepState({
        kind: "focused",
        draftPath: readRouteAddressFocusedDraft(event.committedRouteAddress),
        expectedRouteAddress: event.committedRouteAddress,
        hoverPath: null,
        prefix: prev.prefix,
        selection: event.selection,
      }),
  },

  focused: {
    changedCommittedRoute: (prev, event) => {
      // Example 1: user types `/logo`, this FSM calls replaceRoute(`/logo`),
      // then TanStack reports `/logo`. That matches expectedRouteAddress, so
      // the editor stays focused.
      //
      // Example 2: draftPath is `/terms?top=red-`; hovering `/privacy` visibly
      // shows `/privacy?top=red-` and calls replaceRoute(`/privacy`). TanStack
      // reports `/privacy`, which matches hoverPath.expectedRouteAddress, so
      // `hoverPath` stays set.
      if (
        event.path === prev.expectedRouteAddress ||
        event.path === prev.hoverPath?.expectedRouteAddress
      ) {
        return keepState(prev);
      }

      // Example: while editing, Back/Forward or another app link changes the
      // route to `/home`. That matches neither `expectedRouteAddress` nor
      // `hoverPath.expectedRouteAddress`, so close the editor and show
      // `committedRouteAddress`.
      return {
        actions: [{ brand: "blurInput" }],
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    changedInput: (prev, event) => {
      // If `nextInputValue` no longer starts with `prefix`, keep `prev` so the
      // controlled input restores `draftPath` or `hoverPath.draftPath`.
      if (!event.nextInputValue.startsWith(prev.prefix)) {
        return keepState(prev);
      }

      const draftPath = `/${event.nextInputValue.slice(prev.prefix.length)}`;
      // Example: draftPath is `/terms?top=red-`, hoverPath visibly shows
      // `/privacy?top=red-`, and the browser route is already `/privacy`.
      // Once the user types, this edit belongs to draftPath again, so classify
      // from prev.expectedRouteAddress (`/terms`), not the browser route.
      const readiness = event.context.readRouteAddressReadiness({
        currentRouteAddress: prev.expectedRouteAddress,
        draftRouteAddress: draftPath,
      });
      const actions: RouteEditorAction[] = [];
      let expectedRouteAddress = prev.expectedRouteAddress;
      // `local` updates only `draftPath`, such as `/logo?dar` while
      // `expectedRouteAddress` remains `/logo`. `readyNormalized` can keep the
      // typed `draftPath` while replacing the route with `readiness.routeAddress`.
      if (readiness.kind !== "local") {
        expectedRouteAddress = readiness.routeAddress;
        actions.push({
          brand: "replaceRoute",
          routeAddress: readiness.routeAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          ...prev,
          draftPath,
          expectedRouteAddress,
          hoverPath: null,
          selection: event.nextSelection,
        },
      };
    },

    changedSelection: (prev, event) => {
      // Example: draftPath is `/terms?top=red-`, hoverPath visibly shows
      // `/privacy?top=red-`, and onSelect reports a cursor inside `/privacy`.
      // Suggestions still use `draftPath`, so `selection` from `hoverPath` is
      // ignored.
      if (prev.hoverPath) {
        return keepState(prev);
      }

      return keepState({
        ...prev,
        selection: event.selection,
      });
    },

    // Input focus/click sets `hoverPath` to `null` before storing `selection`,
    // so the input value changes from `hoverPath.draftPath` back to `draftPath`.
    clickedInput: (prev, event) =>
      keepState({
        ...prev,
        hoverPath: null,
        selection: event.selection,
      }),

    clickedOutside: (prev, event) => {
      // Root blur leaves `"focused"`. If `hoverPath.expectedRouteAddress`
      // replaced the route, restore `prev.expectedRouteAddress` before the
      // blurred editor reads `committedRouteAddress`.
      const actions: RouteEditorAction[] = [];
      if (prev.hoverPath && prev.hoverPath.expectedRouteAddress !== prev.expectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    clearedHoverPath: (prev, event) => {
      // Listbox mouseleave can fire while `hoverPath` is already `null`;
      // `draftPath` is already visible and the route already matches
      // `expectedRouteAddress`.
      if (!prev.hoverPath) {
        return keepState(prev);
      }

      const actions: RouteEditorAction[] = [];
      // If `hoverPath.expectedRouteAddress` replaced the route, restore
      // `expectedRouteAddress` before setting `hoverPath` to `null`.
      if (prev.hoverPath.expectedRouteAddress !== prev.expectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          ...prev,
          hoverPath: null,
        },
      };
    },

    // Escape changes `kind` from `"focused"` to `"blurred"`. If `hoverPath`
    // replaced the route, restore `expectedRouteAddress`; otherwise the route
    // is already what the focused state expected.
    pressedEscape: (prev, event) => {
      const actions: RouteEditorAction[] = [{ brand: "blurInput" }];
      if (prev.hoverPath && prev.hoverPath.expectedRouteAddress !== prev.expectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    hoveredSuggestion: (prev, event) => {
      // A previous `hoveredSuggestion` may have changed `committedRouteAddress`.
      // Classify this suggestion from `expectedRouteAddress`, which is the
      // route for `draftPath`.
      const readiness = event.context.readRouteAddressReadiness({
        currentRouteAddress: prev.expectedRouteAddress,
        draftRouteAddress: event.routeAddress,
      });
      const expectedRouteAddress =
        readiness.kind === "local" ? prev.expectedRouteAddress : readiness.routeAddress;
      // Avoid replaceRoute when the route already equals `expectedRouteAddress`
      // or `hoverPath.expectedRouteAddress`.
      const activeExpectedRouteAddress =
        prev.hoverPath?.expectedRouteAddress ?? prev.expectedRouteAddress;
      const actions: RouteEditorAction[] = [];
      if (expectedRouteAddress !== activeExpectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          ...prev,
          hoverPath: {
            draftPath: event.routeAddress,
            expectedRouteAddress,
          },
        },
      };
    },

    // Runs before native Delete, printable replacement, Cut, Paste, and Ctrl/Meta+Backspace.
    // Move the affected range onto editable route text only; the browser still mutates the input,
    // fires onChange, handles clipboard contents, and owns the undo/redo entry.
    requestedEditableSelection: (prev, event) => {
      const lockedPrefixEnd = prev.prefix.length;
      const selection = {
        direction: "none" as const,
        end: Math.max(event.selection.end, lockedPrefixEnd),
        start: lockedPrefixEnd,
      };

      return {
        actions: [{ brand: "setInputSelection", selection }],
        state: {
          ...prev,
          selection,
        },
      };
    },

    // Plain Backspace needs a separate path: a collapsed caret at prefix.length has no editable
    // selection, so native Backspace would remove the locked prefix character to the left.
    // If clamping leaves selected route text, keep default Backspace native; prevent only the empty
    // boundary no-op.
    requestedLockedPrefixBackspace: (prev, event) => {
      const lockedPrefixEnd = prev.prefix.length;
      const selection = {
        direction: "none" as const,
        end: Math.max(event.selection.end, lockedPrefixEnd),
        start: lockedPrefixEnd,
      };
      const actions: RouteEditorAction[] = [{ brand: "setInputSelection", selection }];
      if (selection.start === selection.end) {
        actions.push({
          brand: "preventNativeEdit",
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          ...prev,
          selection,
        },
      };
    },

    selectedSuggestion: (prev, event) => {
      // Suggestion mousedown prevents native click handling to keep focus, so
      // `nextSelectionRouteIndex` is the reliable source for `selection`.
      const selection = readInputSelectionFromRouteIndex(
        prev.prefix,
        event.nextSelectionRouteIndex,
      );
      const actions: RouteEditorAction[] = [{ brand: "setInputSelection", selection }];
      let expectedRouteAddress = prev.expectedRouteAddress;
      // If `hoverPath.draftPath` is the clicked `routeAddress`, reuse
      // `hoverPath.expectedRouteAddress`; `hoveredSuggestion` already ran the
      // readiness check.
      if (prev.hoverPath?.draftPath === event.routeAddress) {
        expectedRouteAddress = prev.hoverPath.expectedRouteAddress;
      } else {
        // Without a matching `hoverPath`, classify `event.routeAddress` now and
        // replace the route only when it is not `local`.
        const readiness = event.context.readRouteAddressReadiness({
          currentRouteAddress: prev.expectedRouteAddress,
          draftRouteAddress: event.routeAddress,
        });
        if (readiness.kind !== "local") {
          expectedRouteAddress = readiness.routeAddress;
          actions.push({
            brand: "replaceRoute",
            routeAddress: readiness.routeAddress,
            context: event.context,
          });
        }
      }

      return {
        actions,
        state: {
          ...prev,
          draftPath: event.routeAddress,
          expectedRouteAddress,
          hoverPath: null,
          selection,
        },
      };
    },
  },
};

function readRouteAddressSelection(input: HTMLInputElement): RouteAddressSelection {
  const fallbackPosition = input.value.length;

  return {
    direction: includes(["forward", "backward", "none"], input.selectionDirection)
      ? input.selectionDirection
      : "none",
    end: input.selectionEnd ?? input.selectionStart ?? fallbackPosition,
    start: input.selectionStart ?? fallbackPosition,
  };
}

function readRouteAddressFromRouteHref(routeHref: string): string {
  const url = new URL(routeHref, new URL(readIsomorphicOrigin()));
  return `${url.pathname}${url.search}`;
}

/**
TanStack retained root search keeps keys such as `dev` unless navigation sends
an own `undefined` value for the removed key.

Example: current `/terms?dev`, next `/logo` must send `{ dev: undefined }`
so the visible browser route becomes `/logo`, not `/logo?dev`.
*/
function readRouteEditorExactSearch(args: {
  currentRouteAddress: string;
  nextRouteAddress: string;
  origin: string;
}): Record<string, unknown> {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentRouteAddress, appOrigin);
  const nextUrl = new URL(args.nextRouteAddress, appOrigin);
  const nextSearch: Record<string, unknown> = {
    ...(nextUrl.pathname === "/"
      ? validateRootRouteSearch(parseTanStackSearch(nextUrl.search))
      : parseTanStackSearch(nextUrl.search)),
  };

  for (const key of RETAINED_ROOT_SEARCH_KEYS) {
    if (currentUrl.searchParams.has(key) && !nextUrl.searchParams.has(key)) {
      nextSearch[key] = undefined;
    }
  }

  return nextSearch;
}

export function useRouteEditorVm({ onDebugStateChange }: RouteEditorVmProps) {
  const router = useRouter();
  const location = useLocation();
  const viewerIsAdmin = useQuery(api.users.isCurrentUserAdmin);
  const viewerCanSeeAdminRoutes = viewerIsAdmin === true;
  const origin = useMemo(readIsomorphicOrigin, []);
  const prefix = useMemo(() => `${origin}/`, [origin]);
  const committedRouteAddress = useMemo(
    () => readRouteAddressFromRouteHref(location.href),
    [location.href],
  );
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const runRouteEditorTransitionActions = useCallback((actions: RouteEditorAction[]) => {
    const actionHandlers: RouteEditorActionHandlerTable = {
      blurInput: () => {
        inputRef.current?.blur();
      },
      preventNativeEdit: (action) => {
        action.context.preventDefault();
      },
      replaceRoute: (action) => {
        action.context.replaceRoute(action.routeAddress);
      },
      setInputSelection: (action) => {
        inputRef.current?.setSelectionRange(
          action.selection.start,
          action.selection.end,
          action.selection.direction,
        );
      },
    };

    runTransitionActions(actionHandlers, actions);
  }, []);

  const { state, sendEvent } = useTypedTransitionMachine<
    RouteEditorState["kind"],
    RouteEditorEvent["type"],
    RouteEditorAction["brand"],
    RouteEditorState,
    RouteEditorEvent,
    RouteEditorAction
  >({
    initialState: {
      kind: "blurred",
      prefix,
    },
    transitionTable: routeEditorTransition,
    runActions: runRouteEditorTransitionActions,
    onDebugStateChange,
  });

  useEffect(() => {
    sendEvent({
      type: "changedCommittedRoute",
      path: committedRouteAddress,
    });
  }, [committedRouteAddress, sendEvent]);

  const replaceRoute = useCallback(
    (routeAddress: string) => {
      const currentUrl = new URL(committedRouteAddress, origin);
      const nextUrl = new URL(routeAddress, origin);

      void router.navigate({
        hash: nextUrl.hash.replace(/^#/, ""),
        replace: true,
        search: () =>
          readRouteEditorExactSearch({
            currentRouteAddress: committedRouteAddress,
            nextRouteAddress: routeAddress,
            origin,
          }),
        ...(currentUrl.pathname === nextUrl.pathname ? { resetScroll: false } : {}),
        to: nextUrl.pathname,
      });
    },
    [committedRouteAddress, origin, router],
  );

  const readRouteAddressReadinessForRoute = useCallback(
    (args: { currentRouteAddress: string; draftRouteAddress: string }) =>
      readRouteAddressReadiness({
        currentRouteAddress: args.currentRouteAddress,
        draftRouteAddress: args.draftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewerIsAdmin: viewerCanSeeAdminRoutes,
      }),
    [origin, router.routesByPath, viewerCanSeeAdminRoutes],
  );

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      sendEvent({
        type: "clickedInput",
        committedRouteAddress,
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [committedRouteAddress, sendEvent],
  );

  const handleInputClick = useCallback(
    (event: MouseEvent<HTMLInputElement>) => {
      if (state.kind === "focused") {
        return;
      }

      sendEvent({
        type: "clickedInput",
        committedRouteAddress,
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [committedRouteAddress, sendEvent, state.kind],
  );

  const handleRootBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
        return;
      }

      // clickedOutside is root blur, not a pointer event; suggestion clicks keep focus inside the
      // editor by preventing native mousedown blur.
      sendEvent({
        type: "clickedOutside",
        context: {
          replaceRoute,
        },
      });
    },
    [replaceRoute, sendEvent],
  );

  const clampSelectionToRouteText = useCallback(
    (input: HTMLInputElement) => {
      const selection = readRouteAddressSelection(input);
      if (selection.start >= prefix.length || selection.end <= prefix.length) {
        return;
      }

      sendEvent({
        type: "requestedEditableSelection",
        selection,
      });
    },
    [prefix.length, sendEvent],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Backspace") {
        sendEvent({
          type: "requestedEditableSelection",
          selection: readRouteAddressSelection(event.currentTarget),
        });
        return;
      }

      if (event.key === "Backspace") {
        const selection = readRouteAddressSelection(event.currentTarget);
        const lockedPrefixEnd = prefix.length;
        const backspaceWouldDeleteLockedPrefix =
          selection.start < lockedPrefixEnd ||
          (selection.start === lockedPrefixEnd && selection.end === lockedPrefixEnd);

        // Normal editable Backspace stays native so key-repeat undo grouping remains browser-owned.
        if (!backspaceWouldDeleteLockedPrefix) {
          return;
        }

        sendEvent({
          type: "requestedLockedPrefixBackspace",
          selection,
          context: {
            preventDefault: () => {
              event.preventDefault();
            },
          },
        });
        return;
      }

      if (event.key === "Delete") {
        clampSelectionToRouteText(event.currentTarget);
        return;
      }

      // Printable keys replace the current selection natively; if that selection starts inside
      // the locked URL prefix, clamp it first so only route text is replaced.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        clampSelectionToRouteText(event.currentTarget);
        return;
      }

      // `hoverPath` does not move focus to the suggestion row, so Escape still
      // arrives from the input.
      if (event.key === "Escape") {
        sendEvent({
          type: "pressedEscape",
          context: {
            replaceRoute,
          },
        });
      }
    },
    [clampSelectionToRouteText, prefix, replaceRoute, sendEvent],
  );

  const handleInputCut = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      clampSelectionToRouteText(event.currentTarget);
    },
    [clampSelectionToRouteText],
  );

  const handleInputPaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      clampSelectionToRouteText(event.currentTarget);
    },
    [clampSelectionToRouteText],
  );

  const handleInputSelect = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      sendEvent({
        type: "changedSelection",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [sendEvent],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextSelection = readRouteAddressSelection(event.currentTarget);

      sendEvent({
        type: "changedInput",
        nextInputValue: event.currentTarget.value,
        nextSelection,
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
      });
    },
    [readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>, suggestion: Suggestion) => {
      event.preventDefault();
      sendEvent({
        type: "selectedSuggestion",
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
        nextSelectionRouteIndex: suggestion.nextSelectionRouteIndex,
        routeAddress: suggestion.routeAddress,
      });
    },
    [readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const handleSuggestionMouseMove = useCallback(
    (suggestion: Suggestion) => {
      sendEvent({
        type: "hoveredSuggestion",
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
        routeAddress: suggestion.routeAddress,
      });
    },
    [readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const handleSuggestionsMouseLeave = useCallback(() => {
    sendEvent({
      type: "clearedHoverPath",
      context: {
        replaceRoute,
      },
    });
  }, [replaceRoute, sendEvent]);

  const getSuggestionProps = useCallback(
    (suggestion: Suggestion) => ({
      onMouseDown: (event: MouseEvent<HTMLElement>) => handleSuggestionMouseDown(event, suggestion),
      onMouseMove: () => handleSuggestionMouseMove(suggestion),
    }),
    [handleSuggestionMouseDown, handleSuggestionMouseMove],
  );

  const routeAddress =
    state.kind === "blurred"
      ? committedRouteAddress
      : (state.hoverPath?.draftPath ?? state.draftPath);
  const suggestionsRouteAddress =
    state.kind === "blurred" ? committedRouteAddress : state.draftPath;
  const inputValue = `${state.prefix}${routeAddress.slice(1)}`;
  const suggestionSelection = state.kind === "focused" ? state.selection : null;
  const suggestions = useMemo(
    () =>
      readSuggestions({
        prefix: state.prefix,
        routeAddress: suggestionsRouteAddress,
        routesByPath: router.routesByPath,
        selection: suggestionSelection,
        viewerIsAdmin: viewerCanSeeAdminRoutes,
      }),
    [
      router.routesByPath,
      state.prefix,
      suggestionSelection,
      suggestionsRouteAddress,
      viewerCanSeeAdminRoutes,
    ],
  );
  const suggestionsVisible = state.kind === "focused";
  const inputProps = useMemo(
    () => ({
      "aria-controls": suggestionsVisible ? listboxId : undefined,
      "aria-expanded": suggestionsVisible,
      "aria-haspopup": "listbox" as const,
      autoComplete: "off",
      id: inputId,
      onChange: handleInputChange,
      onClick: handleInputClick,
      onCut: handleInputCut,
      onFocus: handleInputFocus,
      onKeyDown: handleInputKeyDown,
      onPaste: handleInputPaste,
      onSelect: handleInputSelect,
      ref: inputRef,
      value: inputValue,
    }),
    [
      handleInputChange,
      handleInputClick,
      handleInputCut,
      handleInputFocus,
      handleInputKeyDown,
      handleInputPaste,
      handleInputSelect,
      inputId,
      inputValue,
      listboxId,
      suggestionsVisible,
    ],
  );
  const listboxProps = useMemo(
    () => ({
      id: listboxId,
      onMouseLeave: handleSuggestionsMouseLeave,
    }),
    [handleSuggestionsMouseLeave, listboxId],
  );
  const rootProps = useMemo(
    () => ({
      "data-state": state.kind,
      onBlur: handleRootBlur,
    }),
    [handleRootBlur, state.kind],
  );

  return useMemo(
    () => ({
      getSuggestionProps,
      inputProps,
      listboxProps,
      rootProps,
      state,
      suggestions,
      suggestionsVisible,
    }),
    [
      getSuggestionProps,
      inputProps,
      listboxProps,
      rootProps,
      state,
      suggestions,
      suggestionsVisible,
    ],
  );
}
