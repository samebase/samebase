import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Textarea } from "@/components/ui/textarea";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useCallback } from "react";
import {
  RouteAddressCombobox,
  type RouteEditorEvent,
  type RouteEditorState,
} from "./RouteAddressCombobox";

type RouteAddressComboboxResearchState = {
  combobox: RouteEditorState;
  events: readonly RouteEditorEvent[];
};

function useRouteAddressComboboxResearchStore() {
  return useCreateStore<RouteAddressComboboxResearchState>({
    combobox: { kind: "blurred", path: "" },
    events: [],
  });
}

export function RouteAddressComboboxResearchPage() {
  const store = useRouteAddressComboboxResearchStore();
  const state = useSelector(store);
  const setComboboxState = useCallback(
    (combobox: RouteEditorState) => {
      store.setState((currentState) =>
        currentState.combobox === combobox
          ? currentState
          : {
              ...currentState,
              combobox,
            },
      );
    },
    [store],
  );
  const appendComboboxEvent = useCallback(
    (event: RouteEditorEvent) => {
      store.setState((currentState) => ({
        ...currentState,
        events: [...currentState.events, event],
      }));
    },
    [store],
  );
  const stateJson = JSON.stringify(state, null, 2);

  return (
    <AppWorkspaceRouteChrome
      dataTestId="route-address-combobox-research-page"
      left={null}
      right={null}
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Route address combobox</h1>
          <p className="text-sm text-muted-foreground">TanStack Store, two explicit states.</p>
        </div>

        <div className="grid gap-4">
          <RouteAddressCombobox
            onDebugEvent={appendComboboxEvent}
            onDebugStateChange={setComboboxState}
          />
          <Textarea
            aria-label="Route address combobox debug state"
            className="min-h-40 resize-y font-mono text-sm"
            readOnly
            value={stateJson}
          />
        </div>
      </main>
    </AppWorkspaceRouteChrome>
  );
}
