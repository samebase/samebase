// The storage half of `POST /register`: the handler checks the proof and the hosts between `admit`
// and the creating command, and these hold every rule that reads or writes a row, each in one step.
// The creating command checks every admission fact again, since each can change while the handler
// waits on the network.
import { Effect } from "effect";
import type { Step } from "../../rules/commands.ts";
import type { Doc, Tables } from "../../store/tables.ts";
import { allBelow, first, unique, type Row } from "../../store/Tx.ts";
import {
  allowedConnectors,
  insertCard,
  isStopped,
  MAX_APPS_PER_TENANT,
  tenantIdOf,
  tenantRow,
  type AllowList,
} from "./clients.ts";
import type {
  AdmitArgs,
  CreateClientArgs,
  CreateDevelopmentClientArgs,
  ReadInitialAccessTokenArgs,
} from "./schemas.ts";
import { GithubTx } from "./tables.ts";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;

type RateLimitRow = Row<Tables, "rateLimits">;

/**
 * Per hour: admitted requests of a repository and of an owner, and owners whose first registration
 * succeeded.
 */
const RATE_LIMITS = { repository: 30, owner: 100, new_owners: 50 } as const;

/**
 * The connectors a registration for `ownerId` may enroll in, with that owner as the tenant's owner,
 * sorted; and the refusal of an enrollment outside them, or null.
 */
const enrollmentCheck = Effect.fnUntraced(function* (
  args: {
    readonly githubRepositoryDatabaseId: string;
    readonly ownerId: string;
    readonly allowList: AllowList;
    readonly configured: ReadonlyArray<string>;
  },
  connectors: ReadonlyArray<string> | undefined,
) {
  const allowed = [
    ...(yield* allowedConnectors({
      tenantId: tenantIdOf(args.githubRepositoryDatabaseId),
      currentOwnerId: args.ownerId,
      clientOwnerId: args.ownerId,
      allowList: args.allowList,
      configured: args.configured,
    })),
  ].sort();
  const enrollment = [...new Set(connectors ?? allowed)].sort();
  return enrollment.length > 0 && enrollment.every((name) => allowed.includes(name))
    ? { ok: true as const, enrollment }
    : { ok: false as const, reason: "invalid_connectors" as const, allowed };
});

/** The requests of `row` in its window at `now`: none once the window has ended. */
const countIn = (row: RateLimitRow | undefined, now: number) =>
  row !== undefined && row.doc.startedAt + RATE_LIMIT_WINDOW_MS > now ? row.doc.count : 0;

/** Counts one request in `row`'s window, or starts a new window. */
const countRequest = Effect.fnUntraced(function* (
  row: RateLimitRow | undefined,
  firstRow: Doc<"rateLimits">,
  now: number,
) {
  const tx = yield* GithubTx;
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

const readRateLimit = Effect.fnUntraced(function* (
  scope: Doc<"rateLimits">["scope"],
  githubId: string,
) {
  return yield* unique(yield* GithubTx, "rateLimits", "by_scope_and_github_id", [scope, githubId]);
});

/**
 * An owner with no successful registration yet. A registration event is never deleted, so an owner
 * whose clients are all gone is still not new.
 */
const isNewOwner = Effect.fnUntraced(function* (githubOwnerId: string) {
  return (
    (yield* first(yield* GithubTx, "events", "by_github_owner_id", [githubOwnerId])) === undefined
  );
});

/** Whether the new-owners window of `now` has room for one more new owner. */
const newOwnersWindowFull = Effect.fnUntraced(function* (now: number) {
  return countIn(yield* readRateLimit("new_owners", ""), now) >= RATE_LIMITS.new_owners;
});

/**
 * Refuses a stopped repository or owner and an enrollment outside what the allow-list and the
 * grants give, then counts the request in the hourly windows of the repository and the owner. A
 * new owner is refused while the new-owners window is full, but it is counted there only when its
 * registration succeeds. A refused request counts nowhere. `step.now` is the host's clock at
 * command entry.
 */
export const admit = Effect.fnUntraced(function* (args: typeof AdmitArgs.Type, step: Step) {
  if (yield* isStopped(args.githubRepositoryDatabaseId, args.githubOwnerId)) {
    return { ok: false as const, reason: "blocked" as const };
  }
  const checked = yield* enrollmentCheck(
    {
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      ownerId: args.githubOwnerId,
      allowList: args.allowList,
      configured: args.configured,
    },
    args.connectors,
  );
  if (!checked.ok) {
    return checked;
  }
  const { now } = step;
  const repository = yield* readRateLimit("repository", args.githubRepositoryDatabaseId);
  const owner = yield* readRateLimit("owner", args.githubOwnerId);
  const limited = (window: "repository" | "owner" | "new_owners") => ({
    ok: false as const,
    reason: "rate_limited" as const,
    window,
  });
  if (countIn(repository, now) >= RATE_LIMITS.repository) {
    return limited("repository");
  }
  if (countIn(owner, now) >= RATE_LIMITS.owner) {
    return limited("owner");
  }
  if ((yield* isNewOwner(args.githubOwnerId)) && (yield* newOwnersWindowFull(now))) {
    return limited("new_owners");
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
  return { ok: true as const, enrollment: checked.enrollment };
});

/**
 * Creates the client of a GitHub Actions run and its card, and records the registration, in one
 * step. The stops, the owner order, the new-owners window and the enrollment are read again here.
 * A proof that names another owner than the tenant's and is not newer than the tenant's newest
 * proof is refused (`stale_proof`); a newer one transfers the tenant, which rewrites its cards and
 * deletes the token rows of other owners. A production client also replaces the app's initial
 * access token. Every refusal writes nothing.
 */
export const createClient = Effect.fnUntraced(function* (
  args: typeof CreateClientArgs.Type,
  step: Step,
) {
  const tx = yield* GithubTx;
  const { now } = step;
  if (yield* isStopped(args.githubRepositoryDatabaseId, args.githubOwnerId)) {
    return { ok: false as const, reason: "blocked" as const };
  }
  const tenantId = tenantIdOf(args.githubRepositoryDatabaseId);
  const tenant = yield* tenantRow(tenantId);
  // Strictly newer: with a tie, the old owner's token could take the repository back after the
  // new owner's token of the same second.
  if (
    tenant !== undefined &&
    tenant.doc.ownerId !== args.githubOwnerId &&
    args.proofIssuedAt <= tenant.doc.ownerProofIssuedAt
  ) {
    return { ok: false as const, reason: "stale_proof" as const };
  }
  // Read again, as `admit` did: another new owner may have filled the window since.
  const newOwner = yield* isNewOwner(args.githubOwnerId);
  if (newOwner && (yield* newOwnersWindowFull(now))) {
    return { ok: false as const, reason: "new_owners" as const };
  }
  // The owner of this proof becomes the tenant's recorded owner with this client.
  const checked = yield* enrollmentCheck(
    {
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      ownerId: args.githubOwnerId,
      allowList: args.allowList,
      configured: args.configured,
    },
    args.connectors,
  );
  if (!checked.ok) {
    return checked;
  }
  const clientName = args.deployment.type === "production" ? "prod" : args.deployment.stage;
  const result = yield* insertCard({
    tenantId,
    ownerId: args.githubOwnerId,
    proofIssuedAt: args.proofIssuedAt,
    appId: args.appId,
    app: args.app,
    enrollment: checked.enrollment,
    deploymentType: args.deployment.type,
    clientId: args.clientId,
    secretHash: args.secretHash,
    registrationTokenHash: args.registrationTokenHash,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    redirectUris: args.redirectUris,
    clientName,
    softwareVersion: args.softwareVersion,
    registeredBy: {
      kind: "github",
      githubRepository: args.githubRepository,
      githubOwnerId: args.githubOwnerId,
      githubActorId: args.githubActorId,
      githubActorLogin: args.githubActorLogin,
      commitSha: args.commitSha,
    },
    allowList: args.allowList,
    configured: args.configured,
    now,
  });
  if (!result.ok) {
    return { ok: false as const, reason: result.error };
  }
  if (newOwner) {
    yield* countRequest(
      yield* readRateLimit("new_owners", ""),
      { scope: "new_owners", githubId: "", startedAt: now, count: 1 },
      now,
    );
  }
  // One row per app name of the repository, and an app's token goes with the app. A token of
  // another owner goes with the transfer.
  const tokens = yield* allBelow(
    tx,
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
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    githubOwnerId: args.githubOwnerId,
    at: now,
  });
  yield* tx.insert("registrations", { at: now });
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
  const row = yield* unique(yield* GithubTx, "initialAccessTokens", "by_token_hash", [
    args.tokenHash,
  ]);
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
 * Creates a development client of an app and its card, and records the registration, in one step.
 * The token's row is read again here, so a token replaced or deleted since the handler read it, a
 * row that names another repository, owner, or app than the handler decided on, or a tenant whose
 * owner is no longer the token's, refuses the request (`invalid_token`). The stops and the
 * enrollment are read again too. `appId` is the handler's app id of the args' repository and app,
 * which the token row must match.
 */
export const createDevelopmentClient = Effect.fnUntraced(function* (
  args: typeof CreateDevelopmentClientArgs.Type,
  step: Step,
) {
  const tx = yield* GithubTx;
  const { now } = step;
  const token = yield* unique(tx, "initialAccessTokens", "by_token_hash", [args.tokenHash]);
  const tenantId = tenantIdOf(args.githubRepositoryDatabaseId);
  const tenant = yield* tenantRow(tenantId);
  if (
    token === undefined ||
    tenant === undefined ||
    token.doc.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId ||
    token.doc.githubOwnerId !== args.githubOwnerId ||
    token.doc.githubRepository !== args.githubRepository ||
    token.doc.app !== args.app ||
    tenant.doc.ownerId !== token.doc.githubOwnerId
  ) {
    return { ok: false as const, reason: "invalid_token" as const };
  }
  if (yield* isStopped(token.doc.githubRepositoryDatabaseId, token.doc.githubOwnerId)) {
    return { ok: false as const, reason: "blocked" as const };
  }
  const checked = yield* enrollmentCheck(
    {
      githubRepositoryDatabaseId: token.doc.githubRepositoryDatabaseId,
      ownerId: token.doc.githubOwnerId,
      allowList: args.allowList,
      configured: args.configured,
    },
    args.connectors,
  );
  if (!checked.ok) {
    return checked;
  }
  const result = yield* insertCard({
    tenantId,
    ownerId: tenant.doc.ownerId,
    proofIssuedAt: tenant.doc.ownerProofIssuedAt,
    appId: args.appId,
    app: token.doc.app,
    enrollment: checked.enrollment,
    deploymentType: "development",
    clientId: args.clientId,
    secretHash: args.secretHash,
    registrationTokenHash: args.registrationTokenHash,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    redirectUris: args.redirectUris,
    clientName: "development",
    softwareVersion: args.softwareVersion,
    registeredBy: {
      kind: "initial_access_token",
      githubRepository: token.doc.githubRepository,
      githubOwnerId: token.doc.githubOwnerId,
      issuedAt: token.doc.issuedAt,
    },
    allowList: args.allowList,
    configured: args.configured,
    now,
  });
  if (!result.ok) {
    return { ok: false as const, reason: result.error };
  }
  yield* tx.insert("events", {
    githubRepositoryDatabaseId: token.doc.githubRepositoryDatabaseId,
    githubOwnerId: token.doc.githubOwnerId,
    at: now,
  });
  yield* tx.insert("registrations", { at: now });
  return { ok: true as const, createdAt: now, clientName: "development", tenantId };
});
