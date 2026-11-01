import identityBroker from "@samebase/identity-broker/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// A push fails while a required variable is missing. scripts/check-keys.ts checks
// IDENTITY_BROKER_KEYS before each deploy and scripts/init-keys.ts creates it once by hand; the
// stack hands the Google variables to the deployment.
const app = defineApp({
  env: {
    /** The key set and the pairwise salt: `npx identity-broker keys`. */
    IDENTITY_BROKER_KEYS: v.string(),
    /** The issuer URL, which the stack sets. Without it, the deployment's own convex.site URL. */
    ISSUER: v.optional(v.string()),
    /**
     * The Google OAuth client of the team, whose redirect URIs include
     * `<issuer>/connectors/google/callback`. The stack hands both to the deployment.
     */
    GOOGLE_CLIENT_ID: v.string(),
    GOOGLE_CLIENT_SECRET: v.string(),
    /**
     * The Google OAuth client of third-party apps, whose redirect URIs include
     * `<issuer>/connectors/google-apps/callback`. The stack hands both to the deployment.
     */
    GOOGLE_APPS_CLIENT_ID: v.string(),
    GOOGLE_APPS_CLIENT_SECRET: v.string(),
    /**
     * The team's GitHub login OAuth App, which lists `<issuer>/connectors/github/callback` among
     * its redirect URIs. The stack hands both to the deployment.
     * Named with the AUTH_ prefix: GitHub reserves GITHUB_ for its own secrets and variables.
     */
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    /**
     * The initial access token of client registration (RFC 7591), set by hand on the deployment.
     * Without it, `/register` refuses every request.
     */
    REGISTRATION_ACCESS_TOKEN: v.optional(v.string()),
    /** `true` stops sign-in and registration for every app from `/register`: the emergency brake. */
    THIRD_PARTY_PAUSED: v.optional(v.string()),
  },
});

app.use(identityBroker);

export default app;
