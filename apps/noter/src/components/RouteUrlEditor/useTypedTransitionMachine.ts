import { useCallback, useEffect, useMemo } from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { runTransition } from "./typedTransitionTable";
import type {
  TypedTransitionAction,
  TypedTransitionEvent,
  TypedTransitionState,
  TypedTransitionTable,
} from "./typedTransitionTable";

export function useTypedTransitionMachine<
  StateKind extends string,
  EventType extends string,
  ActionBrand extends string,
  State extends TypedTransitionState<StateKind>,
  Event extends TypedTransitionEvent<EventType>,
  Action extends TypedTransitionAction<ActionBrand>,
>({
  initialState,
  transitionTable,
  runActions,
  onDebugEvent,
  onDebugStateChange,
}: {
  initialState: State;
  transitionTable: TypedTransitionTable<StateKind, EventType, State, Event, Action>;
  runActions: (actions: Action[]) => void;
  onDebugEvent?: (event: Event) => void;
  onDebugStateChange?: (state: State) => void;
}) {
  const store = useCreateStore<State>(initialState);
  const state = useSelector(store);

  useEffect(() => {
    onDebugStateChange?.(state);
  }, [state, onDebugStateChange]);

  const sendEvent = useCallback(
    (event: Event) => {
      onDebugEvent?.(event);
      let transitionActions: Action[] = [];

      store.setState((prev) => {
        const next = runTransition(transitionTable, prev, event);
        transitionActions = next.actions;

        return next.state;
      });

      runActions(transitionActions);
    },
    [onDebugEvent, runActions, store, transitionTable],
  );

  return useMemo(
    () => ({
      sendEvent,
      state,
    }),
    [sendEvent, state],
  );
}
