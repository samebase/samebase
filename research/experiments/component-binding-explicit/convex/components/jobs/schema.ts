import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workerBindings: defineTable({ url: v.string(), secret: v.string() }),
  results: defineTable({ input: v.string(), output: v.string() }),
});
