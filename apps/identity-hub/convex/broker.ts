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

/** `THIRD_PARTY_PAUSED=true`: no third-party app registers or signs in. */
export function isPaused() {
  return env.THIRD_PARTY_PAUSED === "true";
}

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  issuer,
  keys: () => env.IDENTITY_BROKER_KEYS,
  connectors,
  resources,
  // No `initialAccessToken`: `POST /hub-clients` creates every third-party client, so the broker
  // serves no `/register` and no `/tenant-connection`, only each client's own record.
  registration: {
    connector: APPS_CONNECTOR,
    paused: isPaused,
  },
});
