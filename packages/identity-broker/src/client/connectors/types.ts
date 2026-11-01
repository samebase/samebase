/** What a connector attested about the user. `upstreamId` is the connector's stable account id. */
export type UpstreamIdentity = {
  upstreamId: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

type Credentials = {
  /** Read lazily, in the request, so a missing env var fails that request and not the deploy. */
  clientId: () => string;
  clientSecret: () => string;
  /**
   * Only an app from `/register` can start this connector, and the chooser never lists it. It keeps
   * a client that strangers' apps share away from the host's own apps.
   */
  reserved?: boolean;
};

/**
 * A plain OAuth 2.0 provider found through its RFC 8414 metadata: identity comes from an API call
 * with the access token.
 */
export type OauthConnector = Credentials & {
  kind: "oauth";
  name: string;
  /** Shown on the chooser button, e.g. "GitHub". */
  label: string;
  issuer: string;
  scopes: string[];
  identity: (accessToken: string) => Promise<UpstreamIdentity>;
};

/** An OpenID Connect provider found through discovery: identity comes from the id_token. */
export type OidcConnector = Credentials & {
  kind: "oidc";
  name: string;
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

export type Connector = OauthConnector | OidcConnector;
