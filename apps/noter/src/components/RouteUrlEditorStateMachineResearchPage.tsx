import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useReducer, type ReactNode } from "react";

/**
 * RouteUrlEditor state-shape playground.
 *
 * This page copies the state concerns from RouteUrlEditor.tsx so the approaches
 * can be exercised side by side without changing the shipped route editor.
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

function createStoreState(args: {
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

function reduceStoreState(state: StoreState, action: StoreAction): StoreState {
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

function createMachineState(args: {
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

const routeUrlEditorHandlers: HandlerMap = {
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
function reduceMachineState(state: MachineState, event: MachineEvent): MachineState {
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

function applyStoreActions(state: StoreState, actions: readonly StoreAction[]): StoreState {
  return actions.reduce(reduceStoreState, state);
}

function reduceStoreStateForMachineEvent(state: StoreState, event: MachineEvent): StoreState {
  switch (event.type) {
    case "blur":
      return applyStoreActions(state, [
        { inputFocused: false, type: "setInputFocused" },
        { touchScrollPickerMetrics: null, type: "setTouchScrollPickerMetrics" },
      ]);
    case "draftChanged":
      return applyStoreActions(state, [
        { draftRouteAddress: event.draftRouteAddress, type: "setDraftRouteAddress" },
        {
          nextState: {
            activeIndex: null,
            baseRouteAddress: event.draftRouteAddress,
            dismissed: false,
            draftEditedSinceFocus: true,
            kind: event.kind,
            selectionRouteIndex: event.selectionRouteIndex,
          },
          type: "patchSuggestionState",
        },
      ]);
    case "escapePressed":
      return applyStoreActions(state, [
        { inputFocused: false, type: "setInputFocused" },
        { touchScrollPickerMetrics: null, type: "setTouchScrollPickerMetrics" },
      ]);
    case "focus":
      return applyStoreActions(state, [
        { inputFocused: true, type: "setInputFocused" },
        {
          nextState: {
            activeIndex: null,
            baseRouteAddress: state.draftRouteAddress,
            dismissed: false,
            draftEditedSinceFocus: false,
            kind: "path",
            selectionRouteIndex: event.selectionRouteIndex,
          },
          type: "patchSuggestionState",
        },
      ]);
    case "hashSuggestionsRefreshed":
      return reduceStoreState(state, {
        documentHashSuggestionKeys: event.keys,
        type: "setDocumentHashSuggestionKeys",
      });
    case "historyIndexObserved":
      return reduceStoreState(state, {
        forwardRouteHistoryIndex: event.forwardRouteHistoryIndex,
        type: "setForwardRouteHistoryIndex",
      });
    case "routeRealityChanged":
      return applyStoreActions(state, [
        { draftRouteAddress: event.currentHref, type: "setDraftRouteAddress" },
        {
          nextState: {
            activeIndex: null,
            baseRouteAddress: event.currentHref,
            dismissed: false,
            draftEditedSinceFocus: false,
            kind: "path",
            selectionRouteIndex: state.suggestionState.selectionRouteIndex,
          },
          type: "patchSuggestionState",
        },
      ]);
    case "suggestionHighlighted":
      return reduceStoreState(state, {
        nextState: { activeIndex: event.activeIndex },
        type: "patchSuggestionState",
      });
    case "suggestionPreviewed":
      return applyStoreActions(state, [
        { draftRouteAddress: event.draftRouteAddress, type: "setDraftRouteAddress" },
        {
          nextState: {
            activeIndex: event.activeIndex,
            dismissed: false,
            draftEditedSinceFocus: true,
          },
          type: "patchSuggestionState",
        },
      ]);
    case "suggestionSelected":
      return applyStoreActions(state, [
        { draftRouteAddress: event.draftRouteAddress, type: "setDraftRouteAddress" },
        {
          nextState: {
            activeIndex: null,
            baseRouteAddress: event.draftRouteAddress,
          },
          type: "patchSuggestionState",
        },
      ]);
    case "touchPickerCanceled":
      return reduceStoreState(state, {
        touchScrollPickerMetrics: null,
        type: "setTouchScrollPickerMetrics",
      });
    case "touchPickerCommitted":
      return applyStoreActions(state, [
        { draftRouteAddress: event.draftRouteAddress, type: "setDraftRouteAddress" },
        { touchScrollPickerMetrics: null, type: "setTouchScrollPickerMetrics" },
      ]);
    case "touchPickerPreviewed":
      return reduceStoreState(state, {
        draftRouteAddress: event.draftRouteAddress,
        type: "setDraftRouteAddress",
      });
    case "touchPickerStarted":
      return applyStoreActions(state, [
        { touchScrollPickerEnabled: true, type: "setTouchScrollPickerEnabled" },
        { touchScrollPickerMetrics: event.metrics, type: "setTouchScrollPickerMetrics" },
        {
          nextState: {
            activeIndex: event.activeIndex,
            dismissed: false,
            draftEditedSinceFocus: true,
          },
          type: "patchSuggestionState",
        },
      ]);
  }
  event satisfies never;
  return state;
}

type SendFor<TKind extends MachineStateKind> = (event: EventFor<TKind>) => void;

function renderRouteUrlEditorMermaidTransitions() {
  const lines = ["stateDiagram-v2"];

  for (const [from, byEvent] of Object.entries(routeUrlEditorTransitions)) {
    for (const [event, to] of Object.entries(byEvent)) {
      lines.push(`  ${from} --> ${to}: ${event}`);
    }
  }

  return lines.join("\n");
}

type ResearchPageState = {
  events: readonly MachineEvent[];
  machine: MachineState;
};

type ResearchPageAction =
  | {
      event: MachineEvent;
      type: "send";
    }
  | {
      type: "reset";
    };

const initialResearchPageCurrentHref = "/visual-fixture?mode=route-url-editor";
const initialResearchPageRouteHistoryIndex = 0;
const initialResearchPageMachineState = createMachineState({
  currentHref: initialResearchPageCurrentHref,
  currentRouteHistoryIndex: initialResearchPageRouteHistoryIndex,
});

function replayStoreState(events: readonly MachineEvent[]): StoreState {
  return events.reduce(
    reduceStoreStateForMachineEvent,
    createStoreState({
      currentHref: initialResearchPageCurrentHref,
      currentRouteHistoryIndex: initialResearchPageRouteHistoryIndex,
    }),
  );
}

function createInitialResearchPageState(): ResearchPageState {
  return {
    events: [],
    machine: initialResearchPageMachineState,
  };
}

function reduceResearchPageState(
  state: ResearchPageState,
  action: ResearchPageAction,
): ResearchPageState {
  switch (action.type) {
    case "reset":
      return createInitialResearchPageState();
    case "send":
      return {
        events: [...state.events, action.event],
        machine: reduceMachineState(state.machine, action.event),
      };
  }
  action satisfies never;
  return state;
}

type EventButtonProps<TKind extends MachineStateKind> = {
  children: ReactNode;
  event: EventFor<TKind>;
  send: SendFor<TKind>;
};

function EventButton<TKind extends MachineStateKind>({
  children,
  event,
  send,
}: EventButtonProps<TKind>) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-8 justify-start rounded-none px-2 text-left text-xs"
      onClick={() => send(event)}
    >
      {children}
    </Button>
  );
}

type ControlGroupProps = {
  children: ReactNode;
  label: string;
};

function ControlGroup({ children, label }: ControlGroupProps) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-medium uppercase text-muted-foreground">{label}</h2>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function BlurredControls({ send }: { send: SendFor<"blurred"> }) {
  return (
    <ControlGroup label="Blurred">
      <EventButton event={{ selectionRouteIndex: 0, type: "focus" }} send={send}>
        focus at path start
      </EventButton>
      <EventButton event={{ currentHref: "/machines", type: "routeRealityChanged" }} send={send}>
        route reality to /machines
      </EventButton>
      <EventButton
        event={{ keys: ["setup", "details"], type: "hashSuggestionsRefreshed" }}
        send={send}
      >
        refresh hash keys
      </EventButton>
      <EventButton
        event={{ forwardRouteHistoryIndex: 3, type: "historyIndexObserved" }}
        send={send}
      >
        observe history index 3
      </EventButton>
    </ControlGroup>
  );
}

function FocusedCleanControls({ send }: { send: SendFor<"focused.clean"> }) {
  return (
    <ControlGroup label="Focused Clean">
      <EventButton
        event={{
          draftRouteAddress: "/vault/nicu/noter",
          kind: "path",
          selectionRouteIndex: 17,
          type: "draftChanged",
        }}
        send={send}
      >
        type /vault/nicu/noter
      </EventButton>
      <EventButton event={{ activeIndex: 0, type: "suggestionHighlighted" }} send={send}>
        highlight suggestion 0
      </EventButton>
      <EventButton
        event={{
          activeIndex: 0,
          metrics: {
            bottomSpacerHeightPx: 56,
            slateTopPx: 84,
            topSpacerHeightPx: 56,
          },
          type: "touchPickerStarted",
        }}
        send={send}
      >
        start touch picker
      </EventButton>
      <EventButton event={{ type: "blur" }} send={send}>
        blur
      </EventButton>
    </ControlGroup>
  );
}

function FocusedEditingControls({ send }: { send: SendFor<"focused.editing"> }) {
  return (
    <ControlGroup label="Focused Editing">
      <EventButton
        event={{
          draftRouteAddress: "/logo",
          kind: "path",
          selectionRouteIndex: 5,
          type: "draftChanged",
        }}
        send={send}
      >
        type /logo
      </EventButton>
      <EventButton event={{ activeIndex: 0, type: "suggestionHighlighted" }} send={send}>
        highlight suggestion 0
      </EventButton>
      <EventButton
        event={{
          activeIndex: 0,
          draftRouteAddress: "/logo",
          previewBaseHref: "/visual-fixture?mode=route-url-editor",
          type: "suggestionPreviewed",
        }}
        send={send}
      >
        preview /logo
      </EventButton>
      <EventButton
        event={{
          draftRouteAddress: "/logo?from=route-url-editor",
          type: "suggestionSelected",
        }}
        send={send}
      >
        select route-search suggestion
      </EventButton>
      <EventButton
        event={{
          activeIndex: 1,
          metrics: {
            bottomSpacerHeightPx: 72,
            slateTopPx: 112,
            topSpacerHeightPx: 72,
          },
          type: "touchPickerStarted",
        }}
        send={send}
      >
        start touch picker
      </EventButton>
      <EventButton event={{ type: "escapePressed" }} send={send}>
        escape
      </EventButton>
      <EventButton event={{ type: "blur" }} send={send}>
        blur
      </EventButton>
    </ControlGroup>
  );
}

function FocusedPreviewingControls({ send }: { send: SendFor<"focused.previewing"> }) {
  return (
    <ControlGroup label="Focused Previewing">
      <EventButton
        event={{
          draftRouteAddress: "/logo?from=route-url-editor",
          type: "suggestionSelected",
        }}
        send={send}
      >
        commit selected suggestion
      </EventButton>
      <EventButton
        event={{
          draftRouteAddress: "/logo/raster",
          kind: "path",
          selectionRouteIndex: 12,
          type: "draftChanged",
        }}
        send={send}
      >
        edit preview draft
      </EventButton>
      <EventButton event={{ type: "escapePressed" }} send={send}>
        escape to editing
      </EventButton>
      <EventButton event={{ type: "blur" }} send={send}>
        blur
      </EventButton>
    </ControlGroup>
  );
}

function FocusedTouchPickingControls({ send }: { send: SendFor<"focused.touchPicking"> }) {
  return (
    <ControlGroup label="Focused Touch Picking">
      <EventButton
        event={{ draftRouteAddress: "/pricing", type: "touchPickerPreviewed" }}
        send={send}
      >
        touch preview /pricing
      </EventButton>
      <EventButton
        event={{
          draftRouteAddress: "/pricing",
          previewBaseHref: "/visual-fixture?mode=route-url-editor",
          type: "touchPickerCommitted",
        }}
        send={send}
      >
        commit touch preview
      </EventButton>
      <EventButton event={{ type: "touchPickerCanceled" }} send={send}>
        cancel picker
      </EventButton>
      <EventButton event={{ type: "escapePressed" }} send={send}>
        escape
      </EventButton>
      <EventButton event={{ type: "blur" }} send={send}>
        blur
      </EventButton>
    </ControlGroup>
  );
}

function StateSpecificControls({
  send,
  state,
}: {
  send: (event: MachineEvent) => void;
  state: MachineState;
}) {
  switch (state.kind) {
    case "blurred":
      return <BlurredControls send={send} />;
    case "focused.clean":
      return <FocusedCleanControls send={send} />;
    case "focused.editing":
      return <FocusedEditingControls send={send} />;
    case "focused.previewing":
      return <FocusedPreviewingControls send={send} />;
    case "focused.touchPicking":
      return <FocusedTouchPickingControls send={send} />;
  }
  state satisfies never;
  return null;
}

function getStatePillClassName(state: MachineState): string {
  switch (state.kind) {
    case "blurred":
      return "border-muted-foreground/30 bg-muted px-2 py-1 text-xs text-muted-foreground";
    case "focused.clean":
      return "border-emerald-600/30 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "focused.editing":
      return "border-blue-600/30 bg-blue-50 px-2 py-1 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100";
    case "focused.previewing":
      return "border-amber-600/30 bg-amber-50 px-2 py-1 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100";
    case "focused.touchPicking":
      return "border-pink-600/30 bg-pink-50 px-2 py-1 text-xs text-pink-950 dark:bg-pink-950 dark:text-pink-100";
  }
  state satisfies never;
  return "border-muted-foreground/30 bg-muted px-2 py-1 text-xs text-muted-foreground";
}

function readRouteUrlEditorResearchDraft(state: MachineState): string {
  switch (state.kind) {
    case "blurred":
    case "focused.clean":
    case "focused.editing":
    case "focused.previewing":
    case "focused.touchPicking":
      return state.draftRouteAddress;
  }
  state satisfies never;
  return "";
}

function readRouteUrlEditorResearchCurrentHref(state: MachineState): string {
  switch (state.kind) {
    case "blurred":
    case "focused.clean":
    case "focused.editing":
    case "focused.previewing":
    case "focused.touchPicking":
      return state.currentHref;
  }
  state satisfies never;
  return "";
}

function readResearchActiveIndex(state: MachineState): number | null {
  switch (state.kind) {
    case "blurred":
      return null;
    case "focused.clean":
    case "focused.editing":
      return state.suggestion.activeIndex;
    case "focused.previewing":
    case "focused.touchPicking":
      return state.suggestion.activeIndex;
  }
  state satisfies never;
  return null;
}

function RouteUrlEditorResearchSurface({ state }: { state: MachineState }) {
  const draft = readRouteUrlEditorResearchDraft(state);
  const currentHref = readRouteUrlEditorResearchCurrentHref(state);
  const activeIndex = readResearchActiveIndex(state);
  const inputClassName =
    state.kind === "blurred"
      ? "flex min-h-8 min-w-0 flex-1 items-center bg-muted px-2 font-mono text-base leading-8 text-muted-foreground"
      : "flex min-h-8 min-w-0 flex-1 items-center bg-background px-2 font-mono text-base leading-8 text-foreground ring-1 ring-ring";

  return (
    <section className="grid gap-3" data-testid="route-url-editor-state-machine-surface">
      <div className="flex min-w-0 items-center gap-2 border bg-background p-2">
        <span className={getStatePillClassName(state)}>{state.kind}</span>
        <div className={inputClassName}>
          <span className="shrink-0 text-muted-foreground">http://localhost:43120</span>
          <span className="min-w-0 truncate">{draft}</span>
        </div>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <div className="font-mono">current: {currentHref}</div>
        <div className="font-mono">
          active suggestion: {activeIndex === null ? "none" : activeIndex}
        </div>
      </div>
      {state.kind === "focused.touchPicking" ? (
        <div className="border bg-muted p-2 text-xs text-muted-foreground">
          touch slate top {state.touchScrollPickerMetrics.slateTopPx}px, pending preview{" "}
          {state.pendingPreviewDraftRouteAddress ?? "none"}
        </div>
      ) : null}
    </section>
  );
}

export function RouteUrlEditorStateMachineResearchPage() {
  const [pageState, dispatchPage] = useReducer(
    reduceResearchPageState,
    undefined,
    createInitialResearchPageState,
  );
  const formattedMachineState = useMemo(
    () => JSON.stringify(pageState.machine, null, 2),
    [pageState.machine],
  );
  const formattedStoreState = useMemo(
    () => JSON.stringify(replayStoreState(pageState.events), null, 2),
    [pageState.events],
  );
  const formattedEvents = useMemo(
    () => JSON.stringify(pageState.events, null, 2),
    [pageState.events],
  );
  const mermaidTransitions = useMemo(renderRouteUrlEditorMermaidTransitions, []);
  const send = (event: MachineEvent) => {
    dispatchPage({ event, type: "send" });
  };

  const controlsContent = (
    <div className="grid gap-4 p-3">
      <Button
        type="button"
        variant="outline"
        className="h-8 rounded-none"
        onClick={() => dispatchPage({ type: "reset" })}
      >
        Reset
      </Button>
      <StateSpecificControls send={send} state={pageState.machine} />
    </div>
  );

  return (
    <main className="grid min-h-screen gap-4 bg-background p-4 text-foreground lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="min-w-0 border bg-background">{controlsContent}</aside>
      <div className="grid min-w-0 gap-4">
        <RouteUrlEditorResearchSurface state={pageState.machine} />
        <Textarea
          readOnly
          value={formattedMachineState}
          data-testid="route-url-editor-state-machine-json"
          className="min-h-80 resize-y rounded-none font-mono text-sm"
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Textarea
            readOnly
            value={formattedStoreState}
            aria-label="Current store-shaped replay state"
            data-testid="route-url-editor-state-machine-store-json"
            className="min-h-64 resize-y rounded-none font-mono text-sm"
          />
          <Textarea
            readOnly
            value={formattedEvents}
            data-testid="route-url-editor-state-machine-events"
            className="min-h-64 resize-y rounded-none font-mono text-sm"
          />
          <Textarea
            readOnly
            value={mermaidTransitions}
            data-testid="route-url-editor-state-machine-mermaid"
            className="min-h-64 resize-y rounded-none font-mono text-sm"
          />
        </div>
      </div>
    </main>
  );
}
