import { defineApp } from "convex/server";
import { v } from "convex/values";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({
  env: {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    PASSWORD_AUTH_ENABLED: v.optional(v.string()),
  },
});

app.use(workflow);

export default app;
