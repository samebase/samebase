import {
  cloudflareConnection,
  convexConnection,
  defineIdentityBroker,
  github,
  githubConnection,
  google,
  type Registration,
} from "@samebase/identity-broker";
import { components } from "./_generated/api";
import { env } from "./_generated/server";

// The whole hub: its connectors, its API resources, its policy, and its admin functions. Copy this
// folder and change this file and `alchemy.run.ts` to run another hub. `http.ts` mounts the routes,
// `crons.ts` runs the cleanup, and `convex.config.ts` declares the env.

/**
 * Host-only by default: the deployment's own convex.site URL. A custom domain changes the issuer
 * that every consuming app names, so ISSUER is set before the first app registers.
 */
export const issuer = env.ISSUER ?? env.CONVEX_SITE_URL;

/** samebase/samebase and the samebase organization: public ids. */
const SAMEBASE_REPOSITORY_ID = "1021726325";
const SAMEBASE_OWNER_ID = "285392744";

/**
 * The operator: samebase/samebase, the repository of samebase.com and of this hub, under the
 * samebase organization. The owner id is checked with the repository id: a transferred repository
 * keeps its numeric id, and the stale-proof rule stops only a replay of the old owner, not the new
 * owner's forward claim.
 */
const samebase = (registration: Registration) =>
  registration.repositoryId === SAMEBASE_REPOSITORY_ID &&
  registration.ownerId === SAMEBASE_OWNER_ID;

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  issuer,
  keys: () => env.IDENTITY_BROKER_KEYS,
  // The operator's private clients: samebase.com's own sign-in, and the repositories that the admin
  // grants them to on samebase.com's admin page. Every other app signs in at the public hub,
  // id.samebase.com (samebase/identity-hub). A user's `sub` comes from the provider, `google:<id>`
  // or `github:<id>`, the same at both hubs. Each one asks the provider for its account screen on
  // every sign-in: an earlier app of this hub must not pass a user through to another app with no
  // click. Add a provider by appending its wrapper, with the credentials read from the deployment's
  // env, and register `<issuer>/connectors/<name>/callback` with it. The policy below can name only
  // these connectors: a misspelt one does not compile.
  connectors: [
    google({
      clientId: () => env.GOOGLE_CLIENT_ID,
      clientSecret: () => env.GOOGLE_CLIENT_SECRET,
      selectAccount: true,
    }),
    github({
      clientId: () => env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: () => env.AUTH_GITHUB_CLIENT_SECRET,
      selectAccount: true,
    }),
  ],
  // API authorization for the operator's apps. These providers do not sign users in.
  resources: [
    convexConnection({
      clientId: () => env.PROVIDER_CONVEX_OAUTH_CLIENT_ID,
      clientSecret: () => env.PROVIDER_CONVEX_OAUTH_CLIENT_SECRET,
    }),
    cloudflareConnection({
      clientId: () => env.PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID,
      clientSecret: () => env.PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET,
    }),
    githubConnection({
      clientId: () => env.PROVIDER_GITHUB_APP_CLIENT_ID,
      clientSecret: () => env.PROVIDER_GITHUB_APP_CLIENT_SECRET,
    }),
  ],
  // `POST /hub-clients` creates every client, `/moderation/*` serves samebase.com's admin page.
  registration: {
    name: "Samebase",
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
    moderationKey: () => env.IDENTITY_HUB_MODERATION_KEY,
    // The policy of RFC 137 decision 9.
    policy: (registration) => ({
      // The operator gets both connectors in code, so no admin mistake can lock samebase.com out.
      // Every other repository gets none, so it cannot register, unless the admin grants it one on
      // samebase.com's admin page and the broker adds it (RFC 137 decision 10).
      connectors: samebase(registration) ? ["google", "github"] : [],
      // The app that holds users' Cloudflare, Convex, and GitHub connections, proven by the
      // samebase repository and owner. Its sign-in app and every other app get none.
      resources:
        samebase(registration) && registration.app === "samebase-connections"
          ? ["convex", "cloudflare", "github"]
          : [],
      // samebase.com's production keeps running; its previews and development servers feel the
      // pause as a stranger's app does.
      paused:
        env.APPS_PAUSED === "true" &&
        !(samebase(registration) && registration.deploymentType === "production"),
    }),
  },
});

// Administration for `npx convex run --prod broker:<name>`:
//   listApps, listClients '{"appId":"..."}', deleteClient '{"clientId":"..."}', deleteApp '{"appId":"..."}'
// Every client comes from the broker's `POST /hub-clients`. Block repository and Block owner on
// samebase.com's admin page stop a tenant. `crons.ts` runs `cleanup` daily.
export const { deleteApp, listApps, listClients, deleteClient, cleanup } = broker.admin();
