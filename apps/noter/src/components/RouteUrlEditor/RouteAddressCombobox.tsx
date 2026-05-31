import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useId, useState } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";

export type RouteAddressComboboxState =
  | {
      kind: "blurred";
    }
  | {
      kind: "focused";
    };

type RouteAddressComboboxProps = {
  onDebugStateChange?: (state: RouteAddressComboboxState) => void;
};

const routeAddressComboboxSuggestions = [
  {
    label: "Research",
    routeAddress: "/research/route-url-editor-state-machine",
  },
  {
    label: "Logo",
    routeAddress: "/logo",
  },
  {
    label: "Machines",
    routeAddress: "/machines",
  },
] as const;

export function RouteAddressCombobox({ onDebugStateChange }: RouteAddressComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const [state, setState] = useState<RouteAddressComboboxState>({ kind: "blurred" });
  const suggestionsVisible = state.kind === "focused";

  function transitionTo(nextState: RouteAddressComboboxState) {
    if (state.kind === nextState.kind) {
      return;
    }

    setState(nextState);
    onDebugStateChange?.(nextState);
  }

  function showDropdown() {
    transitionTo({ kind: "focused" });
  }

  function hideDropdown() {
    transitionTo({ kind: "blurred" });
  }

  function handleRootBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    hideDropdown();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") {
      return;
    }

    hideDropdown();
    event.currentTarget.blur();
  }

  function handleSuggestionMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    hideDropdown();

    const activeElement = event.currentTarget.ownerDocument.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }

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
        onFocus={showDropdown}
        onKeyDown={handleInputKeyDown}
        placeholder="Route address"
      />
      {suggestionsVisible ? (
        <Command
          className="h-auto rounded-md! border border-border bg-background p-1 shadow-xs"
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
                  onMouseDown={handleSuggestionMouseDown}
                  value={suggestion.routeAddress}
                >
                  <span className="min-w-0 truncate font-mono">{suggestion.routeAddress}</span>
                  <CommandShortcut className="tracking-normal">{suggestion.label}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : null}
    </div>
  );
}
