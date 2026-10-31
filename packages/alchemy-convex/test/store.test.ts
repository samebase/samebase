// The store functions of src/store/convex and its alchemyState component in convex-test.
import { describe, expect, it, vi } from "vitest";
import { components, internal } from "../src/store/convex/_generated/api.js";
import { STORE_VERSION } from "../src/store/convex/version.ts";
import { parseKeyRing } from "../src/store/sealedSecret.ts";
import { storeTest } from "./storeTest.ts";

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
    /** A key ring with one more key, which is the current key. */
    const rotated = (next: string) => {
      const ring: { current: string; keys: Record<string, string> } = JSON.parse(
        process.env["STATE_KEYS"] ?? "",
      );
      return JSON.stringify({
        current: "next",
        keys: { ...ring.keys, next: next.padEnd(43, "A") + "=" },
      });
    };

    it("keeps no secret in the rows, and gives the run the text that it wrote", async () => {
      const t = storeTest();
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

    it("keeps a row without a secret as its text, and needs no key ring for it", async () => {
      const t = storeTest();
      vi.stubEnv("STATE_KEYS", "");
      await t.action(internal.state.set, { ...row, value: '{"status":"created"}' });
      expect(await t.query(internal.state.get, row)).toBe('{"status":"created"}');
    });

    it("fails a write with a secret when the key ring is missing, and stores nothing", async () => {
      const t = storeTest();
      vi.stubEnv("STATE_KEYS", "");
      await expect(t.action(internal.state.set, { ...row, value })).rejects.toThrow(
        "STATE_KEYS is missing",
      );
      expect(await t.query(internal.state.list, main)).toEqual([]);
    });

    it("opens a sealed value only in the row that sealed it", async () => {
      const t = storeTest();
      await t.action(internal.state.set, { ...row, value });
      const { stages } = await t.query(internal.state.readStack, { stack: main.stack });
      await t.mutation(internal.state.writeResource, {
        ...row,
        fqn: "Other",
        value: stages[0]?.resources[0]?.value ?? "",
      });
      await expect(t.query(internal.state.get, { ...row, fqn: "Other" })).rejects.toThrow();
    });

    it("reads a clear value that no reseal reached, and a reseal seals it", async () => {
      const t = storeTest();
      await t.mutation(internal.state.writeResource, { ...row, value });
      await t.mutation(internal.state.writeOutput, { ...main, value: output });
      expect(await stored(t)).toContain("secret-of-the-attribute");
      expect(await t.query(internal.state.get, row)).toBe(value);

      expect(await t.action(internal.state.reseal, {})).toEqual({ resealed: 2, skippedChanged: 0 });

      expect(await stored(t)).not.toContain("secret-of");
      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.getOutput, main)).toBe(output);
      expect(await t.action(internal.state.reseal, {})).toEqual({ resealed: 0, skippedChanged: 0 });
    });

    it("moves the secrets to a new key, and the old key can leave the ring", async () => {
      const t = storeTest();
      await t.action(internal.state.set, { ...row, value });
      await t.action(internal.state.setOutput, { ...main, value: output });
      const ring = rotated("B");
      vi.stubEnv("STATE_KEYS", ring);
      expect(await t.query(internal.state.get, row)).toBe(value);

      expect(await t.action(internal.state.reseal, {})).toEqual({ resealed: 2, skippedChanged: 0 });

      const { keys } = parseKeyRing("STATE_KEYS", ring);
      expect(keys.size).toBe(2);
      vi.stubEnv(
        "STATE_KEYS",
        JSON.stringify({ current: "next", keys: { next: "B".padEnd(43, "A") + "=" } }),
      );
      expect(await t.query(internal.state.get, row)).toBe(value);
      expect(await t.query(internal.state.getOutput, main)).toBe(output);
    });

    it("keeps the run record of a resealed stage", async () => {
      const t = storeTest();
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
      await t.mutation(internal.state.writeResource, { ...row, value, run });
      await t.action(internal.state.reseal, {});
      const { stages } = await t.query(internal.state.readStack, { stack: main.stack });
      expect(stages[0]?.record).toEqual(run);
    });

    it("leaves a row that changed during the reseal", async () => {
      const t = storeTest();
      await t.mutation(internal.state.writeResource, { ...row, value });
      const replaced = await t.run((ctx) =>
        ctx.runMutation(components.alchemyState.state.replaceResource, {
          ...row,
          expected: "another text",
          value: "{}",
        }),
      );
      expect(replaced).toBe(false);
      expect(await t.query(internal.state.get, row)).toBe(value);
    });
  });
});
