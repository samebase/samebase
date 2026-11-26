// The moderation API of a broker, declared once with Effect's `HttpApi`: the broker serves it
// (./server.ts), and a client derives its typed client and its OpenAPI document from it. This
// module imports no server code, so a browser or a Convex action can import it alone.
//
// The moderation key is a Bearer token of a protected resource (RFC 6750). Every error body is
// `{ error, error_description }`, as the broker's other endpoints answer (RFC 6749 section 5.2).
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "effect/http-api";

/** A numeric GitHub id of a repository or an account. */
const GithubId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/));
const ClientId = Schema.String.check(Schema.isPattern(/^cl_[A-Za-z0-9_-]+$/));
/** Trimmed by the broker; the typed client sends it trimmed. */
const Text = (maxLength: number) =>
  Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(maxLength));
const Reason = Text(1_000);

const BlockKind = Schema.Literals(["repository", "owner"]);
const BlockAction = Schema.Literals(["block", "unblock"]);
/** The answer of a change: false when it was already in place, or the client already gone. */
export const Changed = Schema.Struct({ changed: Schema.Boolean });

const Count = Schema.Struct({ count: Schema.Number, atLeast: Schema.Boolean });

/** The registrations of the last day and of the last week. A count that says `atLeast` is capped. */
export const Counts = Schema.Struct({ day: Count, week: Count });

const BlockFields = {
  kind: BlockKind,
  githubId: Schema.String,
  reason: Schema.String,
  adminEmail: Schema.String,
  createdAt: Schema.Number,
};

/** The newest blocks and the newest changes of a block, newest first. */
export const BlockList = Schema.Struct({
  blocks: Schema.Array(Schema.Struct(BlockFields)),
  events: Schema.Array(Schema.Struct({ action: BlockAction, ...BlockFields })),
});

/** Blocks or unblocks one repository or owner. A block stops its clients at once. */
export const BlockChange = Schema.Struct({
  action: BlockAction,
  kind: BlockKind,
  githubId: GithubId,
  reason: Reason,
  adminEmail: Text(320),
});

const Connectors = Schema.Array(Schema.String);

/** One client, with no secret, hash or token. */
export const Client = Schema.Struct({
  clientId: Schema.String,
  appId: Schema.String,
  clientName: Schema.String,
  deploymentType: Schema.Literals(["production", "development", "preview"]),
  redirectUris: Schema.Array(Schema.String),
  createdAt: Schema.Number,
  /** The registration, or the last read of the client by its deploy. */
  renewedAt: Schema.Number,
  lastSignInAt: Schema.NullOr(Schema.Number),
  /** When the broker deletes the client. Null: never. */
  removeAt: Schema.NullOr(Schema.Number),
  registeredBy: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("github"),
      githubRepository: Schema.String,
      githubRepositoryDatabaseId: Schema.String,
      githubOwnerId: Schema.String,
      githubActorLogin: Schema.String,
      app: Schema.String,
    }),
    Schema.Struct({
      kind: Schema.Literal("initial_access_token"),
      githubRepository: Schema.String,
      githubRepositoryDatabaseId: Schema.String,
      githubOwnerId: Schema.String,
      app: Schema.String,
      issuedAt: Schema.Number,
    }),
  ]),
  /** The connectors the client enrolled in. */
  connectors: Connectors,
  /** The repository's owner that the broker recorded last. */
  ownerId: Schema.NullOr(Schema.String),
  /** Null, as each field below, when the client cannot sign in at all. */
  signInPage: Schema.NullOr(Schema.Literals(["shown", "every_app", "repository"])),
  /** The broker's connectors that its allow-list gives the repository. */
  policyConnectors: Schema.NullOr(Connectors),
  /** The enrolled connectors that the client may use now. */
  usableConnectors: Schema.NullOr(Connectors),
  /** The usable connectors that only a grant allows. */
  grantedConnectors: Schema.NullOr(Connectors),
});

/** Newest first. With `?owner=`, the clients of the repositories that the broker records under it. */
export const ClientList = Schema.Struct({
  owner: Schema.optionalKey(Schema.String),
  clients: Schema.Array(Client),
  limitReached: Schema.Boolean,
});

/** The exemptions from the broker's sign-in page. */
export const SignInPageList = Schema.Struct({
  everyApp: Schema.NullOr(Schema.Struct({ reason: Schema.String })),
  repositories: Schema.Array(
    Schema.Struct({
      repositoryId: Schema.String,
      /** The owner the row is bound to. */
      ownerId: Schema.String,
      /** False while the broker records another owner: the row then covers no client. */
      active: Schema.Boolean,
      reason: Schema.String,
    }),
  ),
});

/** Sets (`skip: true`) or removes one exemption. A repository's names the owner it binds to. */
export const SignInPageChange = Schema.Struct({
  target: Schema.Union([
    Schema.Struct({ scope: Schema.Literal("every_app") }),
    Schema.Struct({
      scope: Schema.Literal("repository"),
      repositoryId: GithubId,
      expectedOwnerId: GithubId,
    }),
  ]),
  skip: Schema.Boolean,
  reason: Reason,
});

/** The broker's connectors, which a grant may name, and every grant. */
export const ConnectorGrantList = Schema.Struct({
  connectors: Connectors,
  grants: Schema.Array(
    Schema.Struct({
      repositoryId: Schema.String,
      ownerId: Schema.String,
      connector: Schema.String,
      /** False while the broker records another owner: the row then grants nothing. */
      active: Schema.Boolean,
      reason: Schema.String,
    }),
  ),
});

/** Grants (`grant: true`) or revokes one connector of one repository, for the owner it names. */
export const ConnectorGrantChange = Schema.Struct({
  repositoryId: GithubId,
  connector: Schema.String,
  expectedOwnerId: GithubId,
  grant: Schema.Boolean,
  reason: Reason,
});

const description = { error_description: Schema.String };

/** A request with no Bearer token: a challenge with no error code (RFC 6750 section 3.1). */
export class MissingToken extends Schema.Error<MissingToken>("MissingToken")({}) {}

/** A Bearer token that is not the moderation key (RFC 6750 section 3.1). */
export class InvalidToken extends Schema.Error<InvalidToken>("InvalidToken")({
  error: Schema.tag("invalid_token"),
  ...description,
}) {}

/** A request whose path, query or body does not decode (RFC 6750 section 3.1). */
export class InvalidRequest extends Schema.Error<InvalidRequest>("InvalidRequest")(
  { error: Schema.tag("invalid_request"), ...description },
  { httpApiStatus: 400 },
) {}

/** A grant of a connector that the broker does not have. */
export class UnknownConnector extends Schema.Error<UnknownConnector>("UnknownConnector")(
  { error: Schema.tag("unknown_connector"), ...description },
  { httpApiStatus: 400 },
) {}

/** A change that names an owner of a repository while the broker records another one. */
export class OwnerChanged extends Schema.Error<OwnerChanged>("OwnerChanged")(
  { error: Schema.tag("owner_changed"), ...description },
  { httpApiStatus: 409 },
) {}

const WwwAuthenticate = { "www-authenticate": Schema.String };

/** The moderation key as a Bearer token: both refusals carry the `WWW-Authenticate` challenge. */
export class ModerationKey extends HttpApiMiddleware.Service<ModerationKey>()(
  "identity-broker/moderation/ModerationKey",
  {
    requiredForClient: true,
    security: { bearer: HttpApiSecurity.bearer },
    error: [
      MissingToken.pipe(
        HttpApiSchema.encodeToWithHeaders(
          { body: HttpApiSchema.Empty(401), headers: WwwAuthenticate },
          {
            decode: () => new MissingToken(),
            encode: () => ({
              body: undefined,
              headers: { "www-authenticate": 'Bearer realm="moderation"' },
            }),
          },
        ),
      ),
      InvalidToken.pipe(
        HttpApiSchema.encodeToWithHeaders(
          {
            body: Schema.Struct({ error: Schema.Literal("invalid_token"), ...description }).pipe(
              HttpApiSchema.status(401),
            ),
            headers: WwwAuthenticate,
          },
          {
            decode: ({ body }) => new InvalidToken({ error_description: body.error_description }),
            encode: (error) => ({
              body: { error: error.error, error_description: error.error_description },
              headers: { "www-authenticate": 'Bearer error="invalid_token"' },
            }),
          },
        ),
      ),
    ],
  },
) {}

/** Turns a path, query or body that does not decode into `InvalidRequest`. */
export class RequestCheck extends HttpApiMiddleware.Service<RequestCheck>()(
  "identity-broker/moderation/RequestCheck",
  { error: InvalidRequest },
) {}

/** A query with a parameter that the endpoint does not declare is refused. */
const strictQuery = { onExcessProperty: "error" } as const;

export class Moderation extends HttpApiGroup.make("moderation")
  .add(
    HttpApiEndpoint.get("counts", "/counts", { success: Counts }),
    HttpApiEndpoint.get("blocks", "/blocks", { success: BlockList }),
    HttpApiEndpoint.post("changeBlock", "/blocks", { payload: BlockChange, success: Changed }),
    HttpApiEndpoint.get("signInPage", "/sign-in-page", { success: SignInPageList }),
    HttpApiEndpoint.post("changeSignInPage", "/sign-in-page", {
      payload: SignInPageChange,
      success: Changed,
      error: OwnerChanged,
    }),
    HttpApiEndpoint.get("connectorGrants", "/connector-grants", { success: ConnectorGrantList }),
    HttpApiEndpoint.post("changeConnectorGrant", "/connector-grants", {
      payload: ConnectorGrantChange,
      success: Changed,
      error: [UnknownConnector, OwnerChanged],
    }),
    HttpApiEndpoint.get("clients", "/clients", {
      query: { owner: Schema.optionalKey(GithubId) },
      success: ClientList,
    }).annotate(HttpApi.QueryParseOptions, strictQuery),
    // `?owner=` deletes only while the client's repository is recorded under that owner.
    HttpApiEndpoint.delete("deleteClient", "/clients/:clientId", {
      params: { clientId: ClientId },
      query: { owner: Schema.optionalKey(GithubId) },
      success: Changed,
    }).annotate(HttpApi.QueryParseOptions, strictQuery),
  )
  // The last middleware runs first: the key is checked before the request is decoded.
  .middleware(RequestCheck)
  .middleware(ModerationKey)
  .prefix("/moderation") {}

/** The API: paths are relative to the broker's issuer. */
export class ModerationApi extends HttpApi.make("identity-broker-moderation").add(Moderation) {}
