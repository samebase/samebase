import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp({
  env: {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    OPENAI_REVIEW_AUTH_EMAIL: v.optional(v.string()),
    OPENAI_REVIEW_AUTH_PASSWORD: v.optional(v.string()),
  },
});

app.use(agent);
app.use(workflow);
app.use(workpool, { name: "githubObservationWorkpool" });

export default app;
