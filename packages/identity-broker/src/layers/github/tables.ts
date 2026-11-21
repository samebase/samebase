// The tables of the GitHub layer, its fields of a card (`github`), and its view of a step, which
// reaches every table of the hub (src/store/tables.ts): it writes the cards.
import { Context, Schema } from "effect";
import type { Tables } from "../../store/tables.ts";
import { s, type TxShape } from "../../store/Tx.ts";

const Num = Schema.Finite;
const Str = Schema.String;

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

/** What only this layer reads about a client. It lives on the card's row, so it goes with it. */
export const GithubClient = Schema.Struct({
  /** `<tenant id>-<hash of the app name>`, the key of the app row. */
  appId: Str,
  app: Str,
  deploymentType: DeploymentType,
  /** `prod`, the preview stage, or `development`. */
  clientName: Str,
  softwareVersion: Str,
  /** SHA-256 hex of the client's own RFC 7592 registration access token. */
  registrationTokenHash: Str,
  /** The last registration or RFC 7592 read: the eviction order at the cap. */
  renewedAt: Num,
  registeredBy: RegisteredBy,
  /** The connectors the registration enrolled in: the card's `connectors` are a part of these. */
  enrollment: Schema.Array(Str),
});

export const cardFields = { github: Schema.optionalKey(GithubClient) };

export const cardIndexes = {
  by_github_app_id_and_deployment_type: [s("github.appId"), s("github.deploymentType")],
};

export const githubTables = {
  apps: {
    schema: Schema.Struct({ appId: Str, tenantId: Str }),
    indexes: { by_app_id: [s("appId")], by_tenant_id: [s("tenantId")] },
  },
  /**
   * A repository: its recorded owner, and the `iat` of the newest proof that recorded an owner,
   * which a proof of another owner must pass.
   */
  tenants: {
    schema: Schema.Struct({ tenantId: Str, ownerId: Str, ownerProofIssuedAt: Num }),
    indexes: { by_tenant_id: [s("tenantId")] },
  },
  /** The repository's cards skip the page while the tenant's owner and the client's are `ownerId`. */
  signInPageExemptions: {
    schema: Schema.Struct({ tenantId: Str, ownerId: Str, reason: Str }),
    indexes: { by_tenant_id_and_owner_id: [s("tenantId"), s("ownerId")] },
  },
  /** One connector for a repository while one owner owns it and registered the client. */
  connectorGrants: {
    schema: Schema.Struct({ tenantId: Str, ownerId: Str, connector: Str, reason: Str }),
    indexes: {
      by_tenant_id_and_owner_id_and_connector: [s("tenantId"), s("ownerId"), s("connector")],
    },
  },
  /** Append-only: one row per successful registration. An owner with a row is not new. */
  events: {
    schema: Schema.Struct({ githubRepositoryDatabaseId: Str, githubOwnerId: Str, at: Num }),
    indexes: { by_github_owner_id: [s("githubOwnerId")] },
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
    schema: Schema.Struct({
      scope: Schema.Literals(["repository", "owner", "new_owners"]),
      githubId: Str,
      startedAt: Num,
      count: Num,
    }),
    indexes: { by_scope_and_github_id: [s("scope"), s("githubId")] },
  },
} as const;

/** The layer's view of a step: every table of the hub, with the cards' `github` fields. */
export class GithubTx extends Context.Service<GithubTx, TxShape<Tables>>()(
  "identity-broker/layers/github/GithubTx",
) {}
