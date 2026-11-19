import type { Redacted } from "effect";
import type { OidcConnector } from "./types.ts";

type GoogleCredentials = {
  clientId: Redacted.Redacted<string>;
  clientSecret: Redacted.Redacted<string>;
  selectAccount?: boolean;
  name?: string;
};

/**
 * Google as an OIDC connector: discovery and id_token claims. Google documents no `login` value
 * for `prompt`, only `none`, `consent`, and `select_account`, so a fresh login through it answers
 * `login_required`. Its name is `google` unless `name` sets another.
 */
export function google(credentials: GoogleCredentials): OidcConnector {
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
