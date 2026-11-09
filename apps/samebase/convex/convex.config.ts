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
    // Optional: a local deployment may have none, and email.ts then skips the send. The production
    // deploy (alchemy.run.ts) writes both; a development deployment holds hand-set values
    // (specs/112_CLOUDFLARE_EMAIL_SENDING_SPEC.md).
    CLOUDFLARE_EMAIL_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_API_TOKEN: v.optional(v.string()),
    CREDENTIAL_KEYS: v.string(),
    DEV_SEED_GITHUB_API_KEY: v.optional(v.string()),
    GITHUB_APP_CLIENT_ID: v.string(),
    GITHUB_APP_CLIENT_SECRET: v.string(),
    GITHUB_APP_ID: v.string(),
    GITHUB_APP_PRIVATE_KEY: v.string(),
    GITHUB_APP_SLUG: v.string(),
    IDENTITY_HUB_CLIENT_ID: v.string(),
    IDENTITY_HUB_CLIENT_SECRET: v.string(),
    IDENTITY_HUB_ISSUER: v.string(),
    // The key of the hub's moderation endpoints, which /admin/hub-clients calls through
    // hubClients/moderation.ts: it reads registrations and clients and sets blocks, and nothing else.
    // Set by hand, as on the hub. Unset, as in CI: the page says that moderation is off.
    IDENTITY_HUB_MODERATION_KEY: v.optional(v.string()),
    // The public identity hub, where apps made from the starter sign in (samebase/identity-hub):
    // its issuer and moderation key, for the same page. Set by hand; unset, its moderation is off.
    PUBLIC_IDENTITY_HUB_ISSUER: v.optional(v.string()),
    PUBLIC_IDENTITY_HUB_MODERATION_KEY: v.optional(v.string()),
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
// GitHub and Google sign-in run through the team's identity hub, an OpenID Provider at
// IDENTITY_HUB_ISSUER, with one client per deployment for both methods and for the provider
// connections (convex/hubResourceOAuth.ts). The client holds two return addresses: the hub sends a
// sign-in back to <site>/auth/hub/callback, next to the other sign-in routes under /auth, and a
// connection back to <site>/oauth/hub/callback (convex/http.ts). Convex refuses to bind the
// component's required variables to optional ones, so every deployment holds the three
// IDENTITY_HUB_ variables; a linked worktree and CI hold no-hub values.
app.use(oauth, {
  name: "authHub",
  httpPrefix: "/auth/hub",
  env: {
    CLIENT_ID: app.env.IDENTITY_HUB_CLIENT_ID,
    CLIENT_SECRET: app.env.IDENTITY_HUB_CLIENT_SECRET,
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
