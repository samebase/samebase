import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({ jobs: defineTable({ input: v.string(), result: v.string() }) });
