import { github, google } from "@samebase/identity-broker";
import { env } from "./_generated/server";

/**
 * The connectors this hub offers, two per provider (RFC 137 decision 3). `google` and `github` are
 * the operator's private clients: samebase.com's own sign-in, and the apps that the admin grants
 * them to on samebase.com's admin page. `google-apps` and `github-apps` are the public clients
 * named "Samebase", for every app. The policy in `broker.ts` gives the public pair to every
 * registration and all four to the operator. A user's `sub` comes from the provider, so it is
 * `google:<id>` or `github:<id>` through either client of a provider.
 *
 * Each one asks the provider for its account screen on every sign-in: an earlier app of this hub
 * must not pass a user through to another app with no click. Add a provider by appending its
 * wrapper, with the credentials read from the deployment's env, and register
 * `<issuer>/connectors/<name>/callback` with it. The list keeps each connector's name as a literal
 * type, so the policy in `broker.ts` can name only these four.
 */
export const connectors = [
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
  google({
    name: "google-apps",
    clientId: () => env.GOOGLE_APPS_CLIENT_ID,
    clientSecret: () => env.GOOGLE_APPS_CLIENT_SECRET,
    selectAccount: true,
  }),
  github({
    name: "github-apps",
    clientId: () => env.AUTH_GITHUB_APPS_CLIENT_ID,
    clientSecret: () => env.AUTH_GITHUB_APPS_CLIENT_SECRET,
    selectAccount: true,
  }),
];
