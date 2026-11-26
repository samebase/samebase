import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { storeState } from "../src/State.ts";
import { api, components, internal } from "../src/store/convex/_generated/api.js";
import { functionApiOf, storeTest, withKey } from "./storeTest.ts";

const repository = "samebase/app";
const identity = { subject: "reader", scope: "alchemy:read", repository };
const { state } = components.alchemyState;

describe("repository reader", () => {
  it("denies anonymous, malformed, and wrong-scope identities", async () => {
    const t = storeTest();
    await expect(t.query(api.reader.repository, {})).rejects.toThrow("read access");
    for (const claims of [
      { ...identity, scope: "other" },
      { ...identity, repository: "samebase" },
      { ...identity, repository: 1 },
      { subject: "reader", repository },
    ]) {
      await expect(t.withIdentity(claims).query(api.reader.repository, {})).rejects.toThrow(
        "read access",
      );
    }
  });

  it("includes exact and child stacks only, with deterministic order and no redacted content", async () => {
    const t = storeTest();
    // Rows of store version 7 with secrets in clear text: the store functions refuse such a write.
    await t.run(async (ctx) => {
      for (const stack of [
        "samebase/app/z",
        "samebase/app-other",
        "other/app",
        "samebase/app",
        "samebase/app/a",
      ]) {
        for (const stage of ["pr-2", "main"]) {
          await ctx.runMutation(state.setOutput, {
            stack,
            stage,
            value: JSON.stringify({
              array: [1, { secret: { __redacted__: "secret-output", extra: "discarded-sibling" } }],
            }),
          });
          for (const fqn of ["Z", "A"]) {
            await ctx.runMutation(state.set, {
              stack,
              stage,
              fqn,
              value: JSON.stringify({
                status: "created",
                props: { token: { __redacted__: "secret-resource", extra: "discarded-sibling" } },
              }),
            });
          }
        }
      }
    });
    const reply = await t.withIdentity(identity).query(api.reader.repository, {});
    expect(reply.stacks.map((stack) => stack.name)).toEqual([
      "samebase/app",
      "samebase/app/a",
      "samebase/app/z",
    ]);
    for (const stack of reply.stacks) {
      expect(stack.stages.map((stage) => stage.name)).toEqual(["main", "pr-2"]);
      for (const stage of stack.stages) {
        expect(stage.resources.map((resource) => resource.fqn)).toEqual(["A", "Z"]);
        expect(JSON.parse(stage.output ?? "")).toEqual({
          array: [1, { secret: { __redacted__: null } }],
        });
        expect(stage.resources.map((resource) => JSON.parse(resource.value))).toEqual([
          { status: "created", props: { token: { __redacted__: null } } },
          { status: "created", props: { token: { __redacted__: null } } },
        ]);
      }
    }
    expect(JSON.stringify(reply)).not.toMatch(/secret-output|secret-resource|discarded-sibling/);
    expect(
      await t
        .withIdentity({ ...identity, repository: "absent/app" })
        .query(api.reader.repository, {}),
    ).toEqual({ store: "found", stacks: [] });
  });

  it("gives every stage with a resource or an output, in the stage shape of readStack", async () => {
    const t = storeTest();
    const reader = t.withIdentity(identity);
    const stage = { stack: repository, stage: "main" };
    await t.mutation(internal.state.set, { ...stage, fqn: "Worker", value: "{}" });
    const beforeOutput = {
      name: "main",
      resources: [{ fqn: "Worker", value: "{}" }],
      output: null,
    };
    expect(await t.query(internal.state.readStack, { stack: repository })).toEqual({
      stages: [beforeOutput],
    });
    expect(await reader.query(api.reader.repository, {})).toEqual({
      store: "found",
      stacks: [{ name: repository, stages: [beforeOutput] }],
    });

    // The output stays as the stack wrote it, a run record included: the reader of the reply reads it.
    const output = JSON.stringify({ "samebase.run": { headCommit: "c" }, url: "https://u" });
    await t.mutation(internal.state.setOutput, { ...stage, value: output });
    expect((await reader.query(api.reader.repository, {})).stacks[0]?.stages[0]?.output).toBe(
      output,
    );

    await t.mutation(internal.state.remove, { ...stage, fqn: "Worker" });
    expect((await reader.query(api.reader.repository, {})).stacks[0]?.stages[0]).toEqual({
      name: "main",
      resources: [],
      output,
    });
    await t.mutation(internal.state.removeStack, stage);
    expect(await reader.query(api.reader.repository, {})).toEqual({ store: "found", stacks: [] });
    expect(await t.query(internal.state.stacks, {})).toEqual([]);
  });

  it("removes the secrets that the client sealed, and the header of the record", async () => {
    const t = storeTest();
    await withKey(t);
    const service = storeState(functionApiOf(t).api, undefined);
    const stage = { stack: repository, stage: "main" };
    const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
    const read = async () => {
      const fromReader = (await t.withIdentity(identity).query(api.reader.repository, {})).stacks[0]
        ?.stages;
      expect(await t.query(internal.state.readStack, { stack: repository })).toEqual({
        stages: fromReader,
      });
      return fromReader?.[0];
    };

    await run(
      service.set({
        ...stage,
        fqn: "Worker",
        value: {
          status: "created",
          fqn: "Worker",
          logicalId: "Worker",
          instanceId: "9058feab6047cbbe014a3530ca68230f",
          resourceType: "Test.Worker",
          namespace: undefined,
          providerVersion: 0,
          downstream: [],
          bindings: [],
          props: { name: "web" },
          attr: { url: "https://u", token: Redacted.make("secret-resource") },
        },
      }),
    );
    // A record that is not an object goes into the header of the sealed record.
    const outputs: [unknown, string][] = [
      [
        { url: "https://u", key: Redacted.make("secret-output") },
        '{"url":"https://u","key":{"__redacted__":null}}',
      ],
      [Redacted.make("secret-output"), '{"__redacted__":null}'],
      [[1, Redacted.make("secret-output")], '[1,{"__redacted__":null}]'],
      [["no secret"], '["no secret"]'],
    ];
    for (const [value, expected] of outputs) {
      await run(service.setOutput({ ...stage, value }));
      expect((await read())?.output).toBe(expected);
    }
    // The sealed record of an array carries the array in its header.
    const stored = await t.run((ctx) => ctx.runQuery(state.getOutput, stage));
    expect(JSON.parse(stored ?? "")).toEqual(["no secret"]);
    await run(service.setOutput({ ...stage, value: [1, Redacted.make("secret-output")] }));
    expect(
      Object.keys(JSON.parse((await t.run((ctx) => ctx.runQuery(state.getOutput, stage))) ?? "")),
    ).toEqual(["__alchemy_sealed__"]);
    const found = await read();
    expect(JSON.parse(found?.resources[0]?.value ?? "")).toMatchObject({
      status: "created",
      attr: { url: "https://u", token: { __redacted__: null } },
    });
    expect(JSON.stringify(found)).not.toMatch(/secret-|__sealed__|__alchemy_sealed__/);
  });

  it("preserves arbitrary JSON output while removing nested secrets", async () => {
    const t = storeTest();
    await withKey(t);
    for (const value of [null, "text", 1, false, [1, { __redacted__: "private" }]]) {
      await t.run((ctx) =>
        ctx.runMutation(state.setOutput, {
          stack: repository,
          stage: "main",
          value: JSON.stringify(value),
        }),
      );
      const stage = (await t.withIdentity(identity).query(api.reader.repository, {})).stacks[0]
        ?.stages[0];
      expect(stage?.output).toBe(
        JSON.stringify(Array.isArray(value) ? [1, { __redacted__: null }] : value),
      );
    }
  });
});
