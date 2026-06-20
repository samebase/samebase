import { expectType } from "@noter-md/dependent";
import type {
  TypedTransitionActionHandlerTable,
  TypedTransitionAction,
  TypedTransitionTable,
} from "./typedTransitionTable";

type TestSelection = {
  start: number;
  end: number;
};

type TestState =
  | {
      kind: "blurred";
      path: string;
    }
  | {
      kind: "focused";
      initialPath: string;
      latestPath: string;
      selection: TestSelection;
    };

type TestEvent =
  | {
      type: "changedInput";
      path: string;
      selection: TestSelection;
    }
  | {
      type: "changedSelection";
      selection: TestSelection;
    }
  | {
      type: "pressedEscape";
    };

type TestAction =
  | {
      brand: "blurInput";
    }
  | {
      brand: "announce";
      message: string;
    };

expectType<TypedTransitionAction<"blurInput">>()({ brand: "blurInput" } as const, true);

const transitionTable = {
  blurred: {
    changedInput: (prev, event) => {
      expectType<Extract<TestState, { kind: "blurred" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "changedInput" }>>()(event, true);

      return {
        actions: [],
        state: {
          ...prev,
          path: event.path,
        },
      };
    },
    changedSelection: (prev, event) => {
      expectType<Extract<TestState, { kind: "blurred" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "changedSelection" }>>()(event, true);

      // @ts-expect-error changedSelection events do not carry path.
      void event.path;

      return {
        actions: [],
        state: prev,
      };
    },
    pressedEscape: (prev, event) => {
      expectType<Extract<TestState, { kind: "blurred" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "pressedEscape" }>>()(event, true);

      // @ts-expect-error blurred state does not carry focused selection.
      void prev.selection;

      return {
        actions: [{ brand: "blurInput" }],
        state: prev,
      };
    },
  },
  focused: {
    changedInput: (prev, event) => {
      expectType<Extract<TestState, { kind: "focused" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "changedInput" }>>()(event, true);

      return {
        actions: [],
        state: {
          ...prev,
          latestPath: event.path,
          selection: event.selection,
        },
      };
    },
    changedSelection: (prev, event) => {
      expectType<Extract<TestState, { kind: "focused" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "changedSelection" }>>()(event, true);

      return {
        actions: [],
        state: {
          ...prev,
          selection: event.selection,
        },
      };
    },
    pressedEscape: (prev, event) => {
      expectType<Extract<TestState, { kind: "focused" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "pressedEscape" }>>()(event, true);

      return {
        actions: [{ brand: "blurInput" }],
        state: {
          kind: "blurred",
          path: prev.initialPath,
        },
      };
    },
  },
} satisfies TypedTransitionTable<
  TestState["kind"],
  TestEvent["type"],
  TestState,
  TestEvent,
  TestAction
>;

const assignedTransitionTable: TypedTransitionTable<
  TestState["kind"],
  TestEvent["type"],
  TestState,
  TestEvent,
  TestAction
> = transitionTable;

const partialTransitionTable = {
  blurred: {
    changedInput: (prev, event) => {
      expectType<Extract<TestState, { kind: "blurred" }>>()(prev, true);
      expectType<Extract<TestEvent, { type: "changedInput" }>>()(event, true);

      // @ts-expect-error changedInput events do not carry pressedEscape-only state.
      void event.reason;

      return {
        actions: [],
        state: {
          ...prev,
          path: event.path,
        },
      };
    },
  },
  focused: transitionTable.focused,
} satisfies TypedTransitionTable<
  TestState["kind"],
  TestEvent["type"],
  TestState,
  TestEvent,
  TestAction
>;

void assignedTransitionTable;
void partialTransitionTable;

const actionHandlers = {
  announce: (action) => {
    expectType<Extract<TestAction, { brand: "announce" }>>()(action, true);

    return action.message;
  },
  blurInput: (action) => {
    expectType<Extract<TestAction, { brand: "blurInput" }>>()(action, true);

    // @ts-expect-error blurInput actions do not carry message.
    void action.message;
  },
} satisfies TypedTransitionActionHandlerTable<TestAction["brand"], TestAction>;

const assignedActionHandlers: TypedTransitionActionHandlerTable<TestAction["brand"], TestAction> =
  actionHandlers;

const missingActionHandlers = {
  announce: (action) => action.message,
  // @ts-expect-error every action brand must define a handler.
} satisfies TypedTransitionActionHandlerTable<TestAction["brand"], TestAction>;

void assignedActionHandlers;
void missingActionHandlers;
