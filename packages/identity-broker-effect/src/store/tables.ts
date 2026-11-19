// The tables of the broker, declared once as data: an Effect Schema for each document and the
// indexes with their field paths and field types. The memory adapter, the SQL generator and the
// typed `Tx` all read this one declaration.
import { Schema } from "effect";

/** A stored number. JSON has no NaN or infinity, so a stored number is finite. */
const Num = Schema.Finite;
const Str = Schema.String;
const opt = Schema.optionalKey;

/** One index field: a path into the document (`target.scope`) and its one declared type. */
export interface IndexField {
  readonly path: string;
  readonly type: "string" | "number";
}

const s = (path: string): IndexField => ({ path, type: "string" });
const n = (path: string): IndexField => ({ path, type: "number" });

export const TokenEndpointAuthMethod = Schema.Literals([
  "client_secret_post",
  "client_secret_basic",
]);

export const DeploymentType = Schema.Literals(["production", "development", "preview"]);

/** Who made a client at `POST /register`, as of that registration. */
export const RegisteredBy = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("github"),
    githubRepository: Str,
    githubOwnerId: Str,
    githubActorId: Str,
    githubActorLogin: Str,
    commitSha: Str,
  }),
  Schema.Struct({
    kind: Schema.Literal("initial_access_token"),
    githubRepository: Str,
    githubOwnerId: Str,
    issuedAt: Num,
  }),
]);

export const BlockKind = Schema.Literals(["repository", "owner"]);

export const SignInPageTarget = Schema.Union([
  Schema.Struct({ scope: Schema.Literal("every_app") }),
  Schema.Struct({ scope: Schema.Literal("repository"), tenantId: Str, ownerId: Str }),
]);

export const RateLimitScope = Schema.Literals(["repository", "owner", "new_owners"]);

/** What a connector attested about the user. */
export const UpstreamIdentity = Schema.Struct({
  connector: Str,
  upstreamId: Str,
  email: opt(Str),
  emailVerified: opt(Schema.Boolean),
  name: opt(Str),
  picture: opt(Str),
});

/** The fields every authorization request carries from `/authorize` until it is deleted. */
const authRequestFields = {
  requestId: Str,
  appId: Str,
  clientId: Str,
  redirectUri: Str,
  scope: Str,
  state: opt(Str),
  nonce: opt(Str),
  codeChallenge: Str,
  connectors: Schema.Array(Str),
  freshLogin: Schema.Boolean,
  txnCookieHash: Str,
  createdAt: Num,
  expiresAt: Num,
};

export const AuthRequest = Schema.Union([
  Schema.Struct({ status: Schema.Literal("pending"), ...authRequestFields }),
  Schema.Struct({
    status: Schema.Literal("upstream"),
    ...authRequestFields,
    connector: Str,
    upstreamStateHash: Str,
    upstreamCodeVerifier: Str,
    upstreamNonce: opt(Str),
  }),
  Schema.Struct({ status: Schema.Literal("claimed"), ...authRequestFields, connector: Str }),
  Schema.Struct({
    status: Schema.Literal("completed"),
    ...authRequestFields,
    identity: UpstreamIdentity,
    authTime: Num,
  }),
]);

export const tables = {
  apps: {
    schema: Schema.Struct({ appId: Str, name: Str, tenantId: Str, createdAt: Num }),
    indexes: { by_app_id: [s("appId")], by_tenant_id: [s("tenantId")] },
  },
  tenants: {
    schema: Schema.Struct({ tenantId: Str, ownerId: opt(Str), ownerProofIssuedAt: opt(Num) }),
    indexes: { by_tenant_id: [s("tenantId")], by_owner_id: [s("ownerId")] },
  },
  blocks: {
    schema: Schema.Struct({
      kind: BlockKind,
      githubId: Str,
      reason: Str,
      adminEmail: Str,
      at: Num,
    }),
    indexes: { by_kind_and_github_id: [s("kind"), s("githubId")], by_at: [n("at")] },
  },
  signInPageExemptions: {
    schema: Schema.Struct({ target: SignInPageTarget, reason: Str }),
    indexes: { by_target: [s("target.scope"), s("target.tenantId"), s("target.ownerId")] },
  },
  connectorGrants: {
    schema: Schema.Struct({ tenantId: Str, ownerId: Str, connector: Str, reason: Str }),
    indexes: {
      by_tenant_id_and_owner_id_and_connector: [s("tenantId"), s("ownerId"), s("connector")],
    },
  },
  /** Append-only history. Only the registration variant is written or read by the in-scope rules. */
  events: {
    schema: Schema.Struct({
      kind: Schema.Literal("registration"),
      clientId: Str,
      githubRepositoryDatabaseId: Str,
      githubOwnerId: Str,
      at: Num,
    }),
    indexes: { by_kind_and_at: [s("kind"), n("at")], by_github_owner_id: [s("githubOwnerId")] },
  },
  initialAccessTokens: {
    schema: Schema.Struct({
      tokenHash: Str,
      githubRepositoryDatabaseId: Str,
      githubOwnerId: Str,
      githubRepository: Str,
      app: Str,
      issuedAt: Num,
    }),
    indexes: {
      by_token_hash: [s("tokenHash")],
      by_repository_and_app: [s("githubRepositoryDatabaseId"), s("app")],
    },
  },
  rateLimits: {
    schema: Schema.Struct({ scope: RateLimitScope, githubId: Str, startedAt: Num, count: Num }),
    indexes: { by_scope_and_github_id: [s("scope"), s("githubId")] },
  },
  clients: {
    schema: Schema.Struct({
      clientId: Str,
      appId: Str,
      secretHash: Str,
      tokenEndpointAuthMethod: TokenEndpointAuthMethod,
      redirectUris: Schema.Array(Str),
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
      connectors: Schema.Array(Str),
    }),
    indexes: {
      by_client_id: [s("clientId")],
      by_app_id: [s("appId")],
      by_app_id_and_deployment_type: [s("appId"), s("deploymentType")],
      by_deployment_type_and_activity: [s("deploymentType"), n("lastSignInAt"), n("createdAt")],
      by_remove_at: [n("removeAt")],
    },
  },
  authRequests: {
    schema: AuthRequest,
    indexes: {
      by_request_id: [s("requestId")],
      by_upstream_state_hash: [s("upstreamStateHash")],
      by_expires_at: [n("expiresAt")],
    },
  },
  /** A code links to its request by the request's `requestId`, found by `by_request_id`. */
  authorizationCodes: {
    schema: Schema.Struct({
      codeHash: Str,
      requestId: Str,
      clientId: Str,
      expiresAt: Num,
      usedAt: opt(Num),
    }),
    indexes: { by_code_hash: [s("codeHash")], by_expires_at: [n("expiresAt")] },
  },
  signIns: {
    schema: Schema.Struct({ appId: Str, clientId: Str, connector: Str, sub: Str, at: Num }),
    indexes: { by_app_id_and_at: [s("appId"), n("at")], by_at: [n("at")] },
  },
  /** The sign-in token bucket of one tenant: `tokens` as of `at` (milliseconds). */
  signInBudgets: {
    schema: Schema.Struct({ tenantId: Str, tokens: Num, at: Num }),
    indexes: { by_tenant_id: [s("tenantId")] },
  },
} as const;

export type Tables = typeof tables;
export type TableName = keyof Tables;
export type Doc<T extends TableName> = Tables[T]["schema"]["Type"];
export type IndexName<T extends TableName> = keyof Tables[T]["indexes"] & string;

export const tableNames = [
  "apps",
  "tenants",
  "blocks",
  "signInPageExemptions",
  "connectorGrants",
  "events",
  "initialAccessTokens",
  "rateLimits",
  "clients",
  "authRequests",
  "authorizationCodes",
  "signIns",
  "signInBudgets",
] as const satisfies ReadonlyArray<TableName>;

/** Fails to compile when a table is missing from `tableNames`. */
export const everyTableListed: Exclude<TableName, (typeof tableNames)[number]> extends never
  ? true
  : false = true;

/** The index declarations with index names widened to string, for the adapters. */
export const declarations: {
  readonly [T in TableName]: {
    readonly indexes: Readonly<Record<string, ReadonlyArray<IndexField>>>;
  };
} = tables;
