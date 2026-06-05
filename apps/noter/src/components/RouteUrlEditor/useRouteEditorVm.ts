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
  TypedTransitionResult,
  TypedTransitionTable,
} from "./typedTransitionTable";

type RouteAddressSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

export type RouteEditorState =
  | {
      kind: "blurred";
      path: string;
      prefix: string;
    }
  | {
      kind: "focused";
      draftPath: string;
      expectedRouteAddress: string;
      prefix: string;
      selection: RouteAddressSelection;
    };

export type RouteEditorVmProps = {
  onDebugStateChange?: (state: RouteEditorState) => void;
};

type RouteEditorPreventNativeEditContext = {
  preventDefault: () => void;
};

type RouteEditorReplaceRouteContext = {
  readRouteAddressReadiness: (draftRouteAddress: string) => RouteAddressReadiness;
  replaceRoute: (routeAddress: string) => void;
};

type RouteEditorEvent =
  // Input value and selection tracking.
  | {
      type: "changedInput";
      nextInputValue: string;
      nextSelection: RouteAddressSelection;
      context: RouteEditorReplaceRouteContext;
    }
  | {
      type: "changedSelection";
      selection: RouteAddressSelection;
    }
  // Focus and dropdown lifecycle.
  | {
      type: "clickedOutside";
    }
  | {
      type: "clickedInput";
      selection: RouteAddressSelection;
    }
  | {
      type: "pressedEscape";
    }
  // Locked-prefix editing.
  | {
      type: "requestedLockedPrefixBackspace";
      selection: RouteAddressSelection;
      context: RouteEditorPreventNativeEditContext;
    }
  | {
      type: "requestedEditableSelection";
      selection: RouteAddressSelection;
    }
  // Suggestion commit.
  | {
      type: "selectedSuggestion";
      context: RouteEditorReplaceRouteContext;
      nextSelectionRouteIndex: number;
      routeAddress: string;
    }
  // External committed route sync.
  | {
      type: "changedCommittedRoute";
      path: string;
    };

type RouteEditorAction =
  // DOM focus/edit prevention.
  | {
      brand: "blurInput";
    }
  | {
      brand: "preventNativeEdit";
      context: RouteEditorPreventNativeEditContext;
    }
  // DOM selection repair.
  | {
      brand: "setInputSelection";
      selection: RouteAddressSelection;
    }
  // Router preview.
  | {
      brand: "replaceRoute";
      routeAddress: string;
      context: RouteEditorReplaceRouteContext;
    };

type RouteEditorActionHandlerTable = TypedTransitionActionHandlerTable<
  RouteEditorAction["brand"],
  RouteEditorAction
>;

type RouteEditorTransitionResult = TypedTransitionResult<RouteEditorState, RouteEditorAction>;

type RouteEditorTransitionTable = TypedTransitionTable<
  RouteEditorState["kind"],
  RouteEditorEvent["type"],
  RouteEditorState,
  RouteEditorEvent,
  RouteEditorTransitionResult
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
    changedCommittedRoute: (prev, event) =>
      keepState({
        ...prev,
        path: event.path,
      }),
    changedInput: keepState,
    changedSelection: keepState,
    clickedInput: (prev, event) =>
      keepState({
        kind: "focused",
        draftPath: readRouteAddressFocusedDraft(prev.path),
        expectedRouteAddress: prev.path,
        prefix: prev.prefix,
        selection: event.selection,
      }),
    clickedOutside: keepState,
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: prev,
    }),
    requestedEditableSelection: keepState,
    requestedLockedPrefixBackspace: keepState,
    selectedSuggestion: keepState,
  },

  focused: {
    changedCommittedRoute: (prev, event) => {
      if (event.path === prev.expectedRouteAddress) {
        return keepState(prev);
      }

      // If something external somehow changed our route
      // just bail, for now.
      return {
        actions: [{ brand: "blurInput" }],
        state: {
          kind: "blurred",
          path: event.path,
          prefix: prev.prefix,
        },
      };
    },
    changedInput: (prev, event) => {
      if (!event.nextInputValue.startsWith(prev.prefix)) {
        return keepState(prev);
      }

      const draftPath = `/${event.nextInputValue.slice(prev.prefix.length)}`;
      const readiness = event.context.readRouteAddressReadiness(draftPath);
      const actions: RouteEditorAction[] = [];
      let expectedRouteAddress = prev.expectedRouteAddress;
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
          selection: event.nextSelection,
        },
      };
    },
    changedSelection: (prev, event) =>
      keepState({
        ...prev,
        selection: event.selection,
      }),
    clickedInput: (prev, event) =>
      keepState({
        ...prev,
        selection: event.selection,
      }),
    clickedOutside: (prev) =>
      keepState({
        kind: "blurred",
        path: prev.expectedRouteAddress,
        prefix: prev.prefix,
      }),
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        path: prev.expectedRouteAddress,
        prefix: prev.prefix,
      },
    }),
    // Interesting implementation: for Delete, Cut, Paste, and printable replacement, we only clamp
    // the selection. The browser still performs the edit natively, so undo/redo stays browser-owned.
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
    // Backspace at the prefix boundary has no editable text selected, so it needs preventDefault.
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
      const selection = readInputSelectionFromRouteIndex(
        prev.prefix,
        event.nextSelectionRouteIndex,
      );
      const readiness = event.context.readRouteAddressReadiness(event.routeAddress);
      const actions: RouteEditorAction[] = [{ brand: "setInputSelection", selection }];
      let expectedRouteAddress = prev.expectedRouteAddress;
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
          draftPath: event.routeAddress,
          expectedRouteAddress,
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
 * TanStack retained root search keeps keys such as `dev` unless navigation sends
 * an own `undefined` value for the removed key.
 *
 * Example: current `/terms?dev`, next `/logo` must send `{ dev: undefined }`
 * so the visible browser route becomes `/logo`, not `/logo?dev`.
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
      path: committedRouteAddress,
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

  const readRouteAddressReadinessForDraft = useCallback(
    (draftRouteAddress: string) =>
      readRouteAddressReadiness({
        currentRouteAddress: committedRouteAddress,
        draftRouteAddress,
        origin,
        routesByPath: router.routesByPath,
        viewerIsAdmin: viewerCanSeeAdminRoutes,
      }),
    [committedRouteAddress, origin, router.routesByPath, viewerCanSeeAdminRoutes],
  );

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      sendEvent({
        type: "clickedInput",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [sendEvent],
  );

  const handleInputClick = useCallback(
    (event: MouseEvent<HTMLInputElement>) => {
      if (state.kind === "focused") {
        return;
      }

      sendEvent({
        type: "clickedInput",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [sendEvent, state.kind],
  );

  const handleRootBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
        return;
      }

      sendEvent({
        type: "clickedOutside",
      });
    },
    [sendEvent],
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

      if (event.key === "Escape") {
        sendEvent({
          type: "pressedEscape",
        });
      }
    },
    [clampSelectionToRouteText, prefix, sendEvent],
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
          readRouteAddressReadiness: readRouteAddressReadinessForDraft,
          replaceRoute,
        },
      });
    },
    [readRouteAddressReadinessForDraft, replaceRoute, sendEvent],
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>, suggestion: Suggestion) => {
      event.preventDefault();
      sendEvent({
        type: "selectedSuggestion",
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForDraft,
          replaceRoute,
        },
        nextSelectionRouteIndex: suggestion.nextSelectionRouteIndex,
        routeAddress: suggestion.routeAddress,
      });
    },
    [readRouteAddressReadinessForDraft, replaceRoute, sendEvent],
  );

  const getSuggestionProps = useCallback(
    (suggestion: Suggestion) => ({
      onMouseDown: (event: MouseEvent<HTMLElement>) => handleSuggestionMouseDown(event, suggestion),
    }),
    [handleSuggestionMouseDown],
  );

  const routeAddress = state.kind === "blurred" ? state.path : state.draftPath;
  const inputValue = `${state.prefix}${routeAddress.slice(1)}`;
  const suggestionSelection = state.kind === "focused" ? state.selection : null;
  const suggestions = useMemo(
    () =>
      readSuggestions({
        prefix: state.prefix,
        routeAddress,
        routesByPath: router.routesByPath,
        selection: suggestionSelection,
        viewerIsAdmin: viewerCanSeeAdminRoutes,
      }),
    [routeAddress, router.routesByPath, state.prefix, suggestionSelection, viewerCanSeeAdminRoutes],
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
    }),
    [listboxId],
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
