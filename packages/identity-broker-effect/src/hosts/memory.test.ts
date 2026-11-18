import { Effect } from "effect";
import { expect, test } from "vite-plus/test";
import { Store } from "../store/Store.ts";
import { Tx, unique } from "../store/Tx.ts";
import { makeMemoryStore } from "./memory.ts";

test("a seeded row is read back by its unique index, and a step clock is settable", () => {
  const hub = makeMemoryStore({ now: 1_000 });
  hub.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      yield* tx.insert("apps", { appId: "gh-1-a", name: "gh-1-a", tenantId: "gh-1", createdAt: 5 });
    }),
  );
  const row = hub.withTx(unique("apps", "by_app_id", ["gh-1-a"]));
  expect(row?.doc).toEqual({ appId: "gh-1-a", name: "gh-1-a", tenantId: "gh-1", createdAt: 5 });
  hub.setNow(2_000);
  expect(hub.now()).toBe(2_000);
  const program = Effect.gen(function* () {
    const store = yield* Store;
    return yield* store.run("authRequests.abandon", { requestId: "missing" });
  });
  expect(Effect.runSync(program.pipe(Effect.provide(hub.layer)))).toBeNull();
});
