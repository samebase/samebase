import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("textJob", {
  env: { WORKER_URL: v.string(), WORKER_SECRET: v.string() },
});
