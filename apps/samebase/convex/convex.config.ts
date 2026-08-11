import { defineApp } from "convex/server";
import { v } from "convex/values";
import workflow from "@convex-dev/workflow/convex.config";

const app = defineApp({
  env: {
    AUTH_GITHUB_ID: v.optional(v.string()),
    AUTH_GITHUB_SECRET: v.optional(v.string()),
    AUTH_GOOGLE_ID: v.optional(v.string()),
    AUTH_GOOGLE_SECRET: v.optional(v.string()),
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    DEV_SEED_GITHUB_API_KEY: v.optional(v.string()),
    GITHUB_APP_CLIENT_ID: v.string(),
    GITHUB_APP_CLIENT_SECRET: v.string(),
    GITHUB_APP_ID: v.string(),
    GITHUB_APP_OAUTH_CALLBACK_URL: v.string(),
    GITHUB_APP_PRIVATE_KEY: v.string(),
    GITHUB_APP_SLUG: v.string(),
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    PASSWORD_AUTH_ENABLED: v.optional(v.string()),
    POLAR_ACCESS_TOKEN: v.optional(v.string()),
    POLAR_GITHUB_ORGANIZATION_FREE_MONTHLY_PRODUCT_ID: v.optional(v.string()),
    POLAR_GITHUB_ORGANIZATION_PRO_MONTHLY_PRODUCT_ID: v.optional(v.string()),
    POLAR_GITHUB_USER_FREE_MONTHLY_PRODUCT_ID: v.optional(v.string()),
    POLAR_GITHUB_USER_PRO_MONTHLY_PRODUCT_ID: v.optional(v.string()),
    POLAR_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(workflow);

export default app;
