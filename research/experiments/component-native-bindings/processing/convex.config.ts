import { defineComponent } from "convex/server";
import { v } from "convex/values";
import job from "../job/convex/convex.config.ts";

const processing = defineComponent("processing", {
  env: { WORKER_URL: v.string(), WORKER_SECRET: v.string() },
});
processing.use(job, {
  name: "jobs",
  env: { WORKER_URL: processing.env.WORKER_URL, WORKER_SECRET: processing.env.WORKER_SECRET },
});
export default processing;
