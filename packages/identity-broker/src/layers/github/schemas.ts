// The argument and result schemas of the GitHub layer's commands. Plain JSON on both sides.
import { Schema } from "effect";
import { ConnectorGrantChange, SignInPageChange } from "../../moderation/api.ts";
import { TokenEndpointAuthMethod } from "../../rules/tables.ts";

const Str = Schema.String;
const Num = Schema.Finite;
const Strs = Schema.Array(Str);
const opt = Schema.optionalKey;

/**
 * The settings' allow-list, given whole to each command that writes a card: `"any"`, or entries of
 * an owner, each for one repository of that owner or, without `repositoryId`, for every one.
 */
export const AllowList = Schema.Union([
  Schema.Literal("any"),
  Schema.Array(Schema.Struct({ ownerId: Str, repositoryId: opt(Str) })),
]);

/** What a command that writes a card reads of the hub's settings. */
const settings = {
  allowList: AllowList,
  /** The hub's configured connector names. */
  configured: Strs,
};

const RateLimitScope = Schema.Literals(["repository", "owner", "new_owners"]);

/** An enrollment outside what the allow-list and the grants give, with the names that are allowed. */
const InvalidConnectors = Schema.Struct({
  ok: Schema.Literal(false),
  reason: Schema.Literal("invalid_connectors"),
  allowed: Strs,
});

export const AdmitArgs = Schema.Struct({
  githubRepositoryDatabaseId: Str,
  githubOwnerId: Str,
  /** The enrollment the body names. Absent: every connector this registration may enroll in. */
  connectors: opt(Strs),
  ...settings,
});
export const AdmitResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), enrollment: Strs }),
  Schema.Struct({ ok: Schema.Literal(false), reason: Schema.Literal("blocked") }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: Schema.Literal("rate_limited"),
    window: RateLimitScope,
  }),
  InvalidConnectors,
]);

const Refusal = Schema.Literals(["blocked", "too_many_apps", "too_many_clients", "app_taken"]);

/** A created client, with what the registration answer says about it and the request did not. */
const Created = Schema.Struct({
  ok: Schema.Literal(true),
  createdAt: Num,
  clientName: Str,
  /** The first part of the answer's full `software_id`, `<tenant id>/<app name>`. */
  tenantId: Str,
});

const credentialHashes = { clientId: Str, secretHash: Str, registrationTokenHash: Str };

const clientFields = {
  /** The enrollment that `github.admit` answered; checked again in the creating step. */
  connectors: Strs,
  /** The return addresses, each checked by the handler. */
  redirectUris: Strs,
  softwareVersion: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  ...settings,
};

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
  app: Str,
  /** The app id of `app` in the repository's tenant, computed by the handler. */
  appId: Str,
  ...clientFields,
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
  /** The token's row as the handler read it. */
  githubRepositoryDatabaseId: Str,
  githubOwnerId: Str,
  githubRepository: Str,
  app: Str,
  /** The app id of `app` in the tenant of `githubRepositoryDatabaseId`, computed by the handler. */
  appId: Str,
  ...clientFields,
});
export const CreateDevelopmentClientResult = Schema.Union([
  Created,
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: Schema.Union([Refusal, Schema.Literal("invalid_token")]),
  }),
  InvalidConnectors,
]);

export const RenewArgs = Schema.Struct({ clientId: Str, registrationTokenHash: Str, ...settings });
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
    /** The enrollment. */
    connectors: Strs,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "suspended"]),
  }),
]);

export const ConnectorGrantsArgs = Schema.Struct({ configured: Strs });

/** A change of a grant or an exemption, refused while the hub records another owner. */
export const OwnerChangeResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), changed: Schema.Boolean }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("owner_changed") }),
]);

export const ChangeSignInPageArgs = Schema.Struct({ ...SignInPageChange.fields, ...settings });

export const ChangeConnectorGrantArgs = Schema.Struct({
  ...ConnectorGrantChange.fields,
  ...settings,
});

/** Every client, or with `owner` those of the repositories whose recorded owner it is. */
export const ClientsArgs = Schema.Struct({ owner: opt(Str), ...settings });

/** With `owner`, only while the client's repository is recorded under that owner. */
export const DeleteClientArgs = Schema.Struct({ clientId: Str, owner: opt(Str) });

export const RemoveArgs = Schema.Struct({ clientId: Str, registrationTokenHash: Str });
export const RemoveResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "production"]),
  }),
]);
