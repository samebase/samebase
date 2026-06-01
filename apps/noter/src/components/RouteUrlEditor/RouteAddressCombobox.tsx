import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import { useCallback, useId, useRef, useState } from "react";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { useLocation } from "@tanstack/react-router";
import { includes } from "@noter-md/dependent";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";
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
      origin: string;
      path: string;
    }
  | {
      kind: "focused";
      initialPath: string;
      latestPath: string;
      origin: string;
      selection: RouteAddressSelection;
    };

export type RouteAddressComboboxState = RouteEditorState;

type RouteAddressComboboxProps = {
  onDebugEvent?: (event: RouteEditorEvent) => void;
  onDebugStateChange?: (state: RouteEditorState) => void;
};

const routeAddressComboboxSuggestions = [
  {
    routeAddress: "/research/route-url-editor-state-machine",
  },
  {
    routeAddress: "/logo",
  },
  {
    routeAddress: "/machines",
  },
] as const;

export type RouteEditorEvent =
  | {
      path: string;
      selection: RouteAddressSelection;
      type: "changedInput";
    }
  | {
      selection: RouteAddressSelection;
      type: "changedSelection";
    }
  | {
      type: "clickedOutside";
    }
  | {
      selection: RouteAddressSelection;
      type: "clickedInput";
    }
  | {
      type: "pressedEscape";
    }
  | {
      path: string;
      type: "selectedSuggestion";
    };

type RouteEditorAction = {
  brand: "blurInput";
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

const routeAddressComboboxTransition: RouteEditorTransitionTable = {
  blurred: {
    changedInput: (prev, event) =>
      keepState({
        ...prev,
        path: event.path,
      }),
    changedSelection: keepState,
    clickedInput: (prev, event) =>
      keepState({
        kind: "focused",
        initialPath: prev.path,
        latestPath: readRouteAddressFocusedDraft(prev.path),
        origin: prev.origin,
        selection: event.selection,
      }),
    clickedOutside: keepState,
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: prev,
    }),
    selectedSuggestion: (prev, event) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        origin: prev.origin,
        path: event.path,
      },
    }),
  },

  focused: {
    changedInput: (prev, event) =>
      keepState({
        ...prev,
        latestPath: event.path,
        selection: event.selection,
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
      const url = new URL(prev.latestPath, prev.origin);
      const search = stringifyTanStackSearch(parseTanStackSearch(url.search));

      return keepState({
        kind: "blurred",
        origin: prev.origin,
        path: `${url.pathname}${search}`,
      });
    },
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        origin: prev.origin,
        path: prev.initialPath,
      },
    }),
    selectedSuggestion: (prev, event) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        origin: prev.origin,
        path: event.path,
      },
    }),
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

function useRouteAddressComboboxVm({
  onDebugEvent,
  onDebugStateChange,
}: RouteAddressComboboxProps) {
  const location = useLocation();
  const [origin] = useState(readIsomorphicOrigin);
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const runRouteEditorTransitionActions = useCallback(
    (actions: RouteEditorAction[]) => {
      const actionHandlers: RouteEditorActionHandlerTable = {
        blurInput: () => {
          inputRef.current?.blur();
        },
      };

      runTransitionActions(actionHandlers, actions);
    },
    [inputRef],
  );

  const { state, sendEvent } = useTypedTransitionMachine({
    initialState: {
      kind: "blurred",
      origin,
      path: `${location.pathname}${location.searchStr}`,
    },
    transitionTable: routeAddressComboboxTransition,
    runActions: runRouteEditorTransitionActions,
    onDebugEvent,
    onDebugStateChange,
  });

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      sendEvent({
        selection: readRouteAddressSelection(event.currentTarget),
        type: "clickedInput",
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

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") {
        return;
      }

      sendEvent({
        type: "pressedEscape",
      });
    },
    [sendEvent],
  );

  const handleInputSelect = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      sendEvent({
        selection: readRouteAddressSelection(event.currentTarget),
        type: "changedSelection",
      });
    },
    [sendEvent],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      sendEvent({
        path: readRouteAddressFromInputValue(event.currentTarget.value),
        selection: readRouteAddressSelection(event.currentTarget),
        type: "changedInput",
      });
    },
    [sendEvent],
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>, routeAddress: string) => {
      event.preventDefault();
      sendEvent({
        path: routeAddress,
        type: "selectedSuggestion",
      });
    },
    [sendEvent],
  );

  const routeAddress = state.kind === "blurred" ? state.path : state.latestPath;
  const inputValue = new URL(routeAddress, state.origin).href;
  const suggestions = routeAddressComboboxSuggestions;
  const suggestionsVisible = state.kind === "focused";

  return {
    getSuggestionProps: (routeAddress: string) => ({
      onMouseDown: (event: MouseEvent<HTMLDivElement>) =>
        handleSuggestionMouseDown(event, routeAddress),
    }),
    inputProps: {
      "aria-controls": suggestionsVisible ? listboxId : undefined,
      "aria-expanded": suggestionsVisible,
      "aria-haspopup": "listbox" as const,
      autoComplete: "off",
      id: inputId,
      onChange: handleInputChange,
      onFocus: handleInputFocus,
      onKeyDown: handleInputKeyDown,
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
                  key={suggestion.routeAddress}
                  {...vm.getSuggestionProps(suggestion.routeAddress)}
                  value={suggestion.routeAddress}
                >
                  <span className="min-w-0 truncate font-mono">{suggestion.routeAddress}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : null}
    </div>
  );
}
