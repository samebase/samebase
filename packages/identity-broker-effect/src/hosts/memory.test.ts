import { Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { Store } from "../store/Store.ts";
import { unique } from "../store/Tx.ts";
import { makeMemoryStore } from "./memory.ts";

test("a seeded row is read back by its unique index, and a step clock is settable", () => {
  const hub = makeMemoryStore({ now: 1_000 });
  hub.withTx((tx) => tx.insert("stops", { key: "test:1", at: 5 }));
  const row = hub.withTx((tx) => unique(tx, "stops", "by_key", ["test:1"]));
  expect(row?.doc).toEqual({ key: "test:1", at: 5 });
  hub.setNow(2_000);
  expect(hub.now()).toBe(2_000);
  const program = Effect.gen(function* () {
    const store = yield* Store;
    return yield* store.run("authRequests.abandon", { requestId: "missing" });
  });
  expect(Effect.runSync(program.pipe(Effect.provide(hub.layer)))).toBeNull();
});
