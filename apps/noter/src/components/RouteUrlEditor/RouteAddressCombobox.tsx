import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useId, useMemo } from "react";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useLocation } from "@tanstack/react-router";
import { includes } from "@noter-md/dependent";

// MARK: Start

type Transition<TState extends { kind: string }, TEvent extends { type: string }> = {
  [CurrentState in TState["kind"]]: {
    [CurrentEvent in TEvent["type"]]: (
      prev: Extract<TState, { kind: CurrentState }>,
      event: Extract<TEvent, { type: CurrentEvent }>,
    ) => TState;
  };
};

function identity<T>(x: T): T {
  return x;
}

// MARK: End

const routeAddressComboboxTransition: Transition<RouteEditorState, RouteEditorEvent> = {
  blurred: {
    changedInput: (prev, event) => ({
      ...prev,
      path: event.path,
    }),
    changedSelection: identity,
    clickedInput: (prev, event) => ({
      kind: "focused",
      initialPath: prev.path,
      latestPath: prev.path,
      selection: event.selection,
    }),
    clickedOutside: identity,
    selectedSuggestion: (_prev, event) => ({
      kind: "blurred",
      path: event.path,
    }),
  },

  focused: {
    changedInput: (prev, event) => ({
      ...prev,
      latestPath: event.path,
      selection: event.selection,
    }),
    changedSelection: (prev, event) => ({
      ...prev,
      selection: event.selection,
    }),
    clickedInput: (prev, event) => ({
      ...prev,
      selection: event.selection,
    }),
    clickedOutside: (prev) => ({
      kind: "blurred",
      path: prev.initialPath,
    }),
    selectedSuggestion: (_prev, event) => ({
      kind: "blurred",
      path: event.path,
    }),
  },
};

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
      path: string;
      type: "selectedSuggestion";
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

function logRouteAddressInputHandler(name: string, input: HTMLInputElement) {
  console.log(name, {
    selection: readRouteAddressSelection(input),
    value: input.value,
  });
}

function useRouterUrlVm({
  location,
  onDebugEvent,
  onDebugStateChange,
}: {
  location: ReturnType<typeof useLocation>;
  onDebugEvent?: (event: RouteEditorEvent) => void;
  onDebugStateChange?: (state: RouteEditorState) => void;
}) {
  const store = useCreateStore<RouteEditorState>({
    kind: "blurred",
    path: location.pathname,
  });

  const state = useSelector(store);

  useEffect(() => {
    onDebugStateChange?.(state);
  }, [state, onDebugStateChange]);

  // TODO: will be moved to generic utility later
  const sendEvent = useCallback(
    (event: RouteEditorEvent) => {
      onDebugEvent?.(event);

      store.setState((prev) => {
        const callback = routeAddressComboboxTransition[prev.kind][event.type];

        // @ts-expect-error Cannot prove yet
        const nextState = callback(prev, event);

        console.log({
          prev,
          event,
          nextState,
        });

        onDebugStateChange?.(nextState);

        return nextState;
      });
    },
    [onDebugEvent, onDebugStateChange, store],
  );

  return useMemo(
    () => ({
      store,
      sendEvent,
    }),
    [store, sendEvent],
  );
}

export function RouteAddressCombobox({
  onDebugEvent,
  onDebugStateChange,
}: RouteAddressComboboxProps) {
  const location = useLocation();

  const inputId = useId();
  const listboxId = useId();
  const { store, sendEvent } = useRouterUrlVm({
    location,
    onDebugEvent,
    onDebugStateChange,
  });

  const state = useSelector(store);

  // MARK: Start Handlers
  function handleInputFocus(event: FocusEvent<HTMLInputElement>) {
    logRouteAddressInputHandler("onFocus", event.currentTarget);
    sendEvent({
      selection: readRouteAddressSelection(event.currentTarget),
      type: "clickedInput",
    });
  }

  function hideDropdown() {
    sendEvent({
      type: "clickedOutside",
    });
  }

  function handleRootBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    hideDropdown();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    logRouteAddressInputHandler("onKeyDown", event.currentTarget);
    if (event.key !== "Escape") {
      return;
    }

    hideDropdown();
    event.currentTarget.blur();
  }

  function handleInputKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    logRouteAddressInputHandler("onKeyUp", event.currentTarget);
    sendEvent({
      selection: readRouteAddressSelection(event.currentTarget),
      type: "changedSelection",
    });
  }

  function handleInputSelect(event: SyntheticEvent<HTMLInputElement>) {
    logRouteAddressInputHandler("onSelect", event.currentTarget);
    sendEvent({
      selection: readRouteAddressSelection(event.currentTarget),
      type: "changedSelection",
    });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    logRouteAddressInputHandler("onChange", event.currentTarget);
    sendEvent({
      path: event.currentTarget.value,
      selection: readRouteAddressSelection(event.currentTarget),
      type: "changedInput",
    });
  }

  function handleSuggestionMouseDown(event: MouseEvent<HTMLDivElement>, routeAddress: string) {
    event.preventDefault();
    sendEvent({
      path: routeAddress,
      type: "selectedSuggestion",
    });

    const activeElement = event.currentTarget.ownerDocument.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }

  // MARK: End Handlers

  const inputValue = state.kind === "blurred" ? state.path : state.latestPath;
  const suggestionsVisible = state.kind === "focused";

  return (
    <div
      className="grid w-full gap-2"
      data-state={state.kind}
      data-testid="route-address-combobox"
      onBlur={handleRootBlur}
    >
      <label className="sr-only" htmlFor={inputId}>
        Route address
      </label>
      <Input
        aria-controls={suggestionsVisible ? listboxId : undefined}
        aria-expanded={suggestionsVisible}
        aria-haspopup="listbox"
        autoComplete="off"
        data-testid="route-address-combobox-input"
        id={inputId}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        onKeyUp={handleInputKeyUp}
        onSelect={handleInputSelect}
        value={inputValue}
      />
      {suggestionsVisible ? (
        <Command
          className="h-auto rounded-md! border border-border bg-background shadow-xs"
          data-testid="route-address-combobox-suggestions"
          label="Route address suggestions"
          shouldFilter={false}
        >
          <CommandList id={listboxId}>
            <CommandGroup heading="Suggestions">
              {routeAddressComboboxSuggestions.map((suggestion) => (
                <CommandItem
                  data-testid="route-address-combobox-suggestion"
                  key={suggestion.routeAddress}
                  onMouseDown={(event) => handleSuggestionMouseDown(event, suggestion.routeAddress)}
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
