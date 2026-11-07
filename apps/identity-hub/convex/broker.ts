import { defineIdentityBroker, type Registration } from "@samebase/identity-broker";
import { components } from "./_generated/api";
import { env } from "./_generated/server";
import { connectors } from "./connectors";
import { resources } from "./resources";

/**
 * Host-only by default: the deployment's own convex.site URL. A custom domain changes the issuer
 * that every consuming app names, so ISSUER is set before the first app registers.
 */
export const issuer = env.ISSUER ?? env.CONVEX_SITE_URL;

/** samebase/samebase and the samebase organization: public ids. */
const SAMEBASE_REPOSITORY_ID = "1021726325";
const SAMEBASE_OWNER_ID = "285392744";

/**
 * The owner id is checked with the repository id: a transferred repository keeps its numeric id,
 * and the stale-proof rule stops only a replay of the old owner, not the new owner's forward claim.
 */
const samebase = (registration: Registration) =>
  registration.repositoryId === SAMEBASE_REPOSITORY_ID &&
  registration.ownerId === SAMEBASE_OWNER_ID;

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  issuer,
  keys: () => env.IDENTITY_BROKER_KEYS,
  connectors,
  resources,
  // `POST /hub-clients` creates every client, `/moderation/*` serves samebase.com's admin page.
  registration: {
    name: "Samebase",
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
    moderationKey: () => env.HUB_MODERATION_KEY,
    // The policy of RFC 137 decision 9.
    policy: (registration) => ({
      connectors: ["google", "github"],
      // The app that holds users' Cloudflare, Convex, and GitHub connections, proven by the
      // samebase repository and owner. Its sign-in app and every other app get none.
      resources:
        samebase(registration) && registration.app === "samebase-connections"
          ? ["convex", "cloudflare", "github"]
          : [],
      // The page names the app that gets the user, because Google's and GitHub's screens name only
      // Samebase. samebase.com's production is Samebase, so it goes straight to the connector that
      // its button named. Its previews and development servers keep the page, as every other app.
      // The exemptions that samebase.com's admin page sets at `/moderation/sign-in-page`, for one
      // app or for every app, are applied by the broker on top of this answer.
      consent: !(samebase(registration) && registration.deploymentType === "production"),
      // samebase.com's production keeps running; its previews and development servers feel the
      // pause as a stranger's app does.
      paused:
        env.APPS_PAUSED === "true" &&
        !(samebase(registration) && registration.deploymentType === "production"),
    }),
  },
});
