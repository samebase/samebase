import { defineApp } from "convex/server";
import { v } from "convex/values";
import component from "../feature/convex/convex.config.ts";
import { componentName } from "../feature/name.ts";

const app = defineApp({ env: { TEXT_JOB_URL: v.string(), TEXT_JOB_SECRET: v.string() } });
app.use(component, {
  name: componentName,
  env: { WORKER_URL: app.env.TEXT_JOB_URL, WORKER_SECRET: app.env.TEXT_JOB_SECRET },
});
export default app;
