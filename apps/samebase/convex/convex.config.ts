import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp({
  env: {
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    OPENAI_REVIEW_AUTH_EMAIL: v.optional(v.string()),
    OPENAI_REVIEW_AUTH_PASSWORD: v.optional(v.string()),
  },
});

app.use(agent);
app.use(workflow);
app.use(workpool, { name: "repositoryRefreshWorkpool" });

export default app;
