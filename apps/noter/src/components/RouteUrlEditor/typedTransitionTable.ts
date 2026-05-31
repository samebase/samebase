export type TypedTransitionState<StateKind extends string> = {
  kind: StateKind;
};

export type TypedTransitionEvent<EventType extends string> = {
  type: EventType;
};

export type TypedTransitionAction<ActionBrand extends string> = {
  brand: ActionBrand;
};

export type TypedTransitionResult<State, Action extends TypedTransitionAction<string>> = {
  state: State;
  actions: Action[];
};

export type TypedTransitionTable<
  StateKind extends string,
  EventType extends string,
  State extends TypedTransitionState<StateKind>,
  Event extends TypedTransitionEvent<EventType>,
  Result,
> = {
  [Kind in StateKind]: {
    [Type in EventType]: (
      prev: Extract<State, { kind: Kind }>,
      event: Extract<Event, { type: Type }>,
    ) => Result;
  };
};

export type TypedTransitionActionHandlerTable<
  ActionBrand extends string,
  Action extends TypedTransitionAction<ActionBrand>,
> = {
  [Brand in ActionBrand]: (action: Extract<Action, { brand: Brand }>) => void;
};

export function keepState<State, Action extends TypedTransitionAction<string> = never>(
  state: State,
): TypedTransitionResult<State, Action> {
  return {
    actions: [],
    state,
  };
}

export function runTransition<
  StateKind extends string,
  EventType extends string,
  State extends TypedTransitionState<StateKind>,
  Event extends TypedTransitionEvent<EventType>,
  Result,
>(
  table: TypedTransitionTable<StateKind, EventType, State, Event, Result>,
  prev: State,
  event: Event,
): Result {
  const handler = table[prev.kind][event.type];

  // @ts-expect-error TypeScript cannot preserve the runtime correlation between
  // state.kind, event.type, and the selected table cell. The table type checks
  // every concrete cell, so this is the single generic dispatch boundary.
  return handler(prev, event);
}

export function runTransitionActions<
  ActionBrand extends string,
  Action extends TypedTransitionAction<ActionBrand>,
>(handlers: TypedTransitionActionHandlerTable<ActionBrand, Action>, actions: Action[]) {
  for (const action of actions) {
    const handler = handlers[action.brand];

    // @ts-expect-error TypeScript cannot preserve the runtime correlation between
    // action.brand and the selected handler. The handler table type checks every
    // concrete action brand, so this is the single generic action dispatch boundary.
    handler(action);
  }
}
