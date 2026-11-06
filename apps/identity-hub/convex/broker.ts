import { defineIdentityBroker } from "@samebase/identity-broker";
import { components } from "./_generated/api";
import { env } from "./_generated/server";
import { APPS_CONNECTOR, connectors } from "./connectors";
import { resources } from "./resources";

/**
 * Host-only by default: the deployment's own convex.site URL. A custom domain changes the issuer
 * that every consuming app names, so ISSUER is set before the first app registers.
 */
export const issuer = env.ISSUER ?? env.CONVEX_SITE_URL;

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  issuer,
  keys: () => env.IDENTITY_BROKER_KEYS,
  connectors,
  resources,
  // `POST /hub-clients` creates every client, `/moderation/*` serves samebase.com's admin page.
  registration: {
    ownRepositoryIds: () => env.OWN_REPOSITORY_IDS,
    thirdPartyConnector: APPS_CONNECTOR,
    paused: () => env.THIRD_PARTY_PAUSED === "true",
    moderationKey: () => env.HUB_MODERATION_KEY,
    terms: "https://samebase.com/terms",
  },
});
