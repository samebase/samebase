// The module `bridge` of the store app in the bridge root (see bridgeRoot in src/State.ts):
// `bridge:cleanup`, which the run key can call, forwards to the component cleanup of bridge.ts.
import type { FunctionReference } from "convex/server";
import { type Infer, v } from "convex/values";
import { components } from "../store/convex/_generated/api.js";
import { internalMutation } from "../store/convex/_generated/server.js";
import { cleanupReply } from "./bridge.ts";

type ComponentCleanup = FunctionReference<
  "mutation",
  "internal",
  { cursor: string | null },
  Infer<typeof cleanupReply>,
  "alchemyState"
>;

// @ts-expect-error The bridge root adds bridge.ts to the component as the module `bridge`; the generated component API of src/store does not list it.
const componentCleanup: ComponentCleanup = components.alchemyState.bridge.cleanup;

/** One page of the cleanup. The function API takes no null, so the first page has no `cursor`. */
export const cleanup = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: cleanupReply,
  handler: (ctx, args) => ctx.runMutation(componentCleanup, { cursor: args.cursor ?? null }),
});
