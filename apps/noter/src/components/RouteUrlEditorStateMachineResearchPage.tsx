import {
  RouteUrlEditor,
  type RouteUrlEditorDebugState,
  type RouteUrlEditorSuggestionState,
  type RouteUrlEditorTouchScrollPickerMetrics,
} from "@/components/RouteUrlEditor";
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

type ResearchMachineStateKind = ResearchMachineState["kind"];

type ResearchTransitionEventsByState = {
  blurred: "focus" | "hashSuggestionsRefreshed" | "historyIndexObserved" | "routeRealityChanged";
  "focused.clean":
    | "blur"
    | "draftChanged"
    | "hashSuggestionsRefreshed"
    | "historyIndexObserved"
    | "routeRealityChanged"
    | "suggestionHighlighted"
    | "touchPickerStarted";
  "focused.editing":
    | "blur"
    | "draftChanged"
    | "escapePressed"
    | "hashSuggestionsRefreshed"
    | "historyIndexObserved"
    | "routeRealityChanged"
    | "suggestionHighlighted"
    | "suggestionPreviewed"
    | "suggestionSelected"
    | "touchPickerStarted";
  "focused.previewing":
    | "blur"
    | "draftChanged"
    | "escapePressed"
    | "hashSuggestionsRefreshed"
    | "historyIndexObserved"
    | "routeRealityChanged"
    | "suggestionSelected"
    | "touchPickerStarted";
  "focused.touchPicking":
    | "blur"
    | "draftChanged"
    | "escapePressed"
    | "hashSuggestionsRefreshed"
    | "historyIndexObserved"
    | "routeRealityChanged"
    | "touchPickerCanceled"
    | "touchPickerCommitted"
    | "touchPickerPreviewed";
};

type ResearchTransitionTable = {
  [TKind in ResearchMachineStateKind]: {
    [TEventType in ResearchTransitionEventsByState[TKind]]: ResearchMachineStateKind;
  };
};

const routeUrlEditorTransitions = {
  blurred: {
    focus: "focused.clean",
    hashSuggestionsRefreshed: "blurred",
    historyIndexObserved: "blurred",
    routeRealityChanged: "blurred",
  },
  "focused.clean": {
    blur: "blurred",
    draftChanged: "focused.editing",
    hashSuggestionsRefreshed: "focused.clean",
    historyIndexObserved: "focused.clean",
    routeRealityChanged: "focused.clean",
    suggestionHighlighted: "focused.clean",
    touchPickerStarted: "focused.touchPicking",
  },
  "focused.editing": {
    blur: "blurred",
    draftChanged: "focused.editing",
    escapePressed: "blurred",
    hashSuggestionsRefreshed: "focused.editing",
    historyIndexObserved: "focused.editing",
    routeRealityChanged: "focused.editing",
    suggestionHighlighted: "focused.editing",
    suggestionPreviewed: "focused.previewing",
    suggestionSelected: "focused.editing",
    touchPickerStarted: "focused.touchPicking",
  },
  "focused.previewing": {
    blur: "blurred",
    draftChanged: "focused.editing",
    escapePressed: "focused.editing",
    hashSuggestionsRefreshed: "focused.previewing",
    historyIndexObserved: "focused.previewing",
    routeRealityChanged: "focused.previewing",
    suggestionSelected: "focused.editing",
    touchPickerStarted: "focused.touchPicking",
  },
  "focused.touchPicking": {
    blur: "blurred",
    draftChanged: "focused.editing",
    escapePressed: "focused.editing",
    hashSuggestionsRefreshed: "focused.touchPicking",
    historyIndexObserved: "focused.touchPicking",
    routeRealityChanged: "focused.touchPicking",
    touchPickerCanceled: "focused.editing",
    touchPickerCommitted: "focused.previewing",
    touchPickerPreviewed: "focused.touchPicking",
  },
} as const satisfies ResearchTransitionTable;

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

function renderRouteUrlEditorMermaidTransitions() {
  const lines = ["stateDiagram-v2"];

  for (const [from, byEvent] of Object.entries(routeUrlEditorTransitions)) {
    for (const [event, to] of Object.entries(byEvent)) {
      lines.push(`  ${from} --> ${to}: ${event}`);
    }
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
    () => formatJson(debugState?.store ?? null),
    [debugState?.store],
  );
  const formattedDebugState = useMemo(() => formatJson(debugState), [debugState]);
  const mermaidTransitions = useMemo(renderRouteUrlEditorMermaidTransitions, []);

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
      <div className="grid gap-4 lg:grid-cols-3">
        <Textarea
          readOnly
          value={formattedStoreState}
          aria-label="Route URL editor store state"
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
