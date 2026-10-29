import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config";
import oauth from "@convex-dev/auth/components/oauth/convex.config";
import password from "@convex-dev/auth/components/password/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import mail from "@samebase/convex-cloudflare-email-inbox/convex.config.js";
import hosting from "@samebase/convex-hosting/convex.config";
import gitEditor from "@samebase/git-editor/convex.config";

const app = defineApp({
  env: {
    ACCOUNT_DELETION_GRACE_PERIOD_MS: v.optional(v.literal("0")),
    AUTO_APPROVE_NEW_USERS: v.optional(v.union(v.literal("true"), v.literal("false"))),
    AUTH_JWKS: v.string(),
    AUTH_PRIVATE_KEY: v.string(),
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    DEV_SEED_GITHUB_API_KEY: v.optional(v.string()),
    GITHUB_APP_CLIENT_ID: v.string(),
    GITHUB_APP_CLIENT_SECRET: v.string(),
    GITHUB_APP_ID: v.string(),
    GITHUB_APP_OAUTH_CALLBACK_URL: v.string(),
    GITHUB_APP_PRIVATE_KEY: v.string(),
    GITHUB_APP_SLUG: v.string(),
    HUB_CLIENT_ID: v.string(),
    HUB_CLIENT_SECRET: v.string(),
    HUB_ISSUER: v.string(),
    OPENAI_APPS_CHALLENGE_TOKEN: v.optional(v.string()),
    PASSWORD_AUTH_ENABLED: v.optional(v.string()),
    POLAR_ACCESS_TOKEN: v.optional(v.string()),
    POLAR_WEBHOOK_SECRET: v.optional(v.string()),
    DEV_SEED_SAMEBASE_CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    DEV_SEED_SAMEBASE_CLOUDFLARE_API_KEY: v.optional(v.string()),
    DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY: v.optional(v.string()),
    DEV_SEED_SAMEBASE_CONVEX_TEAM_ID: v.optional(v.string()),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
// GitHub and Google sign-in run through the team's identity hub, an OpenID Provider at HUB_ISSUER,
// with one client per deployment for both methods. The hub sends the browser back to
// <site>/auth/hub/callback, the callback URL of the deployment's registration at the hub, next to
// the other sign-in routes under /auth. Convex refuses to bind the component's required variables
// to optional ones, so every deployment holds the three HUB_ variables; a linked worktree and CI
// hold no-hub values.
app.use(oauth, {
  name: "authHub",
  httpPrefix: "/auth/hub",
  env: {
    CLIENT_ID: app.env.HUB_CLIENT_ID,
    CLIENT_SECRET: app.env.HUB_CLIENT_SECRET,
  },
});
app.use(password);
app.use(workflow);
app.use(mail, {
  env: {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: app.env.CLOUDFLARE_EMAIL_ACCOUNT_ID,
    CLOUDFLARE_EMAIL_API_TOKEN: app.env.CLOUDFLARE_EMAIL_API_TOKEN,
  },
});
app.use(hosting);
app.use(gitEditor);

export default app;
