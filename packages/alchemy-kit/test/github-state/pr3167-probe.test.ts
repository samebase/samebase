// Trial probes of alchemy PR 3167 (StateEncryption) against makeBucketState and the kit. Not for
// merge: each test records what the PR build does today.
import { encodeState, type PersistedState, StateStoreError } from "alchemy/State";
import { type BucketObjects, makeBucketState } from "alchemy/State/BucketState";
import { passphraseEncryption } from "alchemy/State/PassphraseEncryption";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { blobSha } from "../../src/github-state/git.ts";
import { KIT_0_2_2_PATH, KIT_0_2_2_RECORD } from "./kit-0.2.2-record.ts";

/** An in-memory bucket. `failReads` fails that many next reads; `readOnly` fails every write. */
const memoryBucket = () => {
  const files = new Map<string, string>();
  const writes: string[] = [];
  const control = { failReads: 0, readOnly: false, writes };
  const objects: BucketObjects = {
    listKeys: (prefix) => Effect.sync(() => [...files.keys()].filter((k) => k.startsWith(prefix))),
    listChildren: (prefix) =>
      Effect.sync(() => {
        const children = new Set<string>();
        for (const key of files.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const slash = rest.indexOf("/");
          if (slash > 0) children.add(rest.slice(0, slash));
        }
        return [...children];
      }),
    read: (key) =>
      Effect.suspend(() => {
        if (control.failReads > 0) {
          control.failReads--;
          return Effect.fail(new StateStoreError({ message: `transient read failure of ${key}` }));
        }
        const text = files.get(key);
        return Effect.succeed(text === undefined ? undefined : { text, version: blobSha(text) });
      }),
    write: (key, body, condition) =>
      Effect.suspend(() => {
        if (control.readOnly) {
          return Effect.fail(new StateStoreError({ message: `403 read-only: ${key}` }));
        }
        const current = files.get(key);
        if (condition !== undefined) {
          const holds =
            "ifAbsent" in condition
              ? current === undefined
              : current !== undefined && blobSha(current) === condition.ifVersion;
          if (!holds) return Effect.succeed(undefined);
        }
        files.set(key, body);
        control.writes.push(key);
        return Effect.succeed(blobSha(body));
      }),
    delete: (key) => Effect.sync(() => void files.delete(key)),
    deleteMany: (keys) => Effect.sync(() => keys.forEach((key) => files.delete(key))),
  };
  return { files, control, objects };
};

const PROD = { stack: "app", stage: "prod" };
const ROW = {
  kind: "resource",
  resourceType: "Random",
  namespace: undefined,
  fqn: "Secret",
  logicalId: "Secret",
  instanceId: "instance-1",
  providerVersion: 1,
  status: "created",
  downstream: [],
  bindings: [],
  props: {},
  attr: { text: Redacted.make("the-random-value") },
} satisfies PersistedState;
const OTHER = {
  ...ROW,
  fqn: "Token",
  logicalId: "Token",
  attr: { text: Redacted.make("api-token") },
};

const passphrase = (text: string) => passphraseEncryption({ passphrase: Redacted.make(text) });

/** One process on `objects`, with `encryption` (or none) in the store's context. */
const bucketProcess = <A, E>(
  objects: BucketObjects,
  encryption: ReturnType<typeof passphrase> | undefined,
  use: (store: Effect.Success<ReturnType<typeof makeBucketState>>) => Effect.Effect<A, E>,
) => {
  const program = makeBucketState({
    id: "memory",
    label: "memory",
    objects: Effect.succeed(objects),
  }).pipe(Effect.flatMap(use), Effect.scoped, Effect.provide(SecureRandom.layerWebCrypto));
  return Effect.runPromise(
    encryption === undefined ? program : program.pipe(Effect.provide(encryption)),
  );
};

describe("PR 3167 probes on makeBucketState", () => {
  it("P1: a transient failure of the first format read fails every later operation", async () => {
    const bucket = memoryBucket();
    const result = await bucketProcess(bucket.objects, undefined, (store) =>
      Effect.gen(function* () {
        bucket.control.failReads = 1;
        const first = yield* Effect.flip(store.listStacks());
        const second = yield* Effect.result(store.listStacks());
        return { first: first.message, second };
      }),
    );
    expect(result.first).toContain("transient read failure");
    // Records what happens: is the failed format read cached for the store's life?
    console.log("P1 second listStacks:", JSON.stringify(result.second));
  });

  it("P2: a stage's sealed secrets can be swapped between records without an error", async () => {
    const bucket = memoryBucket();
    await bucketProcess(bucket.objects, passphrase("pw"), (store) =>
      Effect.gen(function* () {
        yield* store.set({ ...PROD, fqn: ROW.fqn, value: ROW });
        yield* store.set({ ...PROD, fqn: OTHER.fqn, value: OTHER });
      }),
    );
    const a = bucket.files.get("app/prod/Secret.json") ?? "";
    const b = bucket.files.get("app/prod/Token.json") ?? "";
    console.log("P2 sealed record:\n" + a);
    // Put record Token's file at record Secret's path: same stage, same data key header.
    bucket.files.set("app/prod/Secret.json", b);
    const read = await bucketProcess(bucket.objects, passphrase("pw"), (store) =>
      store.get({ ...PROD, fqn: ROW.fqn }),
    );
    expect(encodeState(read)).toMatchObject({ attr: { text: { __redacted__: "api-token" } } });
  });

  it("P3: a record kit 0.2.2 sealed, read by the PR's sealing codec without the kit", async () => {
    const bucket = memoryBucket();
    bucket.files.set(KIT_0_2_2_PATH, KIT_0_2_2_RECORD);
    const read = await bucketProcess(bucket.objects, passphrase("pw"), (store) =>
      store.get({ stack: "owner/name", stage: "prod", fqn: "Convex/Project" }),
    );
    const after = bucket.files.get(KIT_0_2_2_PATH) ?? "";
    console.log("P3 decoded:", JSON.stringify(encodeState(read)));
    console.log("P3 file after the read:\n" + after);
    expect(encodeState(read)).toMatchObject({
      attr: { deployKey: { __redacted__: { __sealed__: expect.stringMatching(/^v1\./) } } },
    });
    expect(after.startsWith("alchemy:sealed:1:passphrase:")).toBe(true);
  });

  it("P4: a get through BucketState rewrites a stale record (plaintext secret) under encryption", async () => {
    const bucket = memoryBucket();
    bucket.files.set("app/prod/Secret.json", JSON.stringify(encodeState(ROW), null, 2));
    await bucketProcess(bucket.objects, passphrase("pw"), (store) =>
      store.get({ ...PROD, fqn: ROW.fqn }),
    );
    console.log("P4 writes:", bucket.control.writes);
    expect(bucket.control.writes).toContain("app/prod/Secret.json");
    expect(bucket.control.writes).toContain("__alchemy_store__.json");
  });

  it("P5: a wrong passphrase", async () => {
    const bucket = memoryBucket();
    await bucketProcess(bucket.objects, passphrase("pw"), (store) =>
      store.set({ ...PROD, fqn: ROW.fqn, value: ROW }),
    );
    const error = await bucketProcess(bucket.objects, passphrase("other"), (store) =>
      Effect.flip(store.get({ ...PROD, fqn: ROW.fqn })),
    );
    console.log("P5:", error.message);
    expect(error.message).toContain("wrong passphrase");
  });
});
