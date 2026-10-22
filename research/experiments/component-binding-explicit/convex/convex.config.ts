import { defineApp } from "convex/server";
import jobs from "./components/jobs/convex.config.ts";

const app = defineApp();
app.use(jobs, { name: "jobs" });
export default app;
