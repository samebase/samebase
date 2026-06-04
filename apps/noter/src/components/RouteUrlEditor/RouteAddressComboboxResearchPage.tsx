import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Textarea } from "@/components/ui/textarea";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { RouteAddressCombobox, type RouteEditorState } from "./RouteAddressCombobox";
import { parseRouteAddress } from "./RouteAddressComboboxSuggestions";

type RouteAddressComboboxResearchState = {
  combobox: RouteEditorState | null;
};

function useRouteAddressComboboxResearchStore() {
  const initialState: RouteAddressComboboxResearchState = {
    combobox: null,
  };

  return useCreateStore(initialState, ({ setState }) => ({
    setComboboxState: (combobox: RouteEditorState) => {
      setState((currentState) =>
        currentState.combobox === combobox
          ? currentState
          : {
              combobox,
            },
      );
    },
  }));
}

export function RouteAddressComboboxResearchPage() {
  const store = useRouteAddressComboboxResearchStore();
  const state = useSelector(store);
  const { setComboboxState } = store.actions;
  const routeAddress =
    state.combobox === null
      ? null
      : state.combobox.kind === "blurred"
        ? state.combobox.path
        : state.combobox.latestPath;
  const stateJson = JSON.stringify(
    {
      combobox: state.combobox,
      parsedRouteAddress: routeAddress === null ? null : parseRouteAddress(routeAddress),
    },
    null,
    2,
  );

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
          <RouteAddressCombobox onDebugStateChange={setComboboxState} />
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
