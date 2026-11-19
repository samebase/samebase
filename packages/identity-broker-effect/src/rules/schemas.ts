// The argument and result schemas of the commands. Plain JSON on both sides of the boundary.
import { Schema } from "effect";
import {
  DeploymentType,
  RateLimitScope,
  RegisteredBy,
  TokenEndpointAuthMethod,
  UpstreamIdentity,
} from "../store/tables.ts";

const Str = Schema.String;
const Num = Schema.Finite;
const Bool = Schema.Boolean;
const Strs = Schema.Array(Str);
const opt = Schema.optionalKey;

/**
 * What the host decided for one request. `ownerId` is the tenant owner the policy decided on;
 * absent for a host without hub mode. `connectors` is what the client may use now under the
 * policy; `configured` is the host's configured connectors, the only ones a grant can open.
 */
export const PolicyDecision = Schema.Struct({
  ownerId: opt(Str),
  paused: Bool,
  connectors: Strs,
  configured: Strs,
});
export type PolicyDecision = typeof PolicyDecision.Type;

/** Where the user goes back to once a request fails or finishes: the client's exact redirect URI. */
const returnFields = { redirectUri: Str, state: opt(Str) };
export const Return = Schema.Struct(returnFields);

export const TransitionResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), ...returnFields }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["expired", "wrong_status", "refused"]),
    ...returnFields,
  }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("not_found") }),
]);
export type TransitionResult = typeof TransitionResult.Type;

const clientFields = {
  clientId: Str,
  appId: Str,
  secretHash: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  redirectUris: Strs,
  deploymentType: DeploymentType,
  clientName: Str,
  softwareVersion: Str,
  createdAt: Num,
  lastSignInAt: opt(Num),
  registrationTokenHash: Str,
  removeAt: opt(Num),
  renewedAt: Num,
  app: Str,
  registeredBy: RegisteredBy,
  connectors: Strs,
};
export const Client = Schema.Struct(clientFields);

/** An app row with what `/authorize` and `/continue` need to know about its tenant. */
export const AppView = Schema.Struct({
  appId: Str,
  name: Str,
  tenantId: Str,
  /** The host blocked the tenant of the app, or its owner. */
  suspended: Bool,
  createdAt: Num,
});

/** The facts of a client that the host's policy decides on. */
export const Registration = Schema.Struct({
  repositoryId: Str,
  repository: Str,
  ownerId: Str,
  app: Str,
  deploymentType: DeploymentType,
  redirectUris: Strs,
  proof: Schema.Literals(["github-actions", "initial-access-token"]),
});

const clientWithAppFields = {
  client: Client,
  app: Schema.NullOr(AppView),
  registration: Schema.NullOr(Registration),
  granted: Strs,
};
export const ClientWithApp = Schema.Struct(clientWithAppFields);
export type ClientWithApp = typeof ClientWithApp.Type;

/** Which exemptions from the sign-in page cover a client. */
export const Exemption = Schema.Struct({ everyApp: Bool, repository: Bool });

// authRequests

export const CreateArgs = Schema.Struct({
  /** The tenant of the app, whose budget this request spends. */
  tenantId: Str,
  requestId: Str,
  appId: Str,
  clientId: Str,
  redirectUri: Str,
  scope: Str,
  state: opt(Str),
  nonce: opt(Str),
  codeChallenge: Str,
  /** The set the caller would offer, from its snapshot of the client's facts and grants. */
  connectors: Strs,
  policy: PolicyDecision,
  freshLogin: Bool,
  txnCookieHash: Str,
  createdAt: Num,
  expiresAt: Num,
});
export const CreateResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), connectors: Strs }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["rate_limited", "suspended", "off"]),
  }),
]);

export const RequestIdArgs = Schema.Struct({ requestId: Str });

/** What the continue handler reads of a request: no upstream state, verifier or identity. */
export const GetResult = Schema.NullOr(
  Schema.Struct({
    requestId: Str,
    status: Schema.Literals(["pending", "upstream", "claimed", "completed"]),
    clientId: Str,
    redirectUri: Str,
    state: opt(Str),
    connectors: Strs,
    freshLogin: Bool,
    txnCookieHash: Str,
  }),
);

export const StartUpstreamArgs = Schema.Struct({
  requestId: Str,
  connector: Str,
  upstreamStateHash: Str,
  upstreamCodeVerifier: Str,
  upstreamNonce: opt(Str),
  policy: PolicyDecision,
  now: Num,
});

export const UpstreamClientArgs = Schema.Struct({ upstreamStateHash: Str });
export const UpstreamClientResult = Schema.NullOr(
  Schema.Struct({
    request: Schema.Struct({ requestId: Str, txnCookieHash: Str, ...returnFields }),
    client: Schema.NullOr(ClientWithApp),
  }),
);

export const ClaimUpstreamArgs = Schema.Struct({
  upstreamStateHash: Str,
  connector: Str,
  /** SHA-256 hex of each transaction cookie the callback request carried. */
  txnCookieHashes: Strs,
  policy: PolicyDecision,
  now: Num,
});
export const ClaimResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("claimed"),
    requestId: Str,
    connector: Str,
    upstreamCodeVerifier: Str,
    upstreamNonce: opt(Str),
    freshLogin: Bool,
    /** When /authorize stored the request: an upstream `auth_time` before it is an old session. */
    createdAt: Num,
    ...returnFields,
  }),
  Schema.Struct({ status: Schema.Literal("expired"), requestId: Str, ...returnFields }),
  /** The policy stops the sign-in now; the request is deleted. */
  Schema.Struct({ status: Schema.Literal("refused"), requestId: Str, ...returnFields }),
  Schema.Struct({ status: Schema.Literal("unbound") }),
  Schema.Struct({ status: Schema.Literal("missing") }),
]);
export type ClaimResult = typeof ClaimResult.Type;

export const CompleteArgs = Schema.Struct({
  requestId: Str,
  identity: UpstreamIdentity,
  authTime: Num,
  codeHash: Str,
  codeExpiresAt: Num,
  policy: PolicyDecision,
  now: Num,
});

export const AbandonResult = Schema.NullOr(Return);

export const ExchangeCodeArgs = Schema.Struct({
  clientId: Str,
  /** SHA-256 hex of the client secret the token request carried. */
  clientSecretHash: Str,
  /** How the token request carried the credentials; it must be the method the client registered. */
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  codeHash: Str,
  /** The address the token request names, which must be the one the authorization request named. */
  redirectUri: Str,
  /** The S256 challenge of the submitted `code_verifier`, computed by the core. */
  codeChallengeOfVerifier: Str,
  /** The `resource` parameter of the token request. A sign-in code grants none. */
  resource: opt(Str),
  policy: PolicyDecision,
  now: Num,
});
export const ExchangeResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    appId: Str,
    clientId: Str,
    scope: Str,
    nonce: opt(Str),
    identity: UpstreamIdentity,
    /** Only for a request that asked for a fresh login: the provider's time of that login. */
    authTime: opt(Num),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_client", "invalid_grant", "invalid_target"]),
    description: Str,
  }),
]);
export type ExchangeResult = typeof ExchangeResult.Type;

// clients

export const ClientIdArgs = Schema.Struct({ clientId: Str });
export const ClientResult = Schema.NullOr(Client);
export const WithAppResult = Schema.NullOr(ClientWithApp);
export const ForAuthorizeResult = Schema.NullOr(
  Schema.Struct({ ...clientWithAppFields, exemption: Exemption }),
);

// connectorGrants

export const ForRegistrationArgs = Schema.Struct({
  githubRepositoryDatabaseId: Str,
  githubOwnerId: Str,
});
export const ForRegistrationResult = Strs;

// hubClients

export const AdmitArgs = Schema.Struct({ githubRepositoryDatabaseId: Str, githubOwnerId: Str });
export const AdmitResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("admitted") }),
  Schema.Struct({ status: Schema.Literal("blocked") }),
  Schema.Struct({ status: Schema.Literal("rate_limited"), window: RateLimitScope }),
]);

const Refusal = Schema.Literals([
  "blocked",
  "suspended",
  "too_many_apps",
  "too_many_clients",
  "app_taken",
]);

/** A created client, with what the registration answer says about it and the request did not. */
const Created = Schema.Struct({
  ok: Schema.Literal(true),
  createdAt: Num,
  clientName: Str,
  /** The first part of the answer's full `software_id`, `<tenant id>/<app name>`. */
  tenantId: Str,
});

/** An enrollment outside what the policy gives and what the repository is granted. */
const InvalidConnectors = Schema.Struct({
  ok: Schema.Literal(false),
  reason: Schema.Literal("invalid_connectors"),
  allowed: Strs,
});

const credentialHashes = { clientId: Str, secretHash: Str, registrationTokenHash: Str };

export const CreateClientArgs = Schema.Struct({
  ...credentialHashes,
  githubRepositoryDatabaseId: Str,
  githubOwnerId: Str,
  githubRepository: Str,
  githubActorId: Str,
  githubActorLogin: Str,
  commitSha: Str,
  /** The `iat` of GitHub's OIDC token, in seconds. */
  proofIssuedAt: Num,
  deployment: Schema.Union([
    Schema.Struct({ type: Schema.Literal("production"), initialAccessTokenHash: Str }),
    Schema.Struct({ type: Schema.Literal("preview"), stage: Str }),
  ]),
  /** The enrollment, checked by the host against its connectors, its policy, and the grants. */
  connectors: Strs,
  /** The hub's connectors that the policy gives this registration; grants are read here. */
  policyConnectors: Strs,
  /** The hub's configured connectors, the only ones a grant can open. */
  configuredConnectors: Strs,
  app: Str,
  /** The app id of `app` in the repository's tenant, computed by the core. */
  appId: Str,
  /** The return addresses, each checked by the host. */
  redirectUris: Strs,
  softwareVersion: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
});
export const CreateClientResult = Schema.Union([
  Created,
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: Schema.Union([Refusal, Schema.Literals(["stale_proof", "new_owners"])]),
  }),
  InvalidConnectors,
]);

export const ReadInitialAccessTokenArgs = Schema.Struct({ tokenHash: Str });
export const ReadInitialAccessTokenResult = Schema.NullOr(
  Schema.Struct({
    githubRepositoryDatabaseId: Str,
    githubOwnerId: Str,
    githubRepository: Str,
    app: Str,
  }),
);

export const CreateDevelopmentClientArgs = Schema.Struct({
  ...credentialHashes,
  tokenHash: Str,
  /** The token's row as the host read it: the facts its policy decided on. */
  githubRepositoryDatabaseId: Str,
  githubOwnerId: Str,
  githubRepository: Str,
  app: Str,
  /** The app id of `app` in the tenant of `githubRepositoryDatabaseId`, computed by the core. */
  appId: Str,
  connectors: Strs,
  policyConnectors: Strs,
  configuredConnectors: Strs,
  redirectUris: Strs,
  softwareVersion: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
});
export const CreateDevelopmentClientResult = Schema.Union([
  Created,
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: Schema.Union([Refusal, Schema.Literal("invalid_token")]),
  }),
  InvalidConnectors,
]);

// registration

export const RenewArgs = Schema.Struct({ clientId: Str, registrationTokenHash: Str, now: Num });
export const RenewResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    redirectUris: Strs,
    clientName: Str,
    softwareVersion: Str,
    tokenEndpointAuthMethod: TokenEndpointAuthMethod,
    app: Str,
    /** The tenant of the client's app: with `app`, the read's full `software_id`. */
    tenantId: Str,
    createdAt: Num,
    connectors: Strs,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "suspended"]),
  }),
]);

export const RemoveArgs = Schema.Struct({ clientId: Str, registrationTokenHash: Str });
export const RemoveResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "production"]),
  }),
]);

// signIns

export const RecordArgs = Schema.Struct({
  appId: Str,
  clientId: Str,
  connector: Str,
  sub: Str,
  at: Num,
});

// lifecycle

export const CleanupArgs = Schema.Struct({
  now: Num,
  /** Absent: preview clients are never deleted for being idle. */
  previewClientMaxAgeMs: opt(Num),
  signInRetentionMs: Num,
});
export const CleanupResult = Schema.Struct({
  authRequests: Num,
  authorizationCodes: Num,
  previewClients: Num,
  expiredClients: Num,
  signIns: Num,
  /** A category filled its batch: call again with the same arguments. */
  more: Bool,
});
