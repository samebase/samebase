import { describe, expect, it } from "vite-plus/test";
import { keepState, runTransition, runTransitionActions } from "./typedTransitionTable";
import type {
  TypedTransitionActionHandlerTable,
  TypedTransitionTable,
} from "./typedTransitionTable";

type TestState =
  | {
      kind: "blurred";
      path: string;
    }
  | {
      kind: "focused";
      latestPath: string;
    };

type TestEvent =
  | {
      type: "changedInput";
      path: string;
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
      context: {
        prefix: string;
      };
    };

const testTransitionTable: TypedTransitionTable<
  TestState["kind"],
  TestEvent["type"],
  TestState,
  TestEvent,
  TestAction
> = {
  blurred: {
    changedInput: (prev, event) =>
      keepState({
        ...prev,
        path: event.path,
      }),
    pressedEscape: (prev) => ({
      actions: [{ brand: "blurInput" }],
      state: prev,
    }),
  },
  focused: {
    changedInput: (prev, event) =>
      keepState({
        ...prev,
        latestPath: event.path,
      }),
    pressedEscape: () => ({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        path: "/before-focus",
      },
    }),
  },
};

describe("typedTransitionTable", () => {
  it("runs the handler for the current state and event", () => {
    const result = runTransition(
      testTransitionTable,
      {
        kind: "focused",
        latestPath: "/vault",
      },
      {
        path: "/logo",
        type: "changedInput",
      },
    );

    expect(result).toEqual({
      actions: [],
      state: {
        kind: "focused",
        latestPath: "/logo",
      },
    });
  });

  it("returns transition actions with the next state", () => {
    const result = runTransition(
      testTransitionTable,
      {
        kind: "focused",
        latestPath: "/vault",
      },
      {
        type: "pressedEscape",
      },
    );

    expect(result).toEqual({
      actions: [{ brand: "blurInput" }],
      state: {
        kind: "blurred",
        path: "/before-focus",
      },
    });
  });

  it("keeps state when the current state does not define the event", () => {
    const partialTransitionTable: TypedTransitionTable<
      TestState["kind"],
      TestEvent["type"],
      TestState,
      TestEvent,
      TestAction
    > = {
      blurred: {},
      focused: {
        pressedEscape: () => ({
          actions: [{ brand: "blurInput" }],
          state: {
            kind: "blurred",
            path: "/before-focus",
          },
        }),
      },
    };

    const state = {
      kind: "focused",
      latestPath: "/vault",
    } as const;

    expect(
      runTransition(partialTransitionTable, state, {
        path: "/logo",
        type: "changedInput",
      }),
    ).toEqual({
      actions: [],
      state,
    });
  });

  it("runs handlers for action brands", () => {
    const handledActions: string[] = [];
    const handlers: TypedTransitionActionHandlerTable<TestAction["brand"], TestAction> = {
      announce: (action) => {
        handledActions.push(`${action.context.prefix}: ${action.message}`);
      },
      blurInput: () => {
        handledActions.push("blurred");
      },
    };

    runTransitionActions(handlers, [
      {
        brand: "blurInput",
      },
      {
        brand: "announce",
        message: "Route selected",
        context: {
          prefix: "action",
        },
      },
    ]);

    expect(handledActions).toEqual(["blurred", "action: Route selected"]);
  });
});
