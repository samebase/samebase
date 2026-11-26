// The store functions of src/store/convex and its alchemyState component in convex-test.
import {
  type CreatedResourceState,
  encodeState,
  type ReplacedResourceState,
  type StateService,
} from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vitest";
import { storeState } from "../src/State.ts";
import { components, internal } from "../src/store/convex/_generated/api.js";
import { resourceAad, stateKeyName } from "../src/store/convex/sealing.ts";
import { STORE_VERSION } from "../src/store/convex/version.ts";
import { parseKeyRing, sealSecret } from "../src/store/sealedSecret.ts";
import { addKey, functionApiOf, storeTest, withKey } from "./storeTest.ts";

const main = { stack: "samebase/app", stage: "main" };
const preview = { stack: "samebase/app", stage: "pr-1" };

describe("the state store", () => {
  it("answers its wire version", async () => {
    const t = storeTest();
    expect(await t.query(internal.state.version, {})).toBe(STORE_VERSION);
  });

  it("does not read a row of store version 3, which sits in a root table", async () => {
    const t = storeTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("resources", { ...main, fqn: "Project", value: "{}" });
      await ctx.db.insert("outputs", { ...main, value: '{"url":"u"}' });
    });
    expect(await t.query(internal.state.stacks, {})).toEqual([]);
    expect(await t.query(internal.state.getOutput, main)).toBeNull();
    await t.mutation(internal.state.set, { ...main, fqn: "Project", value: "{}" });
    expect(await t.query(internal.state.stacks, {})).toEqual(["samebase/app"]);
  });

  it("lists stacks and stages in index order, one row for each resource", async () => {
    const t = storeTest();
    await t.mutation(internal.state.set, { ...preview, fqn: "B", value: "{}" });
    await t.mutation(internal.state.set, { ...main, fqn: "B", value: "{}" });
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.mutation(internal.state.set, {
      stack: "samebase/other",
      stage: "main",
      fqn: "A",
      value: "{}",
    });
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: '{"status":"created"}' });

    expect(await t.query(internal.state.stacks, {})).toEqual(["samebase/app", "samebase/other"]);
    expect(await t.query(internal.state.stages, { stack: "samebase/app" })).toEqual([
      "main",
      "pr-1",
    ]);
    expect(await t.query(internal.state.list, main)).toEqual(["A", "B"]);
    expect(await t.query(internal.state.get, { ...main, fqn: "A" })).toBe('{"status":"created"}');
    expect(await t.query(internal.state.get, { ...main, fqn: "C" })).toBeNull();
  });

  it("lists a stage and its stack from an output alone", async () => {
    const t = storeTest();
    await t.mutation(internal.state.setOutput, {
      stack: "samebase/empty",
      stage: "main",
      value: "{}",
    });
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.mutation(internal.state.setOutput, { ...preview, value: "{}" });
    expect(await t.query(internal.state.stacks, {})).toEqual(["samebase/app", "samebase/empty"]);
    expect(await t.query(internal.state.stages, { stack: "samebase/app" })).toEqual([
      "main",
      "pr-1",
    ]);
    expect(await t.query(internal.state.stages, { stack: "samebase/empty" })).toEqual(["main"]);
    await t.mutation(internal.state.removeStack, { stack: "samebase/empty" });
    expect(await t.query(internal.state.stacks, {})).toEqual(["samebase/app"]);
  });

  it("returns only the rows with status replaced", async () => {
    const t = storeTest();
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: '{"status":"replaced"}' });
    await t.mutation(internal.state.set, { ...main, fqn: "B", value: '{"status":"created"}' });
    await t.mutation(internal.state.set, { ...main, fqn: "C", value: '"replaced"' });
    expect(await t.query(internal.state.replaced, main)).toEqual(['{"status":"replaced"}']);
  });

  it("removes a row, a stage with its output, or a whole stack", async () => {
    const t = storeTest();
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.mutation(internal.state.set, { ...main, fqn: "B", value: "{}" });
    await t.mutation(internal.state.set, { ...preview, fqn: "A", value: "{}" });
    await t.mutation(internal.state.setOutput, { ...main, value: '{"url":"u"}' });
    await t.mutation(internal.state.setOutput, { ...preview, value: '{"url":"p"}' });
    await t.mutation(internal.state.setOutput, { ...preview, value: '{"url":"q"}' });
    expect(await t.query(internal.state.getOutput, preview)).toBe('{"url":"q"}');

    await t.mutation(internal.state.remove, { ...main, fqn: "B" });
    expect(await t.query(internal.state.list, main)).toEqual(["A"]);
    await t.mutation(internal.state.removeStack, preview);
    expect(await t.query(internal.state.stages, { stack: "samebase/app" })).toEqual(["main"]);
    expect(await t.query(internal.state.getOutput, preview)).toBeNull();
    expect(await t.query(internal.state.getOutput, main)).toBe('{"url":"u"}');
    await t.mutation(internal.state.removeStack, { stack: "samebase/app" });
    expect(await t.query(internal.state.stacks, {})).toEqual([]);
    expect(await t.query(internal.state.getOutput, main)).toBeNull();
  });

  it("reads every stage of a stack in one call, in stage and fqn order", async () => {
    const t = storeTest();
    expect(await t.query(internal.state.readStack, { stack: "samebase/app" })).toEqual({
      stages: [],
    });
    await t.mutation(internal.state.set, { ...preview, fqn: "B", value: '{"b":1}' });
    await t.mutation(internal.state.set, { ...main, fqn: "B", value: '{"b":0}' });
    await t.mutation(internal.state.set, { ...main, fqn: "A", value: '{"a":0}' });
    await t.mutation(internal.state.setOutput, { ...main, value: '{"url":"u"}' });
    await t.mutation(internal.state.setOutput, {
      stack: "samebase/app",
      stage: "empty",
      value: '{"url":"e"}',
    });
    await t.mutation(internal.state.set, {
      stack: "samebase/other",
      stage: "main",
      fqn: "A",
      value: "{}",
    });
    expect(await t.query(internal.state.readStack, { stack: "samebase/app" })).toEqual({
      stages: [
        { name: "empty", resources: [], output: '{"url":"e"}' },
        {
          name: "main",
          resources: [
            { fqn: "A", value: '{"a":0}' },
            { fqn: "B", value: '{"b":0}' },
          ],
          output: '{"url":"u"}',
        },
        { name: "pr-1", resources: [{ fqn: "B", value: '{"b":1}' }], output: null },
      ],
    });
  });

  describe("secrets", () => {
    const row = { ...main, fqn: "Api" };
    const resource: CreatedResourceState = {
      status: "created",
      fqn: "Api",
      logicalId: "Api",
      instanceId: "9058feab6047cbbe014a3530ca68230f",
      resourceType: "Test.Api",
      namespace: undefined,
      providerVersion: 0,
      downstream: [],
      bindings: [],
      props: { name: "api" },
      attr: {
        url: "https://app.dev",
        token: Redacted.make("secret-of-the-attribute"),
        list: [{ deep: Redacted.make({ nested: "secret-in-a-list" }) }],
      },
    };
    const replaced: ReplacedResourceState = {
      ...resource,
      status: "replaced",
      old: resource,
      deleteFirst: false,
    };
    const output = { url: "https://app.dev", key: Redacted.make("secret-of-the-output") };
    /** A state as JSON text, with each secret in clear text: what store version 7 got. */
    const clear = (value: unknown) => JSON.stringify(encodeState(value));

    const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
    /** A client of the store, as a run makes it, with a codec of its own. */
    const client = (t: ReturnType<typeof storeTest>) => {
      const { api, calls } = functionApiOf(t);
      return { service: storeState(api, undefined), calls };
    };
    const { state, keys } = components.alchemyState;
    /** The text that a resource row holds, read past the store functions. */
    const rowText = async (t: ReturnType<typeof storeTest>, at = row) =>
      String(
        await t.run((ctx) =>
          ctx.runQuery(state.get, { stack: at.stack, stage: at.stage, fqn: at.fqn }),
        ),
      );
    /** The id of the key that wraps the data key of a sealed row. */
    const wrappingKeyOf = (text: string) => {
      const header = Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({
            __alchemy_sealed__: Schema.Struct({ by: Schema.String, key: Schema.String }),
          }),
        ),
      )(text).__alchemy_sealed__;
      expect(header.by).toBe("convex");
      return Schema.decodeUnknownSync(
        Schema.fromJsonString(Schema.Struct({ keyId: Schema.String })),
      )(atob(header.key)).keyId;
    };
    const read = async (service: StateService) =>
      clear(await run(service.get({ stack: row.stack, stage: row.stage, fqn: row.fqn })));

    it("keeps no secret in a row, and gives the run the state that it wrote", async () => {
      const t = storeTest();
      await withKey(t);
      const { service } = client(t);
      await run(service.set({ ...row, value: resource }));
      await run(service.set({ ...row, fqn: "Old", value: replaced }));
      await run(service.setOutput({ ...main, value: output }));

      const rows = JSON.stringify(
        await t.run(async (ctx) => [
          await ctx.runQuery(state.get, row),
          await ctx.runQuery(state.get, { ...row, fqn: "Old" }),
          await ctx.runQuery(state.getOutput, main),
        ]),
      );
      expect(rows).not.toMatch(/secret-of|secret-in|__redacted__/);
      expect(rows).toContain("https://app.dev");
      expect(rows.match(/__alchemy_sealed__/g)).toHaveLength(3);

      expect(await read(service)).toBe(clear(resource));
      expect(clear(await run(service.getOutput(main)))).toBe(clear(output));
      expect(clear(await run(service.getReplacedResources(main)))).toBe(clear([replaced]));
      // A second run opens the rows with a codec of its own.
      expect(await read(client(t).service)).toBe(clear(resource));
    });

    it("refuses a secret in clear text, and stores nothing", async () => {
      const t = storeTest();
      await withKey(t);
      const refused = "The store takes no secret in clear text.";
      await expect(
        t.mutation(internal.state.set, { ...row, value: clear(resource) }),
      ).rejects.toThrow(refused);
      await expect(
        t.mutation(internal.state.setOutput, { ...main, value: clear(output) }),
      ).rejects.toThrow(refused);
      // The check reads the JSON, so an escaped key is a secret too.
      await expect(
        t.mutation(internal.state.set, { ...row, value: '{"a":{"\\u005f_redacted__":"x"}}' }),
      ).rejects.toThrow(refused);
      expect(await t.query(internal.state.readStack, { stack: main.stack })).toEqual({
        stages: [],
      });
      // A value with the word in a string holds no secret.
      await t.mutation(internal.state.set, { ...row, value: '{"note":"__redacted__"}' });
      expect(await t.query(internal.state.get, row)).toBe('{"note":"__redacted__"}');
    });

    it("keeps a state without a secret as its text, and needs no key for it", async () => {
      const t = storeTest();
      const { service, calls } = client(t);
      const plain = { ...resource, attr: { url: "https://app.dev" } };
      await run(service.set({ ...row, value: plain }));
      expect(await rowText(t)).toBe(clear(plain));
      expect(calls.map((call) => call.path)).toEqual(["state:set"]);
    });

    it("fails a write with a secret when the store has no key, and stores nothing", async () => {
      const t = storeTest();
      await expect(run(client(t).service.set({ ...row, value: resource }))).rejects.toThrow(
        "The store has no key yet.",
      );
      expect(await t.query(internal.state.list, main)).toEqual([]);
    });

    it("opens a data key only for the stack and stage that it was made for", async () => {
      const t = storeTest();
      await withKey(t);
      const { plaintext, wrapped } = await t.action(internal.state.newDataKey, main);
      expect(Buffer.from(plaintext, "base64")).toHaveLength(32);
      expect(wrapped).not.toContain(plaintext);
      expect(await t.query(internal.state.openDataKey, { ...main, wrapped })).toBe(plaintext);
      for (const other of [preview, { stack: "samebase/other", stage: "main" }]) {
        await expect(t.query(internal.state.openDataKey, { ...other, wrapped })).rejects.toThrow();
      }
      await expect(
        t.query(internal.state.openDataKey, { ...main, wrapped: btoa('{"keyId":"k"}') }),
      ).rejects.toThrow("This is not a data key of the store.");
    });

    it("gives the key service the stack and the stage only, one data key for each stage", async () => {
      const t = storeTest();
      await withKey(t);
      const writer = client(t);
      await run(writer.service.set({ ...row, value: resource }));
      await run(writer.service.set({ ...row, fqn: "Old", value: replaced }));
      await run(writer.service.setOutput({ ...main, value: output }));
      await run(writer.service.set({ ...row, stage: preview.stage, value: resource }));
      expect(writer.calls.filter((call) => call.path === "state:newDataKey")).toEqual([
        { path: "state:newDataKey", args: main },
        { path: "state:newDataKey", args: preview },
      ]);
      expect(writer.calls.map((call) => call.path)).not.toContain("state:openDataKey");

      const reader = client(t);
      await read(reader.service);
      await run(reader.service.getOutput(main));
      const opened = reader.calls.filter((call) => call.path === "state:openDataKey");
      expect(opened).toEqual([
        {
          path: "state:openDataKey",
          args: { ...main, wrapped: expect.any(String) },
        },
      ]);
    });

    it("reads a row of store version 7, sealed or in clear text", async () => {
      const t = storeTest();
      const keyId = await withKey(t);
      // Store version 7 sealed each secret of `set` in its action, in this shape.
      const ring = parseKeyRing(
        stateKeyName(keyId),
        JSON.stringify({ current: keyId, keys: { [keyId]: process.env[stateKeyName(keyId)] } }),
      );
      const sealed = clear({
        ...resource,
        attr: {
          url: "https://app.dev",
          token: {
            __redacted__: {
              __sealed__: await sealSecret(ring, {
                plaintext: JSON.stringify("secret-of-the-attribute"),
                aad: resourceAad(row),
              }),
            },
          },
          list: [
            {
              deep: {
                __redacted__: {
                  __sealed__: await sealSecret(ring, {
                    plaintext: JSON.stringify({ nested: "secret-in-a-list" }),
                    aad: resourceAad(row),
                  }),
                },
              },
            },
          ],
        },
      });
      await t.run(async (ctx) => {
        await ctx.runMutation(state.set, { ...row, value: sealed });
        // A row that the reseal of store version 7 did not reach holds its secret in clear text.
        await ctx.runMutation(state.setOutput, { ...main, value: clear(output) });
      });

      const { service } = client(t);
      expect(await read(service)).toBe(clear(resource));
      expect(clear(await run(service.getOutput(main)))).toBe(clear(output));
      // The read does not change the row. The next write of the resource seals it the new way.
      expect(await rowText(t)).toBe(sealed);
      await run(service.set({ ...row, value: resource }));
      expect(await rowText(t)).not.toContain("__redacted__");
      expect(await read(client(t).service)).toBe(clear(resource));
    });

    it("wraps new data keys under a new key, and an older record still opens", async () => {
      const t = storeTest();
      const old = await withKey(t);
      await run(client(t).service.set({ ...row, value: resource }));
      expect(wrappingKeyOf(await rowText(t))).toBe(old);

      const next = addKey();
      await t.mutation(internal.state.rotateKey, { keyId: next });
      expect(await t.query(internal.state.sealing, {})).toEqual({ current: next });
      const later = { ...row, stage: preview.stage };
      await run(client(t).service.set({ ...later, value: resource }));
      expect(wrappingKeyOf(await rowText(t, later))).toBe(next);
      expect(await read(client(t).service)).toBe(clear(resource));

      // The old key must stay while a row names it.
      vi.stubEnv(stateKeyName(old), "");
      await expect(read(client(t).service)).rejects.toThrow();
      expect(clear(await run(client(t).service.get({ ...later, fqn: later.fqn })))).toBe(
        clear(resource),
      );
    });

    it("keeps the first key when two runs choose one", async () => {
      const t = storeTest();
      const first = addKey();
      const second = addKey();
      expect(await t.mutation(internal.state.chooseKey, { keyId: first })).toBe(first);
      expect(await t.mutation(internal.state.chooseKey, { keyId: second })).toBe(first);
      expect(await t.query(internal.state.sealing, {})).toEqual({ current: first });
    });

    it("refuses a key that the deployment does not hold, and keeps the old one", async () => {
      const t = storeTest();
      const keyId = await withKey(t);
      await expect(t.mutation(internal.state.rotateKey, { keyId: "absent" })).rejects.toThrow();
      expect(await t.query(internal.state.sealing, {})).toEqual({ current: keyId });
    });

    it("refuses a first key that the deployment does not hold", async () => {
      const t = storeTest();
      await expect(t.mutation(internal.state.chooseKey, { keyId: "absent" })).rejects.toThrow();
      expect(await t.run((ctx) => ctx.runQuery(keys.sealing, {}))).toEqual({ current: null });
    });
  });
});
