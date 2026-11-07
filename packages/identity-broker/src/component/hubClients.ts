import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readBlock, tenantIdOf, tenantRow } from "./apps";
import { registerClient } from "./registration";
import { vRateLimitScope } from "./schema";

// The database half of `POST /hub-clients` (src/client/hubClients.ts): the HTTP action checks the
// proof and the host between `admit` and the creating mutation, and these hold every rule that reads
// or writes a row, each in one transaction.

const { array, literal, number, object, string, union } = v;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
/**
 * Per hour: admitted requests of a repository and of an owner, and owners whose first registration
 * succeeded. A run asks only when it has no saved client: later deploys renew at
 * `/register/<client>` directly.
 */
const RATE_LIMITS = { repository: 30, owner: 100, new_owners: 50 } as const;

const vAdmission = union(
  object({ status: literal("admitted") }),
  object({ status: literal("blocked") }),
  object({ status: literal("rate_limited"), window: vRateLimitScope }),
);

const vRefusal = union(
  literal("blocked"),
  literal("suspended"),
  literal("too_many_apps"),
  literal("too_many_clients"),
  literal("app_taken"),
);

/** Whether an admin blocked the repository or its owner. */
async function isBlocked(
  ctx: MutationCtx,
  ids: { githubRepositoryDatabaseId: string; githubOwnerId: string },
) {
  return (
    (await readBlock(ctx, "repository", ids.githubRepositoryDatabaseId)) !== null ||
    (await readBlock(ctx, "owner", ids.githubOwnerId)) !== null
  );
}

/** The requests of `row` in its window at `now`: none once the window has ended. */
function countIn(row: Doc<"rateLimits"> | null, now: number) {
  return row !== null && row.startedAt + RATE_LIMIT_WINDOW_MS > now ? row.count : 0;
}

/** Counts one request in `row`'s window, or starts a new window. */
async function countRequest(
  ctx: MutationCtx,
  row: Doc<"rateLimits"> | null,
  first: WithoutSystemFields<Doc<"rateLimits">>,
  now: number,
) {
  if (row === null) {
    await ctx.db.insert("rateLimits", first);
    return;
  }
  await ctx.db.patch(
    "rateLimits",
    row._id,
    countIn(row, now) === 0 ? { startedAt: now, count: 1 } : { count: row.count + 1 },
  );
}

async function readRateLimit(
  ctx: MutationCtx,
  scope: Doc<"rateLimits">["scope"],
  githubId: string,
) {
  return await ctx.db
    .query("rateLimits")
    .withIndex("by_scope_and_github_id", (q) => q.eq("scope", scope).eq("githubId", githubId))
    .unique();
}

/**
 * An owner with no successful registration yet. A registration event is never deleted, so an owner
 * whose clients are all gone is still not new.
 */
async function isNewOwner(ctx: MutationCtx, githubOwnerId: string) {
  return (
    (await ctx.db
      .query("events")
      .withIndex("by_github_owner_id", (q) => q.eq("githubOwnerId", githubOwnerId))
      .first()) === null
  );
}

/** Whether the new-owners window of `now` has room for one more new owner. */
async function newOwnersWindowFull(ctx: MutationCtx, now: number) {
  return countIn(await readRateLimit(ctx, "new_owners", ""), now) >= RATE_LIMITS.new_owners;
}

/**
 * Refuses a blocked repository or owner, then counts the request in the hourly windows of the
 * repository and the owner. A new owner is refused while the new-owners window is full, but it is
 * counted there only when its registration succeeds (`createClient`), so failed attempts cannot fill
 * that window for everyone. A refused request counts nowhere. Runs before the verification file is
 * fetched.
 */
export const admit = mutation({
  args: { githubRepositoryDatabaseId: string(), githubOwnerId: string() },
  returns: vAdmission,
  handler: async (ctx, args) => {
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
      })
    ) {
      return { status: "blocked" as const };
    }

    // The time of this transaction, so a request that waited in a queue counts in the window it runs in.
    const now = Date.now();
    const repository = await readRateLimit(ctx, "repository", args.githubRepositoryDatabaseId);
    const owner = await readRateLimit(ctx, "owner", args.githubOwnerId);

    if (countIn(repository, now) >= RATE_LIMITS.repository) {
      return { status: "rate_limited" as const, window: "repository" as const };
    }
    if (countIn(owner, now) >= RATE_LIMITS.owner) {
      return { status: "rate_limited" as const, window: "owner" as const };
    }
    if ((await isNewOwner(ctx, args.githubOwnerId)) && (await newOwnersWindowFull(ctx, now))) {
      return { status: "rate_limited" as const, window: "new_owners" as const };
    }

    await countRequest(
      ctx,
      repository,
      { scope: "repository", githubId: args.githubRepositoryDatabaseId, startedAt: now, count: 1 },
      now,
    );
    await countRequest(
      ctx,
      owner,
      { scope: "owner", githubId: args.githubOwnerId, startedAt: now, count: 1 },
      now,
    );
    return { status: "admitted" as const };
  },
});

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The app of `app` in the repository's tenant: production, or previews and development clients. */
async function appIdOf(tenantId: string, app: string, production: boolean) {
  const appHash = (await sha256Hex(app)).slice(0, 32);
  return `${tenantId}-${appHash}${production ? "" : "-preview"}`;
}

/** The credentials of `newClientCredentials`: hashes only, never the values. */
const vCredentialHashes = {
  clientId: string(),
  secretHash: string(),
  registrationTokenHash: string(),
};

/**
 * Creates the client of a GitHub Actions run and records its registration, in one transaction. The
 * blocks are read again here, so a block set while the verification file was fetched still applies.
 * The tenant is `gh-<repository id>`, and the app is the repository's app of that name, with its
 * previews in an app of their own. A production client also replaces the app's initial access token.
 * A run whose owner is not the owner of a token row of the repository deletes that row, so the old
 * token of a transferred repository stops. A proof that names another owner than the tenant's and
 * is not newer than the tenant's newest proof is refused (`stale_proof`), so a replayed proof of
 * the old owner cannot move the repository back. Every refusal writes nothing.
 */
export const createClient = mutation({
  args: {
    ...vCredentialHashes,
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    githubRepository: string(),
    githubActorId: string(),
    githubActorLogin: string(),
    commitSha: string(),
    /** The `iat` of GitHub's OIDC token, in seconds. */
    proofIssuedAt: number(),
    deployment: union(
      object({ type: literal("production"), initialAccessTokenHash: string() }),
      object({ type: literal("preview"), stage: string() }),
    ),
    /** The enrollment, checked by the host against its connectors and its policy. */
    connectors: array(string()),
    app: string(),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: union(
    object({ ok: literal(true) }),
    object({
      ok: literal(false),
      reason: union(vRefusal, literal("stale_proof"), literal("new_owners")),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
      })
    ) {
      return { ok: false as const, reason: "blocked" as const };
    }

    const tenantId = tenantIdOf(args.githubRepositoryDatabaseId);
    const tenant = await tenantRow(ctx, tenantId);
    // Strictly newer: with a tie, the old owner's token could take the repository back after the
    // new owner's token of the same second.
    if (
      tenant?.ownerProofIssuedAt !== undefined &&
      tenant.ownerId !== args.githubOwnerId &&
      args.proofIssuedAt <= tenant.ownerProofIssuedAt
    ) {
      return { ok: false as const, reason: "stale_proof" as const };
    }
    // Read again, as `admit` did: another new owner may have filled the window since.
    const newOwner = await isNewOwner(ctx, args.githubOwnerId);
    if (newOwner && (await newOwnersWindowFull(ctx, now))) {
      return { ok: false as const, reason: "new_owners" as const };
    }

    const production = args.deployment.type === "production";
    const result = await registerClient(ctx, {
      tenantId,
      ownerId: args.githubOwnerId,
      appId: await appIdOf(tenantId, args.app, production),
      connectors: args.connectors,
      deploymentType: args.deployment.type,
      clientId: args.clientId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: args.redirectUri,
      clientName: args.deployment.type === "production" ? "prod" : args.deployment.stage,
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
    const registered = await tenantRow(ctx, tenantId);
    if (
      registered !== null &&
      (registered.ownerProofIssuedAt === undefined ||
        args.proofIssuedAt > registered.ownerProofIssuedAt)
    ) {
      await ctx.db.patch("tenants", registered._id, { ownerProofIssuedAt: args.proofIssuedAt });
    }
    if (newOwner) {
      await countRequest(
        ctx,
        await readRateLimit(ctx, "new_owners", ""),
        { scope: "new_owners", githubId: "", startedAt: now, count: 1 },
        now,
      );
    }
    // One row per app name of the repository, so a few rows.
    const tokens = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_repository_and_app", (q) =>
        q.eq("githubRepositoryDatabaseId", args.githubRepositoryDatabaseId),
      )
      .collect();
    for (const token of tokens) {
      if (token.githubOwnerId !== args.githubOwnerId) {
        await ctx.db.delete("initialAccessTokens", token._id);
      }
    }
    await ctx.db.insert("events", {
      kind: "registration",
      clientId: args.clientId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerId: args.githubOwnerId,
      at: now,
    });
    if (args.deployment.type === "production") {
      const previous = tokens.find(
        (token) => token.app === args.app && token.githubOwnerId === args.githubOwnerId,
      );
      if (previous !== undefined) {
        await ctx.db.delete("initialAccessTokens", previous._id);
      }
      await ctx.db.insert("initialAccessTokens", {
        tokenHash: args.deployment.initialAccessTokenHash,
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
        githubRepository: args.githubRepository,
        app: args.app,
        issuedAt: now,
      });
    }
    return { ok: true as const };
  },
});

/** The row of an initial access token, or null when no row has its hash. */
export const readInitialAccessToken = query({
  args: { tokenHash: string() },
  returns: union(
    object({
      githubRepositoryDatabaseId: string(),
      githubOwnerId: string(),
      githubRepository: string(),
      app: string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    return row === null
      ? null
      : {
          githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
          githubOwnerId: row.githubOwnerId,
          githubRepository: row.githubRepository,
          app: row.app,
        };
  },
});

/**
 * Creates a development client of an app and records its registration, in one transaction. The
 * token's row is read again here, so a token replaced or deleted while the verification file was
 * fetched, or a row that names another repository, owner, or app than the host's policy decided on,
 * refuses the request (`invalid_token`); the blocks are read again too. The client is in the app's
 * preview app, with a removal date. No owner goes to `registerClient`: it checks the tenant's
 * recorded owner and keeps it, so only a GitHub run changes a tenant's owner.
 */
export const createDevelopmentClient = mutation({
  args: {
    ...vCredentialHashes,
    tokenHash: string(),
    /** The token's row as the host read it: the facts its policy decided on. */
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    githubRepository: string(),
    app: string(),
    connectors: array(string()),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: union(
    object({ ok: literal(true) }),
    object({ ok: literal(false), reason: union(vRefusal, literal("invalid_token")) }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const token = await ctx.db
      .query("initialAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      token === null ||
      token.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId ||
      token.githubOwnerId !== args.githubOwnerId ||
      token.githubRepository !== args.githubRepository ||
      token.app !== args.app
    ) {
      return { ok: false as const, reason: "invalid_token" as const };
    }
    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
        githubOwnerId: token.githubOwnerId,
      })
    ) {
      return { ok: false as const, reason: "blocked" as const };
    }

    const tenantId = tenantIdOf(token.githubRepositoryDatabaseId);
    const result = await registerClient(ctx, {
      tenantId,
      appId: await appIdOf(tenantId, token.app, false),
      connectors: args.connectors,
      deploymentType: "development",
      clientId: args.clientId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: args.redirectUri,
      clientName: "development",
      softwareVersion: args.softwareVersion,
      app: token.app,
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: token.githubRepository,
        githubOwnerId: token.githubOwnerId,
        issuedAt: token.issuedAt,
      },
      now,
    });
    if (!result.ok) {
      return { ok: false as const, reason: result.error };
    }

    await ctx.db.insert("events", {
      kind: "registration",
      clientId: args.clientId,
      githubRepositoryDatabaseId: token.githubRepositoryDatabaseId,
      githubOwnerId: token.githubOwnerId,
      at: now,
    });
    return { ok: true as const };
  },
});
