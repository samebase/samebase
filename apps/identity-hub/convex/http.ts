import { defineIdentityBroker } from "@samebase/identity-broker";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { env } from "./_generated/server";
import { connectors } from "./connectors";

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  // Host-only by default: the deployment's own convex.site URL. A custom domain changes the issuer
  // that every consuming app names, so ISSUER is set before the first app registers.
  issuer: env.ISSUER ?? env.CONVEX_SITE_URL,
  keys: () => env.IDENTITY_BROKER_KEYS,
  connectors,
  registration: {
    initialAccessToken: () => env.REGISTRATION_ACCESS_TOKEN,
    connector: "google-apps",
    paused: () => env.THIRD_PARTY_PAUSED === "true",
  },
});

const http = httpRouter();
broker.addHttpRoutes(http);

export default http;
