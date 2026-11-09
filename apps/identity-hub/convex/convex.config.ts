import identityBroker from "@samebase/identity-broker/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// A push fails while a required variable is missing. scripts/check-keys.ts checks
// IDENTITY_BROKER_KEYS before each deploy and scripts/init-keys.ts creates it once by hand; the
// stack hands the connector and provider variables to the deployment.
const app = defineApp({
  env: {
    /** The signing key set: `npx identity-broker keys`. */
    IDENTITY_BROKER_KEYS: v.string(),
    /** The issuer URL, which the stack sets. Without it, the deployment's own convex.site URL. */
    ISSUER: v.optional(v.string()),
    /**
     * The operator's private Google OAuth client, the connector `google`: samebase.com and the apps
     * the admin grants it to. Its redirect URIs include `<issuer>/connectors/google/callback`. The
     * stack hands both to the deployment.
     */
    GOOGLE_CLIENT_ID: v.string(),
    GOOGLE_CLIENT_SECRET: v.string(),
    /**
     * The operator's private GitHub OAuth App, "Samebase Account", the connector `github`, whose
     * callback is `<issuer>/connectors/github/callback`. The stack hands both to the deployment.
     * Named with the AUTH_ prefix: GitHub reserves GITHUB_ for its own secrets and variables.
     */
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    /** OAuth applications whose fixed callbacks are at this hub's /connections/<name>/callback. */
    PROVIDER_CONVEX_OAUTH_CLIENT_ID: v.string(),
    PROVIDER_CONVEX_OAUTH_CLIENT_SECRET: v.string(),
    PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID: v.string(),
    PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET: v.string(),
    /** The team's GitHub App, not the GitHub login OAuth App above. */
    PROVIDER_GITHUB_APP_CLIENT_ID: v.string(),
    PROVIDER_GITHUB_APP_CLIENT_SECRET: v.string(),
    /**
     * `true` pauses every app but samebase.com's production: no registration, sign-in, code
     * exchange, or provider refresh for the others (RFC 137 decision 6). The emergency brake, set
     * by hand on the deployment.
     */
    APPS_PAUSED: v.optional(v.string()),
    /**
     * The key of the moderation endpoints under `/moderation`, which samebase.com's admin page holds:
     * it reads registration counts, clients, blocks, exemptions from the sign-in page, and
     * connector grants, sets blocks, exemptions, and grants, and deletes clients, and nothing else.
     * Set by hand on both deployments. Unset or empty: every moderation request is refused.
     */
    IDENTITY_HUB_MODERATION_KEY: v.optional(v.string()),
  },
});

app.use(identityBroker);

export default app;
