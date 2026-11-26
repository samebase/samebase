import type { Effect, Redacted } from "effect";

/** What a connector attested about the user. `upstreamId` is the connector's stable account id. */
export type UpstreamIdentity = {
  upstreamId: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

type Credentials = {
  /**
   * The provider whose accounts the connector signs in, such as `google`: lowercase letters, digits,
   * and hyphens. Every `sub` the connector makes is `<provider>:<upstreamId>`, so two connectors of
   * one provider, such as two Google clients, give one account the same `sub`.
   */
  provider: string;
  /** Redacted, so a log line or an error that holds the connector does not print them. */
  clientId: Redacted.Redacted<string>;
  clientSecret: Redacted.Redacted<string>;
  /** How the hub authenticates at the provider's token endpoint. Default: `client_secret_post`. */
  tokenEndpointAuthMethod?: "client_secret_post" | "client_secret_basic";
};

/**
 * A plain OAuth 2.0 provider found through its RFC 8414 metadata: identity comes from an API call
 * with the access token.
 */
/** `Name` is the connector's name as a literal type. */
export type OauthConnector<Name extends string = string> = Credentials & {
  kind: "oauth";
  name: Name;
  /** Shown on the chooser button, e.g. "GitHub". */
  label: string;
  issuer: string;
  scopes: string[];
  /** `fetch` is the core's `Fetch` service. */
  identity: (
    accessToken: string,
    fetch: (request: Request) => Promise<Response>,
  ) => Promise<UpstreamIdentity>;
  /**
   * Sends `prompt=select_account`, so the provider shows its account screen on each sign-in, as
   * for an OIDC connector. GitHub documents it for OAuth Apps (changelog 2024-06-07).
   */
  selectAccount?: boolean;
};

/** An OpenID Connect provider found through discovery: identity comes from the id_token. */
export type OidcConnector<Name extends string = string> = Credentials & {
  kind: "oidc";
  name: Name;
  label: string;
  issuer: string;
  scopes: string[];
  /**
   * The provider documents `prompt=login`, so a fresh login (`prompt=login` or `max_age`) is sent
   * upstream as that. Without it, a fresh login answers `login_required`.
   */
  promptLogin: boolean;
  /**
   * Sends `prompt=select_account`, so the provider shows its account screen on each sign-in and
   * cannot pass a user through with no click because an earlier app of this hub was approved.
   */
  selectAccount?: boolean;
};

export type Connector<Name extends string = string> = OauthConnector<Name> | OidcConnector<Name>;

/** A secret of the hub: a `Config`, or another Effect such as a Secrets Store read. */
export type Secret<R = never> = Effect.Effect<Redacted.Redacted<string>, unknown, R>;

/** The hub's client at one provider, each secret an Effect that the hub reads when it builds. */
export type ClientSecrets<R1 = never, R2 = R1> = {
  readonly clientId: Secret<R1>;
  readonly clientSecret: Secret<R2>;
};

/** The services that the secrets of `Spec` need. */
export type SecretServices<Spec> = Spec extends ClientSecrets<infer A, infer B> ? A | B : never;

/** A connector as `hub` takes it: what the hub checks at its start, and its two secrets unread. */
export type ConnectorSpec<R = never> =
  | (Omit<OauthConnector, "clientId" | "clientSecret"> & ClientSecrets<R>)
  | (Omit<OidcConnector, "clientId" | "clientSecret"> & ClientSecrets<R>);
