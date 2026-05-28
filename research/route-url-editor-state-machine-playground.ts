/**
 * RouteUrlEditor state-shape playground.
 *
 * This is intentionally not imported by production code. It copies the state
 * concerns from apps/noter/src/components/RouteUrlEditor.tsx so the approaches
 * can be edited side by side without changing the shipped route editor.
 */

type SuggestionKind = "hash" | "path" | "search" | "search-value";

type TouchScrollPickerMetrics = {
  bottomSpacerHeightPx: number;
  slateTopPx: number;
  topSpacerHeightPx: number;
};

type SuggestionState = {
  activeIndex: number | null;
  baseRouteAddress: string;
  dismissed: boolean;
  draftEditedSinceFocus: boolean;
  kind: SuggestionKind;
  selectionRouteIndex: number;
};

type StoreState = {
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  inputFocused: boolean;
  suggestionState: SuggestionState;
  touchScrollPickerEnabled: boolean;
  touchScrollPickerMetrics: TouchScrollPickerMetrics | null;
};

export function createStoreState(args: {
  currentHref: string;
  currentRouteHistoryIndex: number;
}): StoreState {
  return {
    documentHashSuggestionKeys: [],
    draftRouteAddress: args.currentHref,
    forwardRouteHistoryIndex: args.currentRouteHistoryIndex,
    inputFocused: false,
    suggestionState: {
      activeIndex: null,
      baseRouteAddress: args.currentHref,
      dismissed: false,
      draftEditedSinceFocus: false,
      kind: "path",
      selectionRouteIndex: 0,
    },
    touchScrollPickerEnabled: false,
    touchScrollPickerMetrics: null,
  };
}

/**
 * Approach 1: the current RouteUrlEditor shape.
 *
 * This mirrors the production TanStack Store actions. It is small and direct,
 * but the action type says nothing about which actions make sense while blurred,
 * clean, previewing, or touch-picking.
 */
type StoreAction =
  | { inputFocused: boolean; type: "setInputFocused" }
  | { draftRouteAddress: string; type: "setDraftRouteAddress" }
  | { documentHashSuggestionKeys: readonly string[]; type: "setDocumentHashSuggestionKeys" }
  | { nextState: Partial<SuggestionState>; type: "patchSuggestionState" }
  | { touchScrollPickerEnabled: boolean; type: "setTouchScrollPickerEnabled" }
  | {
      touchScrollPickerMetrics: TouchScrollPickerMetrics | null;
      type: "setTouchScrollPickerMetrics";
    }
  | { forwardRouteHistoryIndex: number; type: "setForwardRouteHistoryIndex" };

export function reduceStoreState(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case "patchSuggestionState":
      return {
        ...state,
        suggestionState: { ...state.suggestionState, ...action.nextState },
      };
    case "setDocumentHashSuggestionKeys":
      return { ...state, documentHashSuggestionKeys: action.documentHashSuggestionKeys };
    case "setDraftRouteAddress":
      return { ...state, draftRouteAddress: action.draftRouteAddress };
    case "setForwardRouteHistoryIndex":
      return { ...state, forwardRouteHistoryIndex: action.forwardRouteHistoryIndex };
    case "setInputFocused":
      return { ...state, inputFocused: action.inputFocused };
    case "setTouchScrollPickerEnabled":
      return { ...state, touchScrollPickerEnabled: action.touchScrollPickerEnabled };
    case "setTouchScrollPickerMetrics":
      return { ...state, touchScrollPickerMetrics: action.touchScrollPickerMetrics };
  }
  action satisfies never;
  return state;
}

type BlurredState = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  kind: "blurred";
};

type FocusedCleanState = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  kind: "focused.clean";
  suggestion: SuggestionState & { draftEditedSinceFocus: false };
  touchScrollPickerEnabled: boolean;
};

type FocusedEditingState = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  kind: "focused.editing";
  suggestion: SuggestionState & { draftEditedSinceFocus: true };
  touchScrollPickerEnabled: boolean;
};

type FocusedPreviewingState = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  kind: "focused.previewing";
  previewBaseHref: string;
  suggestion: SuggestionState & {
    activeIndex: number;
    dismissed: false;
    draftEditedSinceFocus: true;
  };
  touchScrollPickerEnabled: boolean;
};

type FocusedTouchPickingState = {
  currentHref: string;
  documentHashSuggestionKeys: readonly string[];
  draftRouteAddress: string;
  forwardRouteHistoryIndex: number;
  kind: "focused.touchPicking";
  pendingPreviewDraftRouteAddress: string | null;
  suggestion: SuggestionState & {
    activeIndex: number;
    dismissed: false;
    draftEditedSinceFocus: true;
  };
  touchScrollPickerMetrics: TouchScrollPickerMetrics;
};

type MachineState =
  | BlurredState
  | FocusedCleanState
  | FocusedEditingState
  | FocusedPreviewingState
  | FocusedTouchPickingState;

type MachineStateKind = MachineState["kind"];
type StateOf<TKind extends MachineStateKind> = Extract<MachineState, { kind: TKind }>;

type FocusEvent = {
  selectionRouteIndex: number;
  type: "focus";
};

type BlurEvent = {
  type: "blur";
};

type RouteRealityChangedEvent = {
  currentHref: string;
  type: "routeRealityChanged";
};

type DraftChangedEvent = {
  draftRouteAddress: string;
  kind: SuggestionKind;
  selectionRouteIndex: number;
  type: "draftChanged";
};

type SuggestionHighlightedEvent = {
  activeIndex: number | null;
  type: "suggestionHighlighted";
};

type SuggestionPreviewedEvent = {
  activeIndex: number;
  draftRouteAddress: string;
  previewBaseHref: string;
  type: "suggestionPreviewed";
};

type SuggestionSelectedEvent = {
  draftRouteAddress: string;
  type: "suggestionSelected";
};

type EscapePressedEvent = {
  type: "escapePressed";
};

type HashSuggestionsRefreshedEvent = {
  keys: readonly string[];
  type: "hashSuggestionsRefreshed";
};

type TouchPickerStartedEvent = {
  activeIndex: number;
  metrics: TouchScrollPickerMetrics;
  type: "touchPickerStarted";
};

type TouchPickerPreviewedEvent = {
  draftRouteAddress: string;
  type: "touchPickerPreviewed";
};

type TouchPickerCanceledEvent = {
  type: "touchPickerCanceled";
};

type TouchPickerCommittedEvent = {
  draftRouteAddress: string;
  previewBaseHref: string;
  type: "touchPickerCommitted";
};

type HistoryIndexObservedEvent = {
  forwardRouteHistoryIndex: number;
  type: "historyIndexObserved";
};

type EventsByState = {
  blurred:
    | FocusEvent
    | HashSuggestionsRefreshedEvent
    | HistoryIndexObservedEvent
    | RouteRealityChangedEvent;
  "focused.clean":
    | BlurEvent
    | DraftChangedEvent
    | HashSuggestionsRefreshedEvent
    | HistoryIndexObservedEvent
    | RouteRealityChangedEvent
    | SuggestionHighlightedEvent
    | TouchPickerStartedEvent;
  "focused.editing":
    | BlurEvent
    | DraftChangedEvent
    | EscapePressedEvent
    | HashSuggestionsRefreshedEvent
    | HistoryIndexObservedEvent
    | RouteRealityChangedEvent
    | SuggestionHighlightedEvent
    | SuggestionPreviewedEvent
    | SuggestionSelectedEvent
    | TouchPickerStartedEvent;
  "focused.previewing":
    | BlurEvent
    | DraftChangedEvent
    | EscapePressedEvent
    | HashSuggestionsRefreshedEvent
    | HistoryIndexObservedEvent
    | RouteRealityChangedEvent
    | SuggestionSelectedEvent
    | TouchPickerStartedEvent;
  "focused.touchPicking":
    | BlurEvent
    | DraftChangedEvent
    | EscapePressedEvent
    | HashSuggestionsRefreshedEvent
    | HistoryIndexObservedEvent
    | RouteRealityChangedEvent
    | TouchPickerCanceledEvent
    | TouchPickerCommittedEvent
    | TouchPickerPreviewedEvent;
};

type EventFor<TKind extends MachineStateKind> = EventsByState[TKind];
type MachineEvent = EventsByState[MachineStateKind];
type EventTypeFor<TKind extends MachineStateKind> = EventFor<TKind>["type"];
type EventOfType<TKind extends MachineStateKind, TEventType extends EventTypeFor<TKind>> = Extract<
  EventFor<TKind>,
  { type: TEventType }
>;

type TransitionTable = {
  [TKind in MachineStateKind]: {
    [TEventType in EventTypeFor<TKind>]: MachineStateKind;
  };
};

/**
 * Approach 2: state-indexed transitions.
 *
 * Try adding `suggestionPreviewed` under `blurred`, or deleting
 * `touchPickerPreviewed` under `focused.touchPicking`. The table stops matching
 * EventsByState immediately.
 */
export const routeUrlEditorTransitions = {
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
} as const satisfies TransitionTable;

type NextStateKind<
  TKind extends MachineStateKind,
  TEventType extends keyof (typeof routeUrlEditorTransitions)[TKind],
> = (typeof routeUrlEditorTransitions)[TKind][TEventType];

type NextState<
  TKind extends MachineStateKind,
  TEventType extends keyof (typeof routeUrlEditorTransitions)[TKind],
> = Extract<MachineState, { kind: NextStateKind<TKind, TEventType> }>;

type TransitionEventType<TKind extends MachineStateKind> =
  keyof (typeof routeUrlEditorTransitions)[TKind] & EventTypeFor<TKind>;

type HandlerMap = {
  [TKind in MachineStateKind]: {
    [TEventType in TransitionEventType<TKind>]: (
      state: StateOf<TKind>,
      event: EventOfType<TKind, TEventType>,
    ) => NextState<TKind, TEventType>;
  };
};

const cleanSuggestion = (args: {
  baseRouteAddress: string;
  kind: SuggestionKind;
  selectionRouteIndex: number;
}): SuggestionState & { draftEditedSinceFocus: false } => ({
  activeIndex: null,
  baseRouteAddress: args.baseRouteAddress,
  dismissed: false,
  draftEditedSinceFocus: false,
  kind: args.kind,
  selectionRouteIndex: args.selectionRouteIndex,
});

const editingSuggestion = (args: {
  activeIndex: number | null;
  baseRouteAddress: string;
  kind: SuggestionKind;
  selectionRouteIndex: number;
}): SuggestionState & { draftEditedSinceFocus: true } => ({
  activeIndex: args.activeIndex,
  baseRouteAddress: args.baseRouteAddress,
  dismissed: false,
  draftEditedSinceFocus: true,
  kind: args.kind,
  selectionRouteIndex: args.selectionRouteIndex,
});

const activeEditingSuggestion = (args: {
  activeIndex: number;
  baseRouteAddress: string;
  kind: SuggestionKind;
  selectionRouteIndex: number;
}): SuggestionState & {
  activeIndex: number;
  dismissed: false;
  draftEditedSinceFocus: true;
} => ({
  activeIndex: args.activeIndex,
  baseRouteAddress: args.baseRouteAddress,
  dismissed: false,
  draftEditedSinceFocus: true,
  kind: args.kind,
  selectionRouteIndex: args.selectionRouteIndex,
});

export function createMachineState(args: {
  currentHref: string;
  currentRouteHistoryIndex: number;
}): MachineState {
  return {
    currentHref: args.currentHref,
    documentHashSuggestionKeys: [],
    draftRouteAddress: args.currentHref,
    forwardRouteHistoryIndex: args.currentRouteHistoryIndex,
    kind: "blurred",
  };
}

export const routeUrlEditorHandlers: HandlerMap = {
  blurred: {
    focus: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.currentHref,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.clean",
      suggestion: cleanSuggestion({
        baseRouteAddress: state.currentHref,
        kind: "path",
        selectionRouteIndex: event.selectionRouteIndex,
      }),
      touchScrollPickerEnabled: false,
    }),
    hashSuggestionsRefreshed: (state, event) => ({
      ...state,
      documentHashSuggestionKeys: event.keys,
    }),
    historyIndexObserved: (state, event) => ({
      ...state,
      forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
    }),
    routeRealityChanged: (state, event) => ({
      ...state,
      currentHref: event.currentHref,
      draftRouteAddress: event.currentHref,
    }),
  },
  "focused.clean": {
    blur: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.currentHref,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "blurred",
    }),
    draftChanged: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: editingSuggestion({
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
        kind: event.kind,
        selectionRouteIndex: event.selectionRouteIndex,
      }),
      touchScrollPickerEnabled: state.touchScrollPickerEnabled,
    }),
    hashSuggestionsRefreshed: (state, event) => ({
      ...state,
      documentHashSuggestionKeys: event.keys,
    }),
    historyIndexObserved: (state, event) => ({
      ...state,
      forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
    }),
    routeRealityChanged: (state, event) => ({
      ...state,
      currentHref: event.currentHref,
      draftRouteAddress: event.currentHref,
      suggestion: { ...state.suggestion, baseRouteAddress: event.currentHref },
    }),
    suggestionHighlighted: (state, event) => ({
      ...state,
      suggestion: { ...state.suggestion, activeIndex: event.activeIndex },
    }),
    touchPickerStarted: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.touchPicking",
      pendingPreviewDraftRouteAddress: null,
      suggestion: activeEditingSuggestion({
        activeIndex: event.activeIndex,
        baseRouteAddress: state.suggestion.baseRouteAddress,
        kind: state.suggestion.kind,
        selectionRouteIndex: state.suggestion.selectionRouteIndex,
      }),
      touchScrollPickerMetrics: event.metrics,
    }),
  },
  "focused.editing": {
    blur: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "blurred",
    }),
    draftChanged: (state, event) => ({
      ...state,
      draftRouteAddress: event.draftRouteAddress,
      suggestion: editingSuggestion({
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
        kind: event.kind,
        selectionRouteIndex: event.selectionRouteIndex,
      }),
    }),
    escapePressed: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.currentHref,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "blurred",
    }),
    hashSuggestionsRefreshed: (state, event) => ({
      ...state,
      documentHashSuggestionKeys: event.keys,
    }),
    historyIndexObserved: (state, event) => ({
      ...state,
      forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
    }),
    routeRealityChanged: (state, event) => ({
      ...state,
      currentHref: event.currentHref,
    }),
    suggestionHighlighted: (state, event) => ({
      ...state,
      suggestion: { ...state.suggestion, activeIndex: event.activeIndex },
    }),
    suggestionPreviewed: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.previewing",
      previewBaseHref: event.previewBaseHref,
      suggestion: activeEditingSuggestion({
        activeIndex: event.activeIndex,
        baseRouteAddress: state.suggestion.baseRouteAddress,
        kind: state.suggestion.kind,
        selectionRouteIndex: state.suggestion.selectionRouteIndex,
      }),
      touchScrollPickerEnabled: state.touchScrollPickerEnabled,
    }),
    suggestionSelected: (state, event) => ({
      ...state,
      draftRouteAddress: event.draftRouteAddress,
      suggestion: {
        ...state.suggestion,
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
      },
    }),
    touchPickerStarted: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.touchPicking",
      pendingPreviewDraftRouteAddress: null,
      suggestion: activeEditingSuggestion({
        activeIndex: event.activeIndex,
        baseRouteAddress: state.suggestion.baseRouteAddress,
        kind: state.suggestion.kind,
        selectionRouteIndex: state.suggestion.selectionRouteIndex,
      }),
      touchScrollPickerMetrics: event.metrics,
    }),
  },
  "focused.previewing": {
    blur: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "blurred",
    }),
    draftChanged: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: editingSuggestion({
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
        kind: event.kind,
        selectionRouteIndex: event.selectionRouteIndex,
      }),
      touchScrollPickerEnabled: state.touchScrollPickerEnabled,
    }),
    escapePressed: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.suggestion.baseRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: {
        ...state.suggestion,
        activeIndex: null,
      },
      touchScrollPickerEnabled: state.touchScrollPickerEnabled,
    }),
    hashSuggestionsRefreshed: (state, event) => ({
      ...state,
      documentHashSuggestionKeys: event.keys,
    }),
    historyIndexObserved: (state, event) => ({
      ...state,
      forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
    }),
    routeRealityChanged: (state, event) => ({
      ...state,
      currentHref: event.currentHref,
    }),
    suggestionSelected: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: {
        ...state.suggestion,
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
      },
      touchScrollPickerEnabled: state.touchScrollPickerEnabled,
    }),
    touchPickerStarted: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.touchPicking",
      pendingPreviewDraftRouteAddress: null,
      suggestion: activeEditingSuggestion({
        activeIndex: event.activeIndex,
        baseRouteAddress: state.suggestion.baseRouteAddress,
        kind: state.suggestion.kind,
        selectionRouteIndex: state.suggestion.selectionRouteIndex,
      }),
      touchScrollPickerMetrics: event.metrics,
    }),
  },
  "focused.touchPicking": {
    blur: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "blurred",
    }),
    draftChanged: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: editingSuggestion({
        activeIndex: null,
        baseRouteAddress: event.draftRouteAddress,
        kind: event.kind,
        selectionRouteIndex: event.selectionRouteIndex,
      }),
      touchScrollPickerEnabled: true,
    }),
    escapePressed: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: state.suggestion,
      touchScrollPickerEnabled: true,
    }),
    hashSuggestionsRefreshed: (state, event) => ({
      ...state,
      documentHashSuggestionKeys: event.keys,
    }),
    historyIndexObserved: (state, event) => ({
      ...state,
      forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
    }),
    routeRealityChanged: (state, event) => ({
      ...state,
      currentHref: event.currentHref,
    }),
    touchPickerCanceled: (state) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: state.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.editing",
      suggestion: state.suggestion,
      touchScrollPickerEnabled: true,
    }),
    touchPickerCommitted: (state, event) => ({
      currentHref: state.currentHref,
      documentHashSuggestionKeys: state.documentHashSuggestionKeys,
      draftRouteAddress: event.draftRouteAddress,
      forwardRouteHistoryIndex: state.forwardRouteHistoryIndex,
      kind: "focused.previewing",
      previewBaseHref: event.previewBaseHref,
      suggestion: state.suggestion,
      touchScrollPickerEnabled: true,
    }),
    touchPickerPreviewed: (state, event) => ({
      ...state,
      pendingPreviewDraftRouteAddress: event.draftRouteAddress,
    }),
  },
};

/**
 * Approach 3: React boundary reducer.
 *
 * React dispatch is broad because a delayed click or timer can fire after the
 * state changed. The state-indexed send is still useful below for child props.
 */
export function reduceMachineState(state: MachineState, event: MachineEvent): MachineState {
  switch (state.kind) {
    case "blurred":
      switch (event.type) {
        case "focus":
          return routeUrlEditorHandlers.blurred.focus(state, event);
        case "hashSuggestionsRefreshed":
          return routeUrlEditorHandlers.blurred.hashSuggestionsRefreshed(state, event);
        case "historyIndexObserved":
          return routeUrlEditorHandlers.blurred.historyIndexObserved(state, event);
        case "routeRealityChanged":
          return routeUrlEditorHandlers.blurred.routeRealityChanged(state, event);
        default:
          return state;
      }
    case "focused.clean":
      switch (event.type) {
        case "blur":
          return routeUrlEditorHandlers["focused.clean"].blur(state, event);
        case "draftChanged":
          return routeUrlEditorHandlers["focused.clean"].draftChanged(state, event);
        case "hashSuggestionsRefreshed":
          return routeUrlEditorHandlers["focused.clean"].hashSuggestionsRefreshed(state, event);
        case "historyIndexObserved":
          return routeUrlEditorHandlers["focused.clean"].historyIndexObserved(state, event);
        case "routeRealityChanged":
          return routeUrlEditorHandlers["focused.clean"].routeRealityChanged(state, event);
        case "suggestionHighlighted":
          return routeUrlEditorHandlers["focused.clean"].suggestionHighlighted(state, event);
        case "touchPickerStarted":
          return routeUrlEditorHandlers["focused.clean"].touchPickerStarted(state, event);
        default:
          return state;
      }
    case "focused.editing":
      switch (event.type) {
        case "blur":
          return routeUrlEditorHandlers["focused.editing"].blur(state, event);
        case "draftChanged":
          return routeUrlEditorHandlers["focused.editing"].draftChanged(state, event);
        case "escapePressed":
          return routeUrlEditorHandlers["focused.editing"].escapePressed(state, event);
        case "hashSuggestionsRefreshed":
          return routeUrlEditorHandlers["focused.editing"].hashSuggestionsRefreshed(state, event);
        case "historyIndexObserved":
          return routeUrlEditorHandlers["focused.editing"].historyIndexObserved(state, event);
        case "routeRealityChanged":
          return routeUrlEditorHandlers["focused.editing"].routeRealityChanged(state, event);
        case "suggestionHighlighted":
          return routeUrlEditorHandlers["focused.editing"].suggestionHighlighted(state, event);
        case "suggestionPreviewed":
          return routeUrlEditorHandlers["focused.editing"].suggestionPreviewed(state, event);
        case "suggestionSelected":
          return routeUrlEditorHandlers["focused.editing"].suggestionSelected(state, event);
        case "touchPickerStarted":
          return routeUrlEditorHandlers["focused.editing"].touchPickerStarted(state, event);
        default:
          return state;
      }
    case "focused.previewing":
      switch (event.type) {
        case "blur":
          return routeUrlEditorHandlers["focused.previewing"].blur(state, event);
        case "draftChanged":
          return routeUrlEditorHandlers["focused.previewing"].draftChanged(state, event);
        case "escapePressed":
          return routeUrlEditorHandlers["focused.previewing"].escapePressed(state, event);
        case "hashSuggestionsRefreshed":
          return routeUrlEditorHandlers["focused.previewing"].hashSuggestionsRefreshed(
            state,
            event,
          );
        case "historyIndexObserved":
          return routeUrlEditorHandlers["focused.previewing"].historyIndexObserved(state, event);
        case "routeRealityChanged":
          return routeUrlEditorHandlers["focused.previewing"].routeRealityChanged(state, event);
        case "suggestionSelected":
          return routeUrlEditorHandlers["focused.previewing"].suggestionSelected(state, event);
        case "touchPickerStarted":
          return routeUrlEditorHandlers["focused.previewing"].touchPickerStarted(state, event);
        default:
          return state;
      }
    case "focused.touchPicking":
      switch (event.type) {
        case "blur":
          return routeUrlEditorHandlers["focused.touchPicking"].blur(state, event);
        case "draftChanged":
          return routeUrlEditorHandlers["focused.touchPicking"].draftChanged(state, event);
        case "escapePressed":
          return routeUrlEditorHandlers["focused.touchPicking"].escapePressed(state, event);
        case "hashSuggestionsRefreshed":
          return routeUrlEditorHandlers["focused.touchPicking"].hashSuggestionsRefreshed(
            state,
            event,
          );
        case "historyIndexObserved":
          return routeUrlEditorHandlers["focused.touchPicking"].historyIndexObserved(state, event);
        case "routeRealityChanged":
          return routeUrlEditorHandlers["focused.touchPicking"].routeRealityChanged(state, event);
        case "touchPickerCanceled":
          return routeUrlEditorHandlers["focused.touchPicking"].touchPickerCanceled(state, event);
        case "touchPickerCommitted":
          return routeUrlEditorHandlers["focused.touchPicking"].touchPickerCommitted(state, event);
        case "touchPickerPreviewed":
          return routeUrlEditorHandlers["focused.touchPicking"].touchPickerPreviewed(state, event);
        default:
          return state;
      }
  }
  state satisfies never;
  return state;
}

type Dispatch = (event: MachineEvent) => void;
type SendFor<TKind extends MachineStateKind> = (event: EventFor<TKind>) => void;

export function blurredChromeDemo(args: { send: SendFor<"blurred">; state: BlurredState }) {
  args.send({ selectionRouteIndex: 0, type: "focus" });

  // Try uncommenting. A blurred editor cannot preview a suggestion.
  // args.send({ activeIndex: 0, draftRouteAddress: "/vaults", previewBaseHref: "/", type: "suggestionPreviewed" });

  return args.state.draftRouteAddress;
}

export function editingInputDemo(args: {
  send: SendFor<"focused.editing">;
  state: FocusedEditingState;
}) {
  args.send({
    activeIndex: 0,
    draftRouteAddress: "/vaults",
    previewBaseHref: "/",
    type: "suggestionPreviewed",
  });

  // Try uncommenting. Touch preview events only exist after the touch picker starts.
  // args.send({ draftRouteAddress: "/vaults", type: "touchPickerPreviewed" });

  return args.state.suggestion.baseRouteAddress;
}

export function touchPickerDemo(args: {
  send: SendFor<"focused.touchPicking">;
  state: FocusedTouchPickingState;
}) {
  args.send({ draftRouteAddress: "/settings", type: "touchPickerPreviewed" });
  args.send({ draftRouteAddress: "/settings", previewBaseHref: "/", type: "touchPickerCommitted" });

  // Try uncommenting. Suggestion preview is a keyboard/pointer event, not a touch-picker event.
  // args.send({ activeIndex: 0, draftRouteAddress: "/settings", previewBaseHref: "/", type: "suggestionPreviewed" });

  return args.state.touchScrollPickerMetrics.slateTopPx;
}

export function renderRouteUrlEditorPlayground(state: MachineState, dispatch: Dispatch) {
  switch (state.kind) {
    case "blurred":
      return blurredChromeDemo({ send: dispatch, state });
    case "focused.clean":
      return state.draftRouteAddress;
    case "focused.editing":
      return editingInputDemo({ send: dispatch, state });
    case "focused.previewing":
      return state.previewBaseHref;
    case "focused.touchPicking":
      return touchPickerDemo({ send: dispatch, state });
  }
  state satisfies never;
  return null;
}

export function renderRouteUrlEditorMermaidTransitions() {
  const lines = ["stateDiagram-v2"];

  for (const [from, byEvent] of Object.entries(routeUrlEditorTransitions)) {
    for (const [event, to] of Object.entries(byEvent)) {
      lines.push(`  ${from} --> ${to}: ${event}`);
    }
  }

  return lines.join("\n");
}
