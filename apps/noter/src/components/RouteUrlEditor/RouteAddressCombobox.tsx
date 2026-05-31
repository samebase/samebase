import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import { useCallback, useId, useRef } from "react";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { useLocation } from "@tanstack/react-router";
import { includes } from "@noter-md/dependent";
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
    }
  | {
      kind: "focused";
      initialPath: string;
      latestPath: string;
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
        latestPath: prev.path,
        selection: event.selection,
      }),
    clickedOutside: keepState,
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: prev,
    }),
    selectedSuggestion: (_prev, event) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
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
    clickedOutside: (prev) =>
      keepState({
        kind: "blurred",
        path: prev.initialPath,
      }),
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        path: prev.initialPath,
      },
    }),
    selectedSuggestion: (_prev, event) => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
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
      path: location.pathname,
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
        path: event.currentTarget.value,
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

  const inputValue = state.kind === "blurred" ? state.path : state.latestPath;
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
              {routeAddressComboboxSuggestions.map((suggestion) => (
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
