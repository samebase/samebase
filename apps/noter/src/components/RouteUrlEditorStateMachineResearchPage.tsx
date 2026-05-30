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

type ResearchMachineStateKind = ResearchMachineState["kind"];

type ResearchStateNode = {
  description: string;
  kind: ResearchMachineStateKind;
  title: string;
};

const researchStateNodes = [
  {
    description: "Input is not focused.",
    kind: "blurred",
    title: "blurred",
  },
  {
    description: "Focused and still aligned to route reality.",
    kind: "focused.clean",
    title: "focused clean",
  },
  {
    description: "Focused with user-edited local draft text.",
    kind: "focused.editing",
    title: "editing",
  },
  {
    description: "Focused while a suggestion preview is replacing route reality.",
    kind: "focused.previewing",
    title: "previewing",
  },
  {
    description: "Touch scroll picker is active over the suggestions list.",
    kind: "focused.touchPicking",
    title: "touch picking",
  },
] as const satisfies readonly ResearchStateNode[];

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

function getResearchStateNodeClassName(active: boolean): string {
  return active
    ? "min-h-24 border border-foreground bg-foreground p-3 text-background"
    : "min-h-24 border border-border bg-background p-3 text-foreground";
}

function getResearchEventClassName(active: boolean): string {
  return active
    ? "border border-foreground bg-foreground px-2 py-1 font-mono text-xs text-background"
    : "border border-border bg-background px-2 py-1 font-mono text-xs text-foreground";
}

function readResearchPrimaryEventType(state: ResearchMachineState | null): string | null {
  if (state === null) {
    return null;
  }

  switch (state.kind) {
    case "blurred":
      return "routeUrlEditor.setInputFocused";
    case "focused.clean":
      return "routeUrlEditor.setInputFocused";
    case "focused.editing":
      return "routeUrlEditor.patchSuggestionState";
    case "focused.previewing":
      return "routeUrlEditor.updateSuggestionState";
    case "focused.touchPicking":
      return "routeUrlEditor.syncTouchScrollPickerMetrics";
  }
}

function RouteUrlEditorXStateVisualization({
  debugState,
  machineState,
}: {
  debugState: RouteUrlEditorDebugState | null;
  machineState: ResearchMachineState | null;
}) {
  const activeKind = machineState?.kind ?? null;
  const primaryEventType = readResearchPrimaryEventType(machineState);

  return (
    <section
      aria-label="Route URL editor visual state"
      className="grid gap-3 border border-border p-3"
      data-testid="route-url-editor-state-machine-visualization"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {researchStateNodes.map((node) => {
          const active = node.kind === activeKind;
          return (
            <div
              aria-current={active ? "step" : undefined}
              className={getResearchStateNodeClassName(active)}
              data-active={active}
              key={node.kind}
            >
              <div className="break-words font-mono text-sm">{node.title}</div>
              <div className="mt-2 break-words text-sm">{node.description}</div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="border border-border p-3">
          <div className="font-mono text-sm">actor</div>
          <dl className="mt-2 grid gap-1 text-sm">
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <dt>logic</dt>
              <dd className="min-w-0 break-all font-mono">
                {debugState?.xstate.logic ?? "pending"}
              </dd>
            </div>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <dt>status</dt>
              <dd className="min-w-0 break-all font-mono">
                {debugState?.xstate.status ?? "pending"}
              </dd>
            </div>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <dt>derived</dt>
              <dd className="min-w-0 break-all font-mono">{activeKind ?? "pending"}</dd>
            </div>
          </dl>
        </div>
        <div className="border border-border p-3 md:col-span-2">
          <div className="font-mono text-sm">event surface</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {routeUrlEditorXStateStoreEventTypes.map((eventType) => (
              <span
                className={getResearchEventClassName(eventType === primaryEventType)}
                data-active={eventType === primaryEventType}
                key={eventType}
              >
                {eventType}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <a
          className="border border-border p-3 font-mono text-sm underline"
          href="https://stately.ai/docs/inspector"
          rel="noreferrer"
          target="_blank"
        >
          Stately Inspector
        </a>
        <a
          className="border border-border p-3 font-mono text-sm underline"
          href="https://stately.ai/docs/studio"
          rel="noreferrer"
          target="_blank"
        >
          Stately Studio
        </a>
        <a
          className="border border-border p-3 font-mono text-sm underline"
          href="https://stately.ai/docs/inspection"
          rel="noreferrer"
          target="_blank"
        >
          XState Inspect API
        </a>
      </div>
    </section>
  );
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
      </div>
      <RouteUrlEditorXStateVisualization debugState={debugState} machineState={machineState} />
    </main>
  );
}
