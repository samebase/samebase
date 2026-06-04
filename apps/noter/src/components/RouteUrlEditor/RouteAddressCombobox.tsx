import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { RouteAddressComboboxProps, useRouteEditorVm } from "./useRouteEditorVm";

export function RouteAddressCombobox(props: RouteAddressComboboxProps) {
  const vm = useRouteEditorVm(props);

  return (
    <div {...vm.rootProps} className="relative w-full" data-testid="route-address-combobox">
      <label className="sr-only" htmlFor={vm.inputProps.id}>
        Route address
      </label>
      <Input
        {...vm.inputProps}
        className="h-7 border-0 bg-transparent px-1 font-mono shadow-none focus-visible:ring-0"
        data-testid="route-address-combobox-input"
      />
      {vm.suggestionsVisible ? (
        <Command
          className="absolute inset-x-0 top-full z-50 mt-1 h-auto rounded-md! border border-border bg-background shadow-xs"
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
