// The connector constructors, which the main export names `Connectors`.
import { githubIdentity } from "./github.ts";
import type { ClientSecrets, ConnectorSpec, OauthConnector } from "./types.ts";

/**
 * Google as an OIDC connector: discovery and id_token claims. Google documents no `login` value
 * for `prompt`, only `none`, `consent`, and `select_account`, so a fresh login through it answers
 * `login_required`. Its name is `google` unless `name` sets another.
 */
export const google = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & { readonly name?: string; readonly selectAccount?: boolean },
): ConnectorSpec<R1 | R2> => ({
  kind: "oidc",
  provider: "google",
  name: options.name ?? "google",
  label: "Google",
  issuer: "https://accounts.google.com",
  scopes: ["openid", "email", "profile"],
  promptLogin: false,
  selectAccount: options.selectAccount ?? true,
  clientId: options.clientId,
  clientSecret: options.clientSecret,
});

/**
 * GitHub as an OAuth connector. The callback must be registered on the OAuth App or GitHub App.
 * `selectAccount` sends `prompt=select_account`: GitHub then shows its account picker on each
 * sign-in, also to a user who authorized the app before and has one account signed in, in place of
 * passing the user through with no click. Its name is `github` unless `name` sets another.
 */
export const github = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & { readonly name?: string; readonly selectAccount?: boolean },
): ConnectorSpec<R1 | R2> => ({
  kind: "oauth",
  provider: "github",
  name: options.name ?? "github",
  label: "GitHub",
  // GitHub publishes RFC 8414 metadata for this issuer and sends it as `iss` on its
  // authorization response (RFC 9207).
  issuer: "https://github.com/login/oauth",
  scopes: ["read:user", "user:email"],
  identity: githubIdentity,
  selectAccount: options.selectAccount ?? true,
  clientId: options.clientId,
  clientSecret: options.clientSecret,
});

/**
 * Any OpenID Connect provider found through discovery. Set `promptLogin` only when the provider
 * documents `prompt=login`.
 */
export const oidc = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & {
    readonly name: string;
    readonly label: string;
    readonly issuer: string;
    readonly provider?: string;
    readonly scopes?: ReadonlyArray<string>;
    readonly promptLogin?: boolean;
    readonly selectAccount?: boolean;
  },
): ConnectorSpec<R1 | R2> => ({
  kind: "oidc",
  provider: options.provider ?? options.name,
  name: options.name,
  label: options.label,
  issuer: options.issuer,
  scopes: [...(options.scopes ?? ["openid", "email", "profile"])],
  promptLogin: options.promptLogin ?? false,
  selectAccount: options.selectAccount ?? true,
  clientId: options.clientId,
  clientSecret: options.clientSecret,
});

/**
 * A plain OAuth 2.0 provider found through its RFC 8414 metadata, whose `identity` reads the user
 * with the access token. `selectAccount` is off unless set: such a server may not know `prompt`.
 */
export const oauth = <R1 = never, R2 = never>(
  options: ClientSecrets<R1, R2> & {
    readonly name: string;
    readonly label: string;
    readonly issuer: string;
    readonly scopes: ReadonlyArray<string>;
    readonly identity: OauthConnector["identity"];
    readonly provider?: string;
    readonly selectAccount?: boolean;
  },
): ConnectorSpec<R1 | R2> => ({
  kind: "oauth",
  provider: options.provider ?? options.name,
  name: options.name,
  label: options.label,
  issuer: options.issuer,
  scopes: [...options.scopes],
  identity: options.identity,
  selectAccount: options.selectAccount ?? false,
  clientId: options.clientId,
  clientSecret: options.clientSecret,
});
