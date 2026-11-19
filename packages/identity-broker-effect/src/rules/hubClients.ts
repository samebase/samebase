// The storage half of `POST /register`: the core checks the proof and the host between `admit` and
// the creating command, and these hold every rule that reads or writes a row, each in one step.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { allBelow, first, Tx, unique, type Row } from "../store/Tx.ts";
import { readBlock, tenantIdOf, tenantRow } from "./apps.ts";
import type { Step } from "./commands.ts";
import { grantedTo } from "./connectorGrants.ts";
import { usableNames } from "./connectorRule.ts";
import { MAX_APPS_PER_TENANT, registerClient } from "./registration.ts";
import type {
  AdmitArgs,
  CreateClientArgs,
  CreateDevelopmentClientArgs,
  ReadInitialAccessTokenArgs,
} from "./schemas.ts";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;

/**
 * Per hour: admitted requests of a repository and of an owner, and owners whose first registration
 * succeeded.
 */
const RATE_LIMITS = { repository: 30, owner: 100, new_owners: 50 } as const;

/**
 * The refusal of an enrollment that the policy and the repository's grants of the host's configured
 * connectors do not cover, or null.
 */
const connectorRefusal = Effect.fnUntraced(function* (
  args: {
    readonly tenantId: string;
    readonly ownerId: string;
    readonly tenantOwnerId: string | undefined;
  },
  connectors: ReadonlyArray<string>,
  allowedBy: { readonly policy: ReadonlyArray<string>; readonly configured: ReadonlyArray<string> },
) {
  const granted = yield* grantedTo({
    tenantId: args.tenantId,
    tenantOwnerId: args.tenantOwnerId,
    clientOwnerId: args.ownerId,
  });
  // The one rule (`usableNames`): of the configured connectors, the policy's and the granted ones.
  const allowed = usableNames({
    requested: allowedBy.configured,
    enrollment: allowedBy.configured,
    policy: allowedBy.policy,
    granted,
    configured: allowedBy.configured,
  }).sort();
  return connectors.every((name) => allowed.includes(name))
    ? null
    : { ok: false as const, reason: "invalid_connectors" as const, allowed };
});

/** Whether an admin blocked the repository or its owner. */
const isBlocked = Effect.fnUntraced(function* (ids: {
  readonly githubRepositoryDatabaseId: string;
  readonly githubOwnerId: string;
}) {
  return (
    (yield* readBlock("repository", ids.githubRepositoryDatabaseId)) !== undefined ||
    (yield* readBlock("owner", ids.githubOwnerId)) !== undefined
  );
});

/** The requests of `row` in its window at `now`: none once the window has ended. */
const countIn = (row: Row<"rateLimits"> | undefined, now: number) =>
  row !== undefined && row.doc.startedAt + RATE_LIMIT_WINDOW_MS > now ? row.doc.count : 0;

/** Counts one request in `row`'s window, or starts a new window. */
const countRequest = Effect.fnUntraced(function* (
  row: Row<"rateLimits"> | undefined,
  firstRow: Doc<"rateLimits">,
  now: number,
) {
  const tx = yield* Tx;
  if (row === undefined) {
    yield* tx.insert("rateLimits", firstRow);
    return;
  }
  yield* tx.replace(
    "rateLimits",
    row.id,
    countIn(row, now) === 0
      ? { ...row.doc, startedAt: now, count: 1 }
      : { ...row.doc, count: row.doc.count + 1 },
  );
});

const readRateLimit = (scope: Doc<"rateLimits">["scope"], githubId: string) =>
  unique("rateLimits", "by_scope_and_github_id", [scope, githubId]);

/**
 * An owner with no successful registration yet. A registration event is never deleted, so an owner
 * whose clients are all gone is still not new.
 */
const isNewOwner = Effect.fnUntraced(function* (githubOwnerId: string) {
  return (yield* first("events", "by_github_owner_id", [githubOwnerId])) === undefined;
});

/** Whether the new-owners window of `now` has room for one more new owner. */
const newOwnersWindowFull = Effect.fnUntraced(function* (now: number) {
  return countIn(yield* readRateLimit("new_owners", ""), now) >= RATE_LIMITS.new_owners;
});

/**
 * Refuses a blocked repository or owner, then counts the request in the hourly windows of the
 * repository and the owner. A new owner is refused while the new-owners window is full, but it is
 * counted there only when its registration succeeds. A refused request counts nowhere. `step.now`
 * is the host's clock at command entry.
 */
export const admit = Effect.fnUntraced(function* (args: typeof AdmitArgs.Type, step: Step) {
  if (
    yield* isBlocked({
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerId: args.githubOwnerId,
    })
  ) {
    return { status: "blocked" as const };
  }
  const { now } = step;
  const repository = yield* readRateLimit("repository", args.githubRepositoryDatabaseId);
  const owner = yield* readRateLimit("owner", args.githubOwnerId);
  if (countIn(repository, now) >= RATE_LIMITS.repository) {
    return { status: "rate_limited" as const, window: "repository" as const };
  }
  if (countIn(owner, now) >= RATE_LIMITS.owner) {
    return { status: "rate_limited" as const, window: "owner" as const };
  }
  if ((yield* isNewOwner(args.githubOwnerId)) && (yield* newOwnersWindowFull(now))) {
    return { status: "rate_limited" as const, window: "new_owners" as const };
  }
  yield* countRequest(
    repository,
    { scope: "repository", githubId: args.githubRepositoryDatabaseId, startedAt: now, count: 1 },
    now,
  );
  yield* countRequest(
    owner,
    { scope: "owner", githubId: args.githubOwnerId, startedAt: now, count: 1 },
    now,
  );
  return { status: "admitted" as const };
});

/**
 * Creates the client of a GitHub Actions run and records its registration, in one step. The blocks
 * are read again here. A production client also replaces the app's initial access token. A run
 * whose owner is not the owner of a token row of the repository deletes that row. A proof that
 * names another owner than the tenant's and is not newer than the tenant's newest proof is refused
 * (`stale_proof`). Every refusal writes nothing.
 */
export const createClient = Effect.fnUntraced(function* (
  args: typeof CreateClientArgs.Type,
  step: Step,
) {
  const tx = yield* Tx;
  const { now } = step;
  if (
    yield* isBlocked({
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerId: args.githubOwnerId,
    })
  ) {
    return { ok: false as const, reason: "blocked" as const };
  }
  const tenantId = tenantIdOf(args.githubRepositoryDatabaseId);
  const tenant = yield* tenantRow(tenantId);
  // Strictly newer: with a tie, the old owner's token could take the repository back after the
  // new owner's token of the same second.
  const watermark = tenant?.doc.ownerProofIssuedAt;
  if (
    tenant !== undefined &&
    watermark !== undefined &&
    tenant.doc.ownerId !== args.githubOwnerId &&
    args.proofIssuedAt <= watermark
  ) {
    return { ok: false as const, reason: "stale_proof" as const };
  }
  // Read again, as `admit` did: another new owner may have filled the window since.
  const newOwner = yield* isNewOwner(args.githubOwnerId);
  if (newOwner && (yield* newOwnersWindowFull(now))) {
    return { ok: false as const, reason: "new_owners" as const };
  }
  // The owner of this proof becomes the tenant's recorded owner with this client.
  const refused = yield* connectorRefusal(
    { tenantId, ownerId: args.githubOwnerId, tenantOwnerId: args.githubOwnerId },
    args.connectors,
    { policy: args.policyConnectors, configured: args.configuredConnectors },
  );
  if (refused !== null) {
    return refused;
  }
  const clientName = args.deployment.type === "production" ? "prod" : args.deployment.stage;
  const result = yield* registerClient({
    tenantId,
    ownerId: args.githubOwnerId,
    appId: args.appId,
    connectors: args.connectors,
    deploymentType: args.deployment.type,
    clientId: args.clientId,
    secretHash: args.secretHash,
    registrationTokenHash: args.registrationTokenHash,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    redirectUris: args.redirectUris,
    clientName,
    softwareVersion: args.softwareVersion,
    app: args.app,
    registeredBy: {
      kind: "github",
      githubRepository: args.githubRepository,
      githubOwnerId: args.githubOwnerId,
      githubActorId: args.githubActorId,
      githubActorLogin: args.githubActorLogin,
      commitSha: args.commitSha,
    },
    now,
  });
  if (!result.ok) {
    return { ok: false as const, reason: result.error };
  }
  // `registerClient` wrote the tenant with this owner. The proof time only moves forward.
  const registered = yield* tenantRow(tenantId);
  if (
    registered !== undefined &&
    (registered.doc.ownerProofIssuedAt === undefined ||
      args.proofIssuedAt > registered.doc.ownerProofIssuedAt)
  ) {
    yield* tx.replace("tenants", registered.id, {
      ...registered.doc,
      ownerProofIssuedAt: args.proofIssuedAt,
    });
  }
  if (newOwner) {
    yield* countRequest(
      yield* readRateLimit("new_owners", ""),
      { scope: "new_owners", githubId: "", startedAt: now, count: 1 },
      now,
    );
  }
  // One row per app name of the repository, and an app's token goes with the app.
  const tokens = yield* allBelow(
    "initialAccessTokens",
    "by_repository_and_app",
    [args.githubRepositoryDatabaseId],
    MAX_APPS_PER_TENANT + 1,
  );
  for (const token of tokens) {
    if (token.doc.githubOwnerId !== args.githubOwnerId) {
      yield* tx.delete("initialAccessTokens", token.id);
    }
  }
  yield* tx.insert("events", {
    kind: "registration",
    clientId: args.clientId,
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    githubOwnerId: args.githubOwnerId,
    at: now,
  });
  if (args.deployment.type === "production") {
    const previous = tokens.find(
      (token) => token.doc.app === args.app && token.doc.githubOwnerId === args.githubOwnerId,
    );
    if (previous !== undefined) {
      yield* tx.delete("initialAccessTokens", previous.id);
    }
    yield* tx.insert("initialAccessTokens", {
      tokenHash: args.deployment.initialAccessTokenHash,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerId: args.githubOwnerId,
      githubRepository: args.githubRepository,
      app: args.app,
      issuedAt: now,
    });
  }
  return { ok: true as const, createdAt: now, clientName, tenantId };
});

/** The facts of an initial access token, or null when no row has its hash. */
export const readInitialAccessToken = Effect.fnUntraced(function* (
  args: typeof ReadInitialAccessTokenArgs.Type,
) {
  const row = yield* unique("initialAccessTokens", "by_token_hash", [args.tokenHash]);
  return row === undefined
    ? null
    : {
        githubRepositoryDatabaseId: row.doc.githubRepositoryDatabaseId,
        githubOwnerId: row.doc.githubOwnerId,
        githubRepository: row.doc.githubRepository,
        app: row.doc.app,
      };
});

/**
 * Creates a development client of an app and records its registration, in one step. The token's
 * row is read again here, so a token replaced or deleted since the core read it, or a row that names
 * another repository, owner, or app than the core decided on, refuses the request
 * (`invalid_token`). `appId` is the core's app id of the args' repository and app, which the token
 * row must match. No owner goes to `registerClient`: only a GitHub run changes a tenant's owner.
 */
export const createDevelopmentClient = Effect.fnUntraced(function* (
  args: typeof CreateDevelopmentClientArgs.Type,
  step: Step,
) {
  const tx = yield* Tx;
  const { now } = step;
  const token = yield* unique("initialAccessTokens", "by_token_hash", [args.tokenHash]);
  if (
    token === undefined ||
    token.doc.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId ||
    token.doc.githubOwnerId !== args.githubOwnerId ||
    token.doc.githubRepository !== args.githubRepository ||
    token.doc.app !== args.app
  ) {
    return { ok: false as const, reason: "invalid_token" as const };
  }
  if (
    yield* isBlocked({
      githubRepositoryDatabaseId: token.doc.githubRepositoryDatabaseId,
      githubOwnerId: token.doc.githubOwnerId,
    })
  ) {
    return { ok: false as const, reason: "blocked" as const };
  }
  const tenantId = tenantIdOf(token.doc.githubRepositoryDatabaseId);
  // A development client keeps the tenant's recorded owner, which must be the token's.
  const refused = yield* connectorRefusal(
    {
      tenantId,
      ownerId: token.doc.githubOwnerId,
      tenantOwnerId: (yield* tenantRow(tenantId))?.doc.ownerId,
    },
    args.connectors,
    { policy: args.policyConnectors, configured: args.configuredConnectors },
  );
  if (refused !== null) {
    return refused;
  }
  const result = yield* registerClient({
    tenantId,
    appId: args.appId,
    connectors: args.connectors,
    deploymentType: "development",
    clientId: args.clientId,
    secretHash: args.secretHash,
    registrationTokenHash: args.registrationTokenHash,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    redirectUris: args.redirectUris,
    clientName: "development",
    softwareVersion: args.softwareVersion,
    app: token.doc.app,
    registeredBy: {
      kind: "initial_access_token",
      githubRepository: token.doc.githubRepository,
      githubOwnerId: token.doc.githubOwnerId,
      issuedAt: token.doc.issuedAt,
    },
    now,
  });
  if (!result.ok) {
    return { ok: false as const, reason: result.error };
  }
  yield* tx.insert("events", {
    kind: "registration",
    clientId: args.clientId,
    githubRepositoryDatabaseId: token.doc.githubRepositoryDatabaseId,
    githubOwnerId: token.doc.githubOwnerId,
    at: now,
  });
  return { ok: true as const, createdAt: now, clientName: "development", tenantId };
});
