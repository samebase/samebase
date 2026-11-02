import {
  cloudflareConnection,
  convexConnection,
  githubConnection,
} from "@samebase/identity-broker";
import { env } from "./_generated/server";

/** API authorization for the team's apps. These providers do not sign users in. */
export const resources = [
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
];
