import { defineApp } from "convex/server";
import { v } from "convex/values";
import job from "../job/convex/convex.config.ts";

const app = defineApp({
  env: { JOBS_WORKER_URL: v.string(), JOBS_WORKER_SECRET: v.string() },
});
app.use(job, {
  name: "jobs",
  env: { WORKER_URL: app.env.JOBS_WORKER_URL, WORKER_SECRET: app.env.JOBS_WORKER_SECRET },
});
export default app;
