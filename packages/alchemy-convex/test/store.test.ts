// The store functions of src/store/convex and its alchemyState component in convex-test.
import { describe, expect, it, vi } from "vitest";
import { components, internal } from "../src/store/convex/_generated/api.js";
import { stateKeyName } from "../src/store/convex/sealing.ts";
import { STORE_VERSION } from "../src/store/convex/version.ts";
import { addKey, storeTest, withKey } from "./storeTest.ts";

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
    await t.action(internal.state.set, { ...main, fqn: "Project", value: "{}" });
    expect(await t.query(internal.state.stacks, {})).toEqual(["samebase/app"]);
  });

  it("lists stacks and stages in index order, one row for each resource", async () => {
    const t = storeTest();
    await t.action(internal.state.set, { ...preview, fqn: "B", value: "{}" });
    await t.action(internal.state.set, { ...main, fqn: "B", value: "{}" });
    await t.action(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.action(internal.state.set, {
      stack: "samebase/other",
      stage: "main",
      fqn: "A",
      value: "{}",
    });
    await t.action(internal.state.set, { ...main, fqn: "A", value: '{"status":"created"}' });

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
    await t.action(internal.state.setOutput, {
      stack: "samebase/empty",
      stage: "main",
      value: "{}",
    });
    await t.action(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.action(internal.state.setOutput, { ...preview, value: "{}" });
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
    await t.action(internal.state.set, { ...main, fqn: "A", value: '{"status":"replaced"}' });
    await t.action(internal.state.set, { ...main, fqn: "B", value: '{"status":"created"}' });
    await t.action(internal.state.set, { ...main, fqn: "C", value: '"replaced"' });
    expect(await t.query(internal.state.replaced, main)).toEqual(['{"status":"replaced"}']);
  });

  it("removes a row, a stage with its output, or a whole stack", async () => {
    const t = storeTest();
    await t.action(internal.state.set, { ...main, fqn: "A", value: "{}" });
    await t.action(internal.state.set, { ...main, fqn: "B", value: "{}" });
    await t.action(internal.state.set, { ...preview, fqn: "A", value: "{}" });
    await t.action(internal.state.setOutput, { ...main, value: '{"url":"u"}' });
    await t.action(internal.state.setOutput, { ...preview, value: '{"url":"p"}' });
    await t.action(internal.state.setOutput, { ...preview, value: '{"url":"q"}' });
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
    await t.action(internal.state.set, { ...preview, fqn: "B", value: '{"b":1}' });
    await t.action(internal.state.set, { ...main, fqn: "B", value: '{"b":0}' });
    await t.action(internal.state.set, { ...main, fqn: "A", value: '{"a":0}' });
    await t.action(internal.state.setOutput, { ...main, value: '{"url":"u"}' });
    await t.action(internal.state.setOutput, {
      stack: "samebase/app",
      stage: "empty",
      value: '{"url":"e"}',
    });
    await t.action(internal.state.set, {
      stack: "samebase/other",
      stage: "main",
      fqn: "A",
      value: "{}",
    });
    expect(await t.query(internal.state.readStack, { stack: "samebase/app" })).toEqual({
      stages: [
        { stage: "empty", resources: [], output: '{"url":"e"}', record: null },
        {
          stage: "main",
          resources: [
            { fqn: "A", value: '{"a":0}' },
            { fqn: "B", value: '{"b":0}' },
          ],
          output: '{"url":"u"}',
          record: null,
        },
        { stage: "pr-1", resources: [{ fqn: "B", value: '{"b":1}' }], output: null, record: null },
      ],
    });
  });

  describe("secrets", () => {
    const row = { ...main, fqn: "Api" };
    const value = JSON.stringify({
      status: "replaced",
      attr: {
        url: "https://app.dev",
        token: { __redacted__: "secret-of-the-attribute" },
        list: [{ deep: { __redacted__: { nested: "secret-in-a-list" } } }],
      },
    });
    const output = JSON.stringify({
      url: "https://app.dev",
      key: { __redacted__: "secret-of-the-output" },
    });
    const stored = async (t: ReturnType<typeof storeTest>) =>
      JSON.stringify(await t.query(internal.state.readStack, { stack: main.stack }));
    const clearRow = { ...row, value, keyId: null };
    /** A second key, which becomes the current key. */
    const rotate = async (t: ReturnType<typeof storeTest>) => {
      const keyId = addKey();
      await t.mutation(internal.state.rotateKey, { keyId });
      return keyId;
    };

    it("keeps no secret in the rows, and gives the run the text that it wrote", async () => {
      const t = storeTest();
      await withKey(t);
      await t.action(internal.state.set, { ...row, value });
      await t.action(internal.state.setOutput, { ...main, value: output });

      const rows = await stored(t);
      expect(rows).not.toContain("secret-of");
      expect(rows).not.toContain("secret-in");
      expect(rows.match(/__sealed__/g)).toHaveLength(3);
      expect(rows).toContain("https://app.dev");

      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.getOutput, main)).toBe(output);
      expect(await t.query(internal.state.replaced, main)).toEqual([value]);
    });

    it("keeps a row without a secret as its text, and needs no key for it", async () => {
      const t = storeTest();
      await t.action(internal.state.set, { ...row, value: '{"status":"created"}' });
      expect(await t.query(internal.state.get, row)).toBe('{"status":"created"}');
    });

    it("fails a write with a secret when the store has no key, and stores nothing", async () => {
      const t = storeTest();
      await expect(t.action(internal.state.set, { ...row, value })).rejects.toThrow(
        "The store has no key yet.",
      );
      expect(await t.query(internal.state.list, main)).toEqual([]);
    });

    it("opens a sealed value only in the row that sealed it", async () => {
      const t = storeTest();
      await withKey(t);
      await t.action(internal.state.set, { ...row, value });
      const { stages } = await t.query(internal.state.readStack, { stack: main.stack });
      await t.mutation(internal.state.writeResource, {
        ...row,
        fqn: "Other",
        value: stages[0]?.resources[0]?.value ?? "",
        keyId: null,
      });
      await expect(t.query(internal.state.get, { ...row, fqn: "Other" })).rejects.toThrow();
    });

    it("keeps the first key when two runs choose one, and no sealed value is lost", async () => {
      const t = storeTest();
      const first = addKey();
      const second = addKey();
      expect(await t.mutation(internal.state.chooseKey, { keyId: first })).toBe(first);
      await t.action(internal.state.set, { ...row, value });
      expect(await t.mutation(internal.state.chooseKey, { keyId: second })).toBe(first);
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ current: first });
      expect(await t.query(internal.state.get, row)).toBe(value);
    });

    it("refuses a key that the deployment does not hold, and keeps the old one", async () => {
      const t = storeTest();
      const keyId = await withKey(t);
      await expect(t.mutation(internal.state.rotateKey, { keyId: "absent" })).rejects.toThrow();
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ current: keyId });
    });

    it("refuses a first key that the deployment does not hold", async () => {
      const t = storeTest();
      await expect(t.mutation(internal.state.chooseKey, { keyId: "absent" })).rejects.toThrow();
      expect(await t.query(internal.state.sealing, {})).toMatchObject({
        current: null,
        sealed: false,
      });
    });

    it("reads a clear value that no reseal reached, and a reseal seals it", async () => {
      const t = storeTest();
      await t.mutation(internal.state.writeResource, clearRow);
      await t.mutation(internal.state.writeOutput, { ...main, value: output, keyId: null });
      await withKey(t);
      expect(await stored(t)).toContain("secret-of-the-attribute");
      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: false });

      expect(await t.action(internal.state.reseal, {})).toEqual({
        resealed: 2,
        skippedChanged: 0,
        failed: [],
      });

      expect(await stored(t)).not.toContain("secret-of");
      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.getOutput, main)).toBe(output);
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: true });
      expect(await t.action(internal.state.reseal, {})).toEqual({
        resealed: 0,
        skippedChanged: 0,
        failed: [],
      });
    });

    it("reseals every stage of every stack, one row at a time", async () => {
      const t = storeTest();
      await withKey(t);
      for (const stack of ["samebase/app", "samebase/other"]) {
        for (const stage of ["main", "pr-1"]) {
          await t.mutation(internal.state.writeResource, { ...clearRow, stack, stage });
        }
      }
      expect(await t.action(internal.state.reseal, {})).toMatchObject({ resealed: 4 });
      for (const stack of ["samebase/app", "samebase/other"]) {
        expect(await stored(t)).not.toContain("secret-of");
        expect(await t.query(internal.state.get, { ...row, stack, stage: "pr-1" })).toBe(value);
      }
    });

    it("moves the secrets to a new key, and the old key can leave the deployment", async () => {
      const t = storeTest();
      const old = await withKey(t);
      await t.action(internal.state.set, { ...row, value });
      await t.action(internal.state.setOutput, { ...main, value: output });
      await t.action(internal.state.reseal, {});
      expect(await t.query(internal.state.sealing, {})).toMatchObject({
        current: old,
        sealed: true,
      });

      const next = await rotate(t);
      expect(await t.query(internal.state.sealing, {})).toMatchObject({
        current: next,
        sealed: false,
      });
      expect(await t.query(internal.state.get, row)).toBe(value);

      expect(await t.action(internal.state.reseal, {})).toMatchObject({ resealed: 2 });
      expect(await t.query(internal.state.sealing, {})).toMatchObject({
        current: next,
        sealed: true,
      });

      vi.stubEnv(stateKeyName(old), "");
      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.getOutput, main)).toBe(output);
    });

    it("does not commit a write sealed under a key that stopped being current", async () => {
      const t = storeTest();
      const old = await withKey(t);
      await t.action(internal.state.set, { ...row, value: '{"status":"created"}' });
      await rotate(t);
      const late = { ...row, value: "a text sealed under the old key", keyId: old };
      expect(await t.mutation(internal.state.writeResource, late)).toBe(false);
      expect(
        await t.mutation(internal.state.writeOutput, {
          ...main,
          value: late.value,
          keyId: old,
        }),
      ).toBe(false);
      expect(await t.query(internal.state.get, row)).toBe('{"status":"created"}');
      expect(await t.query(internal.state.getOutput, main)).toBeNull();

      await t.action(internal.state.set, { ...row, value });
      expect(await t.query(internal.state.get, row)).toBe(value);
    });

    it("goes on after a row that cannot open, names it, and does not finish", async () => {
      const t = storeTest();
      const old = await withKey(t);
      await t.action(internal.state.set, { ...row, fqn: "Lost", value });
      await t.mutation(internal.state.writeResource, { ...clearRow, fqn: "Zebra" });
      await rotate(t);
      vi.stubEnv(stateKeyName(old), "");

      expect(await t.action(internal.state.reseal, {})).toEqual({
        resealed: 1,
        skippedChanged: 0,
        failed: ["samebase/app/main/Lost"],
      });
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: false });
      expect(await stored(t)).not.toContain("secret-of");
    });

    it("keeps the run record of a resealed stage", async () => {
      const t = storeTest();
      await withKey(t);
      const run = {
        version: 1 as const,
        repository: "samebase/app",
        stackFile: "alchemy.run.ts",
        branch: "main",
        pullRequest: null,
        headCommit: "commit",
        runUrl: null,
        source: "laptop" as const,
        recordedAt: "2026-10-31T10:00:00.000Z",
      };
      await t.mutation(internal.state.writeResource, { ...clearRow, run });
      await t.action(internal.state.reseal, {});
      const { stages } = await t.query(internal.state.readStack, { stack: main.stack });
      expect(stages[0]?.record).toEqual(run);
    });

    it("leaves a row that changed during the reseal", async () => {
      const t = storeTest();
      await withKey(t);
      await t.mutation(internal.state.writeResource, clearRow);
      const { generation } = await t.query(internal.state.sealing, {});
      const replaced = await t.run((ctx) =>
        ctx.runMutation(components.alchemyState.state.replaceResource, {
          ...row,
          expected: "another text",
          value: "{}",
          generation,
        }),
      );
      expect(replaced).toBe("changed");
      expect(await t.query(internal.state.get, row)).toBe(value);
    });

    it("does not let a reseal under an older key replace the work of a newer one", async () => {
      const t = storeTest();
      await withKey(t);
      await t.action(internal.state.set, { ...row, value });
      await t.action(internal.state.setOutput, { ...main, value: output });
      const { generation } = await t.query(internal.state.sealing, {});
      await rotate(t);
      await t.action(internal.state.reseal, {});
      const before = await stored(t);

      const { state } = components.alchemyState;
      const resource = { ...row, expected: "unused", value: "{}", generation };
      const stage = { ...main, expected: "unused", value: "{}", generation };
      expect(await t.run((ctx) => ctx.runMutation(state.replaceResource, resource))).toBe("stale");
      expect(await t.run((ctx) => ctx.runMutation(state.replaceOutput, stage))).toBe("stale");

      expect(await stored(t)).toBe(before);
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: true });
    });

    it("does not take a key that came back for the sweep that used it before", async () => {
      const t = storeTest();
      const first = await withKey(t);
      await t.action(internal.state.set, { ...row, value });
      const paused = await t.query(internal.state.sealing, {});

      // A sweep of `first` pauses here. The store moves to a second key, and a row needs it.
      const second = await rotate(t);
      await t.action(internal.state.set, { ...row, fqn: "Needs", value });
      await t.action(internal.state.reseal, {});
      await t.mutation(internal.state.rotateKey, { keyId: first });

      // The key is back, so its generation is the only thing that tells the old sweep apart.
      expect(await t.query(internal.state.sealing, {})).toMatchObject({
        current: first,
        sealed: false,
      });
      const { keys, state } = components.alchemyState;
      await t.run((ctx) => ctx.runMutation(keys.markSealed, { generation: paused.generation }));
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: false });
      expect(
        await t.run((ctx) =>
          ctx.runMutation(state.replaceResource, {
            ...row,
            expected: "unused",
            value: "{}",
            generation: paused.generation,
          }),
        ),
      ).toBe("stale");

      // A real sweep of the new generation moves the row, and only then the other key can go.
      await t.action(internal.state.reseal, {});
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: true });
      vi.stubEnv(stateKeyName(second), "");
      expect(await t.query(internal.state.get, { ...row, fqn: "Needs" })).toBe(value);
    });

    it("reseals more rows than one page holds, and reads each page with a bound", async () => {
      const t = storeTest();
      await withKey(t);
      for (let index = 0; index < 25; index += 1) {
        await t.mutation(internal.state.writeResource, { ...clearRow, fqn: `Row${index}` });
        await t.mutation(internal.state.writeOutput, {
          stack: main.stack,
          stage: `stage-${index}`,
          value: output,
          keyId: null,
        });
      }
      const { state } = components.alchemyState;
      const first = await t.run((ctx) => ctx.runQuery(state.resourcePage, { cursor: null }));
      expect(first.page).toHaveLength(10);
      expect(first.isDone).toBe(false);

      expect(await t.action(internal.state.reseal, {})).toMatchObject({
        resealed: 50,
        failed: [],
      });
      expect(await stored(t)).not.toContain("secret-of");
      expect(await t.query(internal.state.sealing, {})).toMatchObject({ sealed: true });
    });

    it("skips an output row that has only a run record", async () => {
      const t = storeTest();
      await withKey(t);
      const run = {
        version: 1 as const,
        repository: "samebase/app",
        stackFile: "alchemy.run.ts",
        branch: "main",
        pullRequest: null,
        headCommit: "commit",
        runUrl: null,
        source: "laptop" as const,
        recordedAt: "2026-10-31T10:00:00.000Z",
      };
      await t.mutation(internal.state.writeResource, { ...clearRow, run });
      expect(await t.action(internal.state.reseal, {})).toMatchObject({ resealed: 1, failed: [] });
    });
  });
});
