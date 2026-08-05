import { defineApp } from "convex/server";
import { v } from "convex/values";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({
  env: {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    GITHUB_APP_CLIENT_ID: v.string(),
    GITHUB_APP_CLIENT_SECRET: v.string(),
    GITHUB_APP_ID: v.string(),
    GITHUB_APP_OAUTH_CALLBACK_URL: v.string(),
    GITHUB_APP_PRIVATE_KEY: v.string(),
    GITHUB_APP_SLUG: v.string(),
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    PASSWORD_AUTH_ENABLED: v.optional(v.string()),
    POLAR_ACCESS_TOKEN: v.optional(v.string()),
    POLAR_PRO_MONTHLY_PRODUCT_ID: v.optional(v.string()),
    POLAR_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(workflow);

export default app;
