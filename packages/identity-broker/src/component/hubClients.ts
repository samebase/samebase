import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readBlock, tenantIdOf } from "./apps";
import { registerClient } from "./registration";
import { vRateLimitScope } from "./schema";

// The database half of `POST /hub-clients` (src/client/hubClients.ts): the HTTP action checks the
// proof and the host between `admit` and the creating mutation, and these hold every rule that reads
// or writes a row, each in one transaction.

const { literal, object, string, union } = v;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
/**
 * Requests per hour. A run asks only when it has no saved client: later deploys renew at
 * `/register/<client>` directly. A new owner is one with no registration yet, and it counts once in
 * its window.
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

/** What the host decided the apps of the repository are, from its own-repository list. */
const vTrust = union(
  object({ firstParty: literal(true) }),
  object({ firstParty: literal(false), connector: string() }),
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
 * Refuses a blocked repository or owner, then counts the request in the hourly windows of the
 * repository, the owner, and, for an owner with no registration yet, all new owners. A refused
 * request counts nowhere. Runs before the verification file is fetched.
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
    const newOwners = await readRateLimit(ctx, "new_owners", "");
    // The new-owners window that counts a request now: the running one, or one that starts now.
    const newOwnersWindow =
      newOwners !== null && countIn(newOwners, now) > 0 ? newOwners.startedAt : now;
    // An owner with no registration is counted once in each new-owners window. A registration event
    // is never deleted, so an owner whose clients are all gone is still not new.
    const newOwner =
      owner?.newOwnersWindowStartedAt !== newOwnersWindow &&
      (await ctx.db
        .query("events")
        .withIndex("by_github_owner_id", (q) => q.eq("githubOwnerId", args.githubOwnerId))
        .first()) === null;

    if (countIn(repository, now) >= RATE_LIMITS.repository) {
      return { status: "rate_limited" as const, window: "repository" as const };
    }
    if (countIn(owner, now) >= RATE_LIMITS.owner) {
      return { status: "rate_limited" as const, window: "owner" as const };
    }
    if (newOwner && countIn(newOwners, now) >= RATE_LIMITS.new_owners) {
      return { status: "rate_limited" as const, window: "new_owners" as const };
    }

    await countRequest(
      ctx,
      repository,
      {
        scope: "repository",
        githubId: args.githubRepositoryDatabaseId,
        startedAt: now,
        count: 1,
        newOwnersWindowStartedAt: null,
      },
      now,
    );
    const newOwnersWindowStartedAt = newOwner
      ? newOwnersWindow
      : (owner?.newOwnersWindowStartedAt ?? null);
    if (owner === null) {
      await ctx.db.insert("rateLimits", {
        scope: "owner",
        githubId: args.githubOwnerId,
        startedAt: now,
        count: 1,
        newOwnersWindowStartedAt,
      });
    } else {
      await ctx.db.patch("rateLimits", owner._id, {
        ...(countIn(owner, now) === 0 ? { startedAt: now, count: 1 } : { count: owner.count + 1 }),
        newOwnersWindowStartedAt,
      });
    }
    if (newOwner) {
      await countRequest(
        ctx,
        newOwners,
        {
          scope: "new_owners",
          githubId: "",
          startedAt: now,
          count: 1,
          newOwnersWindowStartedAt: null,
        },
        now,
      );
    }
    return { status: "admitted" as const };
  },
});

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The app of `app` in the repository's tenant: production, or previews and laptops. */
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
 * token of a transferred repository stops.
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
    deployment: union(
      object({ type: literal("production"), initialAccessTokenHash: string() }),
      object({ type: literal("preview"), stage: string() }),
    ),
    trust: vTrust,
    app: string(),
    redirectUri: string(),
    softwareVersion: string(),
  },
  returns: union(object({ ok: literal(true) }), object({ ok: literal(false), reason: vRefusal })),
  handler: async (ctx, args) => {
    const now = Date.now();
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

    if (
      await isBlocked(ctx, {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        githubOwnerId: args.githubOwnerId,
      })
    ) {
      return { ok: false as const, reason: "blocked" as const };
    }

    const tenantId = tenantIdOf(args.githubRepositoryDatabaseId);
    const production = args.deployment.type === "production";
    const result = await registerClient(ctx, {
      tenantId,
      ownerId: args.githubOwnerId,
      appId: await appIdOf(tenantId, args.app, production),
      trust: args.trust,
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
    object({ githubRepositoryDatabaseId: string(), githubOwnerId: string(), app: string() }),
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
          app: row.app,
        };
  },
});

/**
 * Creates a laptop's development client of an app and records its registration, in one
 * transaction. The token's row is read again here, so a token replaced or deleted while the
 * verification file was fetched, or a row that names another app or owner, refuses the request
 * (`invalid_token`); the blocks are read again too. The client is in the app's preview app, with a
 * removal date. No owner goes to `registerClient`: it checks the tenant's recorded owner and keeps
 * it, so only a GitHub run changes a tenant's owner.
 */
export const createDevelopmentClient = mutation({
  args: {
    ...vCredentialHashes,
    tokenHash: string(),
    githubOwnerId: string(),
    trust: vTrust,
    app: string(),
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
    if (token === null || token.app !== args.app || token.githubOwnerId !== args.githubOwnerId) {
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
      trust: args.trust,
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
