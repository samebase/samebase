import type { OidcConnector } from "./types.js";

type GoogleCredentials = {
  clientId: () => string;
  clientSecret: () => string;
  selectAccount?: boolean;
};

/**
 * Google as an OIDC connector: discovery and id_token claims. Google documents no `login` value
 * for `prompt`, only `none`, `consent`, and `select_account`, so a fresh login through it answers
 * `login_required`. Its name is `google` unless `name` sets another, and the type carries it.
 */
export function google(credentials: GoogleCredentials): OidcConnector<"google">;
export function google<const Name extends string>(
  credentials: GoogleCredentials & { name: Name },
): OidcConnector<Name>;
export function google(credentials: GoogleCredentials & { name?: string }): OidcConnector {
  return {
    kind: "oidc",
    provider: "google",
    name: credentials.name ?? "google",
    label: "Google",
    issuer: "https://accounts.google.com",
    scopes: ["openid", "email", "profile"],
    promptLogin: false,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    ...(credentials.selectAccount === undefined
      ? {}
      : { selectAccount: credentials.selectAccount }),
  };
}
