import {
  RouteUrlEditor,
  type RouteUrlEditorDebugState,
  type RouteUrlEditorSuggestionState,
  type RouteUrlEditorTouchScrollPickerMetrics,
} from "@/components/RouteUrlEditor";
import { routeUrlEditorXStateStoreEventTypes } from "@/components/RouteUrlEditorXState";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useMemo, useState } from "react";

type ResearchMachineStateSnapshot = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
};

type ResearchMachineState = ResearchMachineStateSnapshot &
  (
    | {
        kind: "blurred";
      }
    | {
        kind: "focused.clean";
        suggestion: RouteUrlEditorSuggestionState;
        touchScrollPickerEnabled: boolean;
      }
    | {
        kind: "focused.editing";
        suggestion: RouteUrlEditorSuggestionState;
        touchScrollPickerEnabled: boolean;
      }
    | {
        kind: "focused.previewing";
        previewBaseHref: string;
        suggestion: RouteUrlEditorSuggestionState;
        touchScrollPickerEnabled: boolean;
      }
    | {
        kind: "focused.touchPicking";
        pendingPreviewDraftRouteAddress: string | null;
        suggestion: RouteUrlEditorSuggestionState;
        touchScrollPickerMetrics: RouteUrlEditorTouchScrollPickerMetrics;
      }
  );

function readResearchMachineState(
  debugState: RouteUrlEditorDebugState | null,
): ResearchMachineState | null {
  if (debugState === null) {
    return null;
  }

  const store = debugState.store;
  const baseState = {
    currentHref: debugState.currentHref,
    documentHashSuggestionKeys: store.documentHashSuggestionKeys,
    draftRouteAddress: store.draftRouteAddress,
    forwardRouteHistoryIndex: store.forwardRouteHistoryIndex,
  };

  if (!store.inputFocused) {
    return { ...baseState, kind: "blurred" };
  }

  if (
    store.touchScrollPickerEnabled &&
    debugState.suggestionsVisible &&
    store.touchScrollPickerMetrics
  ) {
    return {
      ...baseState,
      kind: "focused.touchPicking",
      pendingPreviewDraftRouteAddress: debugState.touchScrollPreviewDraftRouteAddress,
      suggestion: store.suggestionState,
      touchScrollPickerMetrics: store.touchScrollPickerMetrics,
    };
  }

  if (debugState.previewBaseHref && store.suggestionState.activeIndex !== null) {
    return {
      ...baseState,
      kind: "focused.previewing",
      previewBaseHref: debugState.previewBaseHref,
      suggestion: store.suggestionState,
      touchScrollPickerEnabled: store.touchScrollPickerEnabled,
    };
  }

  if (store.suggestionState.draftEditedSinceFocus) {
    return {
      ...baseState,
      kind: "focused.editing",
      suggestion: store.suggestionState,
      touchScrollPickerEnabled: store.touchScrollPickerEnabled,
    };
  }

  return {
    ...baseState,
    kind: "focused.clean",
    suggestion: store.suggestionState,
    touchScrollPickerEnabled: store.touchScrollPickerEnabled,
  };
}

function renderRouteUrlEditorXStateMermaid() {
  const lines = [
    "stateDiagram-v2",
    '  state "RouteUrlEditor XState transition actor" as route_url_editor_store',
    "  [*] --> route_url_editor_store",
  ];

  for (const eventType of routeUrlEditorXStateStoreEventTypes) {
    lines.push(`  route_url_editor_store --> route_url_editor_store: ${eventType}`);
  }

  return lines.join("\n");
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function RouteUrlEditorStateMachineResearchPage() {
  const [debugState, setDebugState] = useState<RouteUrlEditorDebugState | null>(null);
  const syncDebugState = useCallback((nextState: RouteUrlEditorDebugState) => {
    setDebugState((currentState) =>
      formatJson(currentState) === formatJson(nextState) ? currentState : nextState,
    );
  }, []);
  const machineState = useMemo(() => readResearchMachineState(debugState), [debugState]);
  const formattedMachineState = useMemo(() => formatJson(machineState), [machineState]);
  const formattedStoreState = useMemo(
    () => formatJson(debugState?.xstate.context ?? null),
    [debugState?.xstate.context],
  );
  const formattedXState = useMemo(
    () => formatJson(debugState?.xstate ?? null),
    [debugState?.xstate],
  );
  const formattedDebugState = useMemo(() => formatJson(debugState), [debugState]);
  const mermaidTransitions = useMemo(renderRouteUrlEditorXStateMermaid, []);

  return (
    <main className="grid min-h-screen gap-4 bg-background p-4 text-foreground">
      <div
        className="flex h-8 min-w-0 items-center gap-2"
        data-testid="route-url-editor-state-machine-live-editor"
      >
        <div className="min-w-0 flex-1">
          <RouteUrlEditor onDebugStateChange={syncDebugState} />
        </div>
      </div>
      <Textarea
        readOnly
        value={formattedMachineState}
        aria-label="Route URL editor derived machine state"
        data-testid="route-url-editor-state-machine-json"
        className="min-h-80 resize-y rounded-none font-mono text-sm"
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <Textarea
          readOnly
          value={formattedXState}
          aria-label="Route URL editor XState actor snapshot"
          data-testid="route-url-editor-state-machine-xstate-json"
          className="min-h-64 resize-y rounded-none font-mono text-sm"
        />
        <Textarea
          readOnly
          value={formattedStoreState}
          aria-label="Route URL editor XState context"
          data-testid="route-url-editor-state-machine-store-json"
          className="min-h-64 resize-y rounded-none font-mono text-sm"
        />
        <Textarea
          readOnly
          value={formattedDebugState}
          aria-label="Route URL editor debug state"
          data-testid="route-url-editor-state-machine-debug-json"
          className="min-h-64 resize-y rounded-none font-mono text-sm"
        />
        <Textarea
          readOnly
          value={mermaidTransitions}
          aria-label="Route URL editor Mermaid transitions"
          data-testid="route-url-editor-state-machine-mermaid"
          className="min-h-64 resize-y rounded-none font-mono text-sm"
        />
      </div>
    </main>
  );
}
