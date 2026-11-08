import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// `value` is the JSON text of Alchemy's encodeState(...): the same text that
// Alchemy's local state writes to a file. A Convex object would reject keys
// that Alchemy state can hold, such as keys that start with "$".
export default defineSchema({
  resources: defineTable({
    stack: v.string(),
    stage: v.string(),
    fqn: v.string(),
    value: v.string(),
  }).index("by_fqn", ["stack", "stage", "fqn"]),
  outputs: defineTable({
    stack: v.string(),
    stage: v.string(),
    // Store version 6 and older wrote `currentRun` on each resource write, and an output row that
    // had only that field had no `value`. Nothing reads or writes `currentRun` now. A push checks
    // every row against this schema, so both declarations stay for the rows of an older store.
    value: v.optional(v.string()),
    currentRun: v.optional(v.any()),
  }).index("by_stage", ["stack", "stage"]),
  // One row: the key that seals new secrets, the count of its rotations, and the last count for
  // which a reseal finished.
  keys: defineTable({
    current: v.string(),
    generation: v.number(),
    sealedGeneration: v.optional(v.number()),
  }),
});
