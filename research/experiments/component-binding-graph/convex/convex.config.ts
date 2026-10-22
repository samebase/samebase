import { defineApp } from "convex/server";
import { v } from "convex/values";
import job from "../job/convex/convex.config.ts";

const app = defineApp({
  env: { JOB_WORKER_URL: v.string(), JOB_WORKER_SECRET: v.string() },
});
app.use(job, {
  name: "jobs",
  env: { WORKER_URL: app.env.JOB_WORKER_URL, WORKER_SECRET: app.env.JOB_WORKER_SECRET },
});
export default app;
