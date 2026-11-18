import { Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { rules, Tx } from "./probeRules.ts";

const memoryTx = () => {
  const values = new Map<string, number>();
  return Tx.of({
    get: (key) => Effect.sync(() => values.get(key)),
    put: (key, value) =>
      Effect.sync(() => {
        values.set(key, value);
      }),
  });
};

test("increment counts from 1 in one store", () => {
  const tx = memoryTx();
  const increment = rules.increment({ key: "counter" }).pipe(Effect.provideService(Tx, tx));
  expect([Effect.runSync(increment), Effect.runSync(increment)]).toEqual([1, 2]);
});
