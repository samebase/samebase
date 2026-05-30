import {
  createBrowserInspector,
  type StatelyInspectionEvent,
  type StatelySnapshotEvent,
} from "@statelyai/inspect";
import {
  RouteUrlEditor,
  type RouteUrlEditorDebugState,
  type RouteUrlEditorSuggestionState,
  type RouteUrlEditorTouchScrollPickerMetrics,
  type RouteUrlEditorXStateInspect,
} from "@/components/RouteUrlEditor";
import { routeUrlEditorXStateStoreEventTypes } from "@/components/RouteUrlEditorXState";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type RouteUrlEditorStatelyInspector = ReturnType<typeof createBrowserInspector>;

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

function countStatelyInspectionEvents(
  events: readonly StatelyInspectionEvent[],
  eventType: StatelyInspectionEvent["type"],
): number {
  return events.filter((event) => event.type === eventType).length;
}

function readLatestStatelySnapshotEvent(
  events: readonly StatelyInspectionEvent[],
): StatelySnapshotEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "@xstate.snapshot") {
      return event;
    }
  }

  return null;
}

function readLatestStatelyInspectionEvents(
  events: readonly StatelyInspectionEvent[],
): StatelyInspectionEvent[] {
  const latestEvents: StatelyInspectionEvent[] = [];

  for (let index = events.length - 1; index >= 0 && latestEvents.length < 12; index -= 1) {
    const event = events[index];
    latestEvents.push(event);
  }

  return latestEvents;
}

function readStatelyInspectionEventTitle(event: StatelyInspectionEvent): string {
  switch (event.type) {
    case "@xstate.actor":
      return "actor";
    case "@xstate.event":
      return "event";
    case "@xstate.snapshot":
      return "snapshot";
  }
}

function readStatelyInspectionEventSubject(event: StatelyInspectionEvent): string {
  switch (event.type) {
    case "@xstate.actor":
      return event.name;
    case "@xstate.event":
      return event.event.type;
    case "@xstate.snapshot":
      return event.event.type;
  }
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
    </section>
  );
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function RouteUrlEditorXStateInspectorPanel({
  events,
}: {
  events: readonly StatelyInspectionEvent[];
}) {
  const latestSnapshotEvent = readLatestStatelySnapshotEvent(events);
  const latestEvents = readLatestStatelyInspectionEvents(events);
  const formattedLatestSnapshot = formatJson(latestSnapshotEvent?.snapshot ?? null);

  return (
    <section
      aria-label="Route URL editor XState inspector"
      className="grid gap-3 border border-border p-3"
      data-testid="route-url-editor-state-machine-xstate-inspector"
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="border border-border p-3">
          <div className="font-mono text-sm">actors</div>
          <div className="mt-2 font-mono text-2xl">
            {countStatelyInspectionEvents(events, "@xstate.actor")}
          </div>
        </div>
        <div className="border border-border p-3">
          <div className="font-mono text-sm">events</div>
          <div className="mt-2 font-mono text-2xl">
            {countStatelyInspectionEvents(events, "@xstate.event")}
          </div>
        </div>
        <div className="border border-border p-3">
          <div className="font-mono text-sm">snapshots</div>
          <div className="mt-2 font-mono text-2xl">
            {countStatelyInspectionEvents(events, "@xstate.snapshot")}
          </div>
        </div>
        <div className="border border-border p-3">
          <div className="font-mono text-sm">latest</div>
          <div className="mt-2 break-all font-mono text-sm">
            {latestSnapshotEvent?.sessionId ?? "pending"}
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)]">
        <div className="border border-border p-3">
          <div className="font-mono text-sm">inspection stream</div>
          <div className="mt-3 grid gap-2">
            {latestEvents.map((event) => (
              <div
                className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border border-border p-2 text-sm"
                key={`${event.createdAt}-${event.type}-${event.sessionId}`}
              >
                <div className="font-mono">{readStatelyInspectionEventTitle(event)}</div>
                <div className="min-w-0 break-all font-mono">
                  {readStatelyInspectionEventSubject(event)}
                </div>
              </div>
            ))}
            {latestEvents.length === 0 ? (
              <div className="border border-border p-2 font-mono text-sm">pending</div>
            ) : null}
          </div>
        </div>
        <Textarea
          readOnly
          value={formattedLatestSnapshot}
          aria-label="Route URL editor latest XState inspection snapshot"
          data-testid="route-url-editor-state-machine-inspection-snapshot-json"
          className="min-h-80 resize-y rounded-none font-mono text-sm"
        />
      </div>
    </section>
  );
}

export function RouteUrlEditorStateMachineResearchPage() {
  const [debugState, setDebugState] = useState<RouteUrlEditorDebugState | null>(null);
  const [statelyInspector, setStatelyInspector] = useState<RouteUrlEditorStatelyInspector | null>(
    null,
  );
  const [xstateInspect, setXstateInspect] = useState<RouteUrlEditorXStateInspect | null>(null);
  const [xstateInspectionEvents, setXstateInspectionEvents] = useState<
    readonly StatelyInspectionEvent[]
  >([]);
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

  useEffect(() => {
    const inspector = createBrowserInspector({
      autoStart: false,
      sanitizeContext: () => ({ redactedForResearchInspector: true }),
      sanitizeEvent: (event) => ({ type: event.type }),
      send: (event) => {
        setXstateInspectionEvents((currentEvents) => [...currentEvents.slice(-79), event]);
      },
    });
    setStatelyInspector(inspector);
    setXstateInspect(inspector.inspect);

    return () => {
      inspector.stop();
      setStatelyInspector(null);
      setXstateInspect(null);
    };
  }, []);

  useEffect(() => {
    if (!statelyInspector || !debugState) {
      return;
    }

    const event = {
      type: readResearchPrimaryEventType(machineState) ?? "routeUrlEditor.observed",
    };
    const snapshot = {
      context: {
        derivedState: machineState?.kind ?? "pending",
        redactedForResearchInspector: true,
      },
      status: debugState.xstate.status,
    };

    statelyInspector.actor("RouteUrlEditor", snapshot);
    statelyInspector.event("RouteUrlEditor", event);
    statelyInspector.snapshot("RouteUrlEditor", snapshot, { event });
  }, [debugState, machineState, statelyInspector]);

  return (
    <main className="grid min-h-screen gap-4 bg-background p-4 text-foreground">
      <div
        className="flex h-8 min-w-0 items-center gap-2"
        data-testid="route-url-editor-state-machine-live-editor"
      >
        <div className="min-w-0 flex-1">
          <RouteUrlEditor
            key={xstateInspect === null ? "plain" : "inspected"}
            onDebugStateChange={syncDebugState}
            xstateInspect={xstateInspect ?? undefined}
          />
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
      <RouteUrlEditorXStateInspectorPanel events={xstateInspectionEvents} />
    </main>
  );
}
