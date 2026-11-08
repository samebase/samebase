// The redacted read of one repository. The app checks the reader's verified
// token and passes the repository that the token names: a component has no
// `ctx.auth`. The reply is Alchemy state only, in the stage shape of
// `readStack`: the reader takes anything else, such as a run record, from the
// outputs.
import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the reader and the deploy key enforce access.
import { query } from "./_generated/server.js";
import { storedStage } from "./state.ts";

/** The reply of {@link repository}. */
export const repositoryReply = v.object({
  store: v.literal("found"),
  stacks: v.array(v.object({ name: v.string(), stages: v.array(storedStage) })),
});

/** Alchemy encodes a secret as an object with __redacted__; discard that whole object's contents. */
const withoutSecrets = (text: string) =>
  JSON.stringify(
    JSON.parse(text, (_key, value: unknown) =>
      typeof value === "object" && value !== null && "__redacted__" in value
        ? { __redacted__: null }
        : value,
    ),
  );

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * The stacks of `repository`: the stack of that name and the stacks below `repository + "/"`, each
 * with every stage that has a resource or an output, in name order. Resources stay in fqn order.
 */
export const repository = query({
  args: { repository: v.string() },
  returns: repositoryReply,
  handler: async (ctx, args) => {
    const name = args.repository;
    // The exact name and its slash-prefixed children exclude names such as owner/app-other.
    // All four reads share the query transaction, including writes made while provisioning.
    const [rootResources, childResources, rootOutputs, childOutputs] = await Promise.all([
      ctx.db
        .query("resources")
        .withIndex("by_fqn", (q) => q.eq("stack", name))
        .collect(),
      ctx.db
        .query("resources")
        .withIndex("by_fqn", (q) => q.gte("stack", `${name}/`).lt("stack", `${name}0`))
        .collect(),
      ctx.db
        .query("outputs")
        .withIndex("by_stage", (q) => q.eq("stack", name))
        .collect(),
      ctx.db
        .query("outputs")
        .withIndex("by_stage", (q) => q.gte("stack", `${name}/`).lt("stack", `${name}0`))
        .collect(),
    ]);
    const stacks = new Map<
      string,
      Map<
        string,
        { name: string; resources: { fqn: string; value: string }[]; output: string | null }
      >
    >();
    const stageOf = (stack: string, stage: string) => {
      let stages = stacks.get(stack);
      if (stages === undefined) {
        stages = new Map();
        stacks.set(stack, stages);
      }
      let found = stages.get(stage);
      if (found === undefined) {
        found = { name: stage, resources: [], output: null };
        stages.set(stage, found);
      }
      return found;
    };
    for (const row of [...rootResources, ...childResources]) {
      stageOf(row.stack, row.stage).resources.push({
        fqn: row.fqn,
        value: withoutSecrets(row.value),
      });
    }
    for (const row of [...rootOutputs, ...childOutputs]) {
      stageOf(row.stack, row.stage).output = withoutSecrets(row.value);
    }
    return {
      store: "found" as const,
      stacks: [...stacks]
        .map(([stack, stages]) => ({ name: stack, stages: [...stages.values()].sort(byName) }))
        .sort(byName),
    };
  },
});
