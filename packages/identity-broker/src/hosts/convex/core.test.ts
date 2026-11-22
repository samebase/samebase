/// <reference types="vite-plus/client" />
// The core's sign-in tests that need no synchronous step, on the Convex store under convex-test:
// each `createBroker` gets a fresh convex-test backend whose app is the component's functions, and
// its Store is the hub's (`convexStore`), one call of the command's own function. The step clock
// is the test clock, through Effect's `Clock`. The other test files of src/core/sqlite.test.ts read
// and seed rows in a synchronous step (`run`, `withTx`, `db.contents`), which a Convex
// transaction cannot give, so they are not here.
import { convexTest } from "convex-test";
import { Effect } from "effect";
import { useTestStore } from "../../core/testing/harness.ts";
import { microtaskScheduler } from "../../store/Store.ts";
import { api } from "./component/_generated/api.ts";
import schema from "./component/schema.ts";
import { convexStore } from "./hub.ts";
import { commandFunctions } from "./references.ts";
import { convexTx } from "./tx.ts";

const modules = import.meta.glob("./component/**/*.ts");

const synchronous = (name: string) => () => {
  throw new Error(`${name} is a synchronous step, which the Convex store has not`);
};

useTestStore(() => {
  const t = convexTest(schema, modules);
  return {
    store: convexStore({ runQuery: t.query, runMutation: t.mutation }, commandFunctions(api)),
    seed: (body) =>
      t.run((ctx) =>
        Effect.runPromise(
          body(
            // @ts-expect-error convex-test types `ctx.db` with the data model of the component's
            // schema, whose tables come from a string-keyed record. At run time it is the writer
            // that `mutationGeneric` gives a command as `GenericDatabaseWriter<GenericDataModel>`.
            convexTx(ctx.db),
          ),
          { scheduler: microtaskScheduler() },
        ),
      ),
    setNow: () => undefined,
    run: synchronous("run"),
    withTx: synchronous("withTx"),
    db: { contents: synchronous("db.contents") },
  };
});

await import("../../core/conformance.test.ts");
await import("../../core/sentinels.test.ts");
