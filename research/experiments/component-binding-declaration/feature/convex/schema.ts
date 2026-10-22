import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  results: defineTable({ input: v.string(), output: v.string() }),
});
