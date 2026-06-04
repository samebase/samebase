import type {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  SyntheticEvent,
} from "react";
import { useCallback, useId, useMemo, useRef } from "react";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { includes } from "@noter-md/dependent";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";
import { api } from "../../../convex/_generated/api";
import { readSuggestions, type Suggestion } from "./RouteAddressComboboxSuggestions";
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
      initialPath: string;
      latestPath: string;
      prefix: string;
      selection: RouteAddressSelection;
    };

export type RouteAddressComboboxState = RouteEditorState;

type RouteAddressComboboxProps = {
  onDebugStateChange?: (state: RouteEditorState) => void;
};

type RouteEditorPreventNativeEditContext = {
  preventDefault: () => void;
};

type RouteEditorEvent =
  // Input value and selection tracking.
  | {
      type: "changedInput";
      nextInputValue: string;
      nextSelection: RouteAddressSelection;
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
      nextSelectionRouteIndex: number;
      routeAddress: string;
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

function readRouteAddressFromInputValue(inputValue: string): string {
  const url = new URL(inputValue);
  const routeAddress = `${url.pathname}${url.search}`;
  if (inputValue.endsWith("?") && url.search.length === 0) {
    return `${url.pathname}?`;
  }

  return routeAddress;
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

const routeAddressComboboxTransition: RouteEditorTransitionTable = {
  blurred: {
    changedInput: keepState,
    changedSelection: keepState,
    clickedInput: (prev, event) =>
      keepState({
        kind: "focused",
        initialPath: prev.path,
        latestPath: readRouteAddressFocusedDraft(prev.path),
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
    selectedSuggestion: (prev, event) => ({
      state: {
        kind: "blurred",
        path: event.routeAddress,
        prefix: prev.prefix,
      },
      actions: [],
    }),
  },

  focused: {
    changedInput: (prev, event) =>
      keepState({
        ...prev,
        latestPath: readRouteAddressFromInputValue(event.nextInputValue),
        selection: event.nextSelection,
      }),
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
    clickedOutside: (prev) => {
      const url = new URL(prev.latestPath, prev.prefix);
      const search = stringifyTanStackSearch(parseTanStackSearch(url.search));

      return keepState({
        kind: "blurred",
        path: `${url.pathname}${search}`,
        prefix: prev.prefix,
      });
    },
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        path: prev.initialPath,
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

      return {
        actions: [{ brand: "setInputSelection", selection }],
        state: {
          ...prev,
          latestPath: event.routeAddress,
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

function useRouteAddressComboboxVm({ onDebugStateChange }: RouteAddressComboboxProps) {
  const location = useLocation();
  const router = useRouter();
  const viewerIsAdmin = useQuery(api.users.isCurrentUserAdmin);
  const origin = useMemo(readIsomorphicOrigin, []);
  const prefix = useMemo(() => `${origin}/`, [origin]);
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const runRouteEditorTransitionActions = useCallback(
    (actions: RouteEditorAction[]) => {
      const actionHandlers: RouteEditorActionHandlerTable = {
        blurInput: () => {
          inputRef.current?.blur();
        },
        preventNativeEdit: (action) => {
          action.context.preventDefault();
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
    },
    [inputRef],
  );

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
      path: `${location.pathname}${location.searchStr}`,
      prefix,
    },
    transitionTable: routeAddressComboboxTransition,
    runActions: runRouteEditorTransitionActions,
    onDebugStateChange,
  });

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      sendEvent({
        type: "clickedInput",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [sendEvent],
  );

  const handleRootBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
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
      });
    },
    [sendEvent],
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>, suggestion: Suggestion) => {
      event.preventDefault();
      sendEvent({
        type: "selectedSuggestion",
        nextSelectionRouteIndex: suggestion.nextSelectionRouteIndex,
        routeAddress: suggestion.routeAddress,
      });
    },
    [sendEvent],
  );

  const routeAddress = state.kind === "blurred" ? state.path : state.latestPath;
  const inputValue = `${state.prefix}${routeAddress.slice(1)}`;
  const suggestions = readSuggestions({
    prefix: state.prefix,
    routeAddress,
    routesByPath: router.routesByPath,
    selection: state.kind === "focused" ? state.selection : null,
    viewerIsAdmin: !!viewerIsAdmin,
  });
  const suggestionsVisible = state.kind === "focused";

  return {
    getSuggestionProps: (suggestion: Suggestion) => ({
      onMouseDown: (event: MouseEvent<HTMLDivElement>) =>
        handleSuggestionMouseDown(event, suggestion),
    }),
    inputProps: {
      "aria-controls": suggestionsVisible ? listboxId : undefined,
      "aria-expanded": suggestionsVisible,
      "aria-haspopup": "listbox" as const,
      autoComplete: "off",
      id: inputId,
      onChange: handleInputChange,
      onCut: handleInputCut,
      onFocus: handleInputFocus,
      onKeyDown: handleInputKeyDown,
      onPaste: handleInputPaste,
      onSelect: handleInputSelect,
      ref: inputRef,
      value: inputValue,
    },
    listboxProps: {
      id: listboxId,
    },
    rootProps: {
      "data-state": state.kind,
      onBlur: handleRootBlur,
    },
    state,
    suggestions,
    suggestionsVisible,
  };
}

export function RouteAddressCombobox(props: RouteAddressComboboxProps) {
  const vm = useRouteAddressComboboxVm(props);

  return (
    <div {...vm.rootProps} className="grid w-full gap-2" data-testid="route-address-combobox">
      <label className="sr-only" htmlFor={vm.inputProps.id}>
        Route address
      </label>
      <Input {...vm.inputProps} data-testid="route-address-combobox-input" />
      {vm.suggestionsVisible ? (
        <Command
          className="h-auto rounded-md! border border-border bg-background shadow-xs"
          data-testid="route-address-combobox-suggestions"
          label="Route address suggestions"
          shouldFilter={false}
        >
          <CommandList {...vm.listboxProps}>
            <CommandGroup heading="Suggestions">
              {vm.suggestions.map((suggestion) => (
                <CommandItem
                  data-testid="route-address-combobox-suggestion"
                  key={`${suggestion.kind}:${suggestion.value}`}
                  {...vm.getSuggestionProps(suggestion)}
                  value={suggestion.value}
                >
                  <span className="min-w-0 truncate font-mono">{suggestion.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : null}
    </div>
  );
}
