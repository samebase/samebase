import { github, google, type Connector } from "@samebase/identity-broker";
import { env } from "./_generated/server";

/**
 * The connectors this hub offers: the public Google client and the public GitHub OAuth App of
 * Samebase, which every app of the hub shares (RFC 137). The policy in `broker.ts` decides which
 * ones a registration may enroll in. Add a provider by appending its wrapper, with the credentials
 * read from the deployment's env, and register `<issuer>/connectors/<name>/callback` with it. Any
 * other OAuth 2.0 or OpenID Connect provider is an `oauth` or `oidc` connector with its endpoints
 * copied in.
 */
export const connectors: Connector[] = [
  // Always asks Google to show the account screen: an earlier app of this hub must not pass a user
  // through to another app with no click.
  google({
    clientId: () => env.GOOGLE_CLIENT_ID,
    clientSecret: () => env.GOOGLE_CLIENT_SECRET,
    selectAccount: true,
  }),
  github({
    clientId: () => env.AUTH_GITHUB_CLIENT_ID,
    clientSecret: () => env.AUTH_GITHUB_CLIENT_SECRET,
  }),
];
