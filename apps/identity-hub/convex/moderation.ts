import { validate } from "convex-helpers/validators";
import { v, type Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { vBlockKind } from "./schema";

const { array, boolean, literal, number, object, string, union } = v;

/** The most rows that one count reads. A count that reaches it is "at least". */
const COUNT_READ_LIMIT = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
/** The newest blocks and events that `GET /moderation/blocks` returns. */
const BLOCK_LIST_LIMIT = 200;
const EVENT_LIST_LIMIT = 100;
/** The newest clients that `GET /moderation/clients` returns. A list that reaches it says so. */
const CLIENT_LIST_LIMIT = 500;
const MAX_REASON_LENGTH = 1_000;
const MAX_EMAIL_LENGTH = 320;

const vCount = object({ count: number(), atLeast: boolean() });

/**
 * Who made a client. `github`: a GitHub Actions run at `/hub-clients`, from the hub's registration
 * row. `initial_access_token`: a development client that the app's initial access token registered at `/hub-clients`, from the row too.
 * `team`: the team's Convex login, through `identityBroker:registerClient`, for an app that
 * `identityBroker:createApp` made, so the app has no tenant. `unknown`: a client of a tenant's app
 * with no registration row, or of an app that is gone.
 */
const vRegisteredBy = union(
  object({
    kind: literal("github"),
    githubRepository: string(),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    githubActorLogin: string(),
    /** The name that the app's stack gives itself. */
    app: string(),
  }),
  object({
    kind: literal("initial_access_token"),
    githubRepository: string(),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    app: string(),
    /** When the hub issued the initial access token that registered the client. */
    issuedAt: number(),
  }),
  object({ kind: literal("team") }),
  object({ kind: literal("unknown") }),
);

/** One client at the broker, of any app, with no secret, hash, or token. */
const vClient = object({
  clientId: string(),
  appId: string(),
  clientName: string(),
  deploymentType: union(literal("production"), literal("development"), literal("preview")),
  /** The one address where the broker sends people back with a code. */
  redirectUri: string(),
  createdAt: number(),
  /**
   * The last registration at `/hub-clients` or renewal. Null for a client from `registerClient` that
   * was never renewed.
   */
  renewedAt: union(number(), v.null()),
  lastSignInAt: union(number(), v.null()),
  /** When the broker's cleanup deletes the client. Null: never. */
  removeAt: union(number(), v.null()),
  registeredBy: vRegisteredBy,
});

const vBlock = object({
  kind: vBlockKind,
  githubId: string(),
  reason: string(),
  adminEmail: string(),
  createdAt: number(),
});

const vBlockEvent = object({
  action: union(literal("block"), literal("unblock")),
  kind: vBlockKind,
  githubId: string(),
  reason: string(),
  adminEmail: string(),
  createdAt: number(),
});

/** The body of `POST /moderation/blocks`. */
const vBlockChange = object({
  action: union(literal("block"), literal("unblock")),
  kind: vBlockKind,
  githubId: string(),
  reason: string(),
  adminEmail: string(),
});
type BlockChange = Infer<typeof vBlockChange>;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readBlock(ctx: QueryCtx, kind: Doc<"blocks">["kind"], githubId: string) {
  return await ctx.db
    .query("blocks")
    .withIndex("by_kind_and_github_id", (q) => q.eq("kind", kind).eq("githubId", githubId))
    .unique();
}

/** Whether an admin blocked the repository or its owner. */
export async function isBlocked(
  ctx: QueryCtx,
  ids: { githubRepositoryDatabaseId: string; githubOwnerId: string },
) {
  return (
    (await readBlock(ctx, "repository", ids.githubRepositoryDatabaseId)) !== null ||
    (await readBlock(ctx, "owner", ids.githubOwnerId)) !== null
  );
}

/**
 * What proved a registration. A row from before `proof` holds the GitHub fields at the top: step 1
 * of the move of RFC 133, until `rewriteRegistrationProofs` has run and PR 3 removes them.
 */
function readProof(row: Doc<"registrations">) {
  if (row.proof !== undefined) {
    return row.proof;
  }
  if (
    row.githubActorId === undefined ||
    row.githubActorLogin === undefined ||
    row.commitSha === undefined
  ) {
    throw new Error(`The registration of ${row.clientId} has no proof.`);
  }
  return {
    kind: "github" as const,
    githubActorId: row.githubActorId,
    githubActorLogin: row.githubActorLogin,
    commitSha: row.commitSha,
  };
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * A moderation endpoint: it answers only a request with `HUB_MODERATION_KEY`, compared by hash, so
 * the time it takes says nothing about the key. An unset or empty key refuses every request.
 */
function moderationEndpoint(handler: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const expected = env.HUB_MODERATION_KEY?.trim();
    const presented = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!expected || !presented || (await sha256Hex(presented)) !== (await sha256Hex(expected))) {
      return reply(401, { error: "invalid_token" });
    }
    return await handler(ctx, request);
  });
}

async function countSince(ctx: QueryCtx, since: number) {
  const rows = await ctx.db
    .query("registrations")
    .withIndex("by_registered_at", (q) => q.gt("registeredAt", since))
    .take(COUNT_READ_LIMIT);
  return { count: rows.length, atLeast: rows.length === COUNT_READ_LIMIT };
}

/** The registrations of the last day and of the last week, each read up to `COUNT_READ_LIMIT`. */
export const registrationCounts = internalQuery({
  args: { now: number() },
  returns: object({ day: vCount, week: vCount }),
  handler: async (ctx, args) => ({
    day: await countSince(ctx, args.now - DAY_MS),
    week: await countSince(ctx, args.now - 7 * DAY_MS),
  }),
});

/** The newest blocks and the newest block events, newest first. */
export const blockList = internalQuery({
  args: {},
  returns: object({ blocks: array(vBlock), events: array(vBlockEvent) }),
  handler: async (ctx) => {
    const blocks = await ctx.db.query("blocks").order("desc").take(BLOCK_LIST_LIMIT);
    const events = await ctx.db.query("audit_block_events").order("desc").take(EVENT_LIST_LIMIT);
    return {
      blocks: blocks.map((block) => ({
        kind: block.kind,
        githubId: block.githubId,
        reason: block.reason,
        adminEmail: block.adminEmail,
        createdAt: block._creationTime,
      })),
      events: events.map((event) => ({
        action: event.action,
        kind: event.kind,
        githubId: event.githubId,
        reason: event.reason,
        adminEmail: event.adminEmail,
        createdAt: event._creationTime,
      })),
    };
  },
});

/**
 * The newest clients that the broker holds, of the team's own apps and of third-party apps, each
 * with who made it.
 */
export const clientList = internalQuery({
  args: {},
  returns: object({ clients: array(vClient), limitReached: boolean() }),
  handler: async (ctx) => {
    const clients = await ctx.runQuery(components.identityBroker.clients.list, {
      limit: CLIENT_LIST_LIMIT,
    });
    // Only the apps of these clients, so the reads stay bounded by `CLIENT_LIST_LIMIT`.
    const appIds = [...new Set(clients.map((client) => client.appId))];
    const madeByTeam = new Map(
      await Promise.all(
        appIds.map(async (appId) => {
          const app = await ctx.runQuery(components.identityBroker.apps.get, { appId });
          return [appId, app !== null && app.tenantId === undefined] as const;
        }),
      ),
    );
    const registeredBy = async (client: (typeof clients)[number]) => {
      const registration = await ctx.db
        .query("registrations")
        .withIndex("by_client_id", (q) => q.eq("clientId", client.clientId))
        .unique();
      if (registration !== null) {
        const proof = readProof(registration);
        const repository = {
          githubRepository: registration.githubRepository,
          githubRepositoryDatabaseId: registration.githubRepositoryDatabaseId,
          githubOwnerId: registration.githubOwnerId,
          app: registration.app,
        };
        return proof.kind === "github"
          ? { kind: "github" as const, ...repository, githubActorLogin: proof.githubActorLogin }
          : { kind: "initial_access_token" as const, ...repository, issuedAt: proof.issuedAt };
      }
      return madeByTeam.get(client.appId)
        ? { kind: "team" as const }
        : { kind: "unknown" as const };
    };
    return {
      clients: await Promise.all(
        clients.map(async (client) => ({
          clientId: client.clientId,
          appId: client.appId,
          clientName: client.clientName,
          deploymentType: client.deploymentType,
          redirectUri: client.redirectUri,
          createdAt: client.createdAt,
          renewedAt: client.renewedAt ?? null,
          lastSignInAt: client.lastSignInAt ?? null,
          removeAt: client.removeAt ?? null,
          registeredBy: await registeredBy(client),
        })),
      ),
      limitReached: clients.length === CLIENT_LIST_LIMIT,
    };
  },
});

/**
 * Blocks or unblocks a repository or an owner, and appends the audit event. A repository block
 * disconnects the broker's tenant `gh-<id>`; an owner block sets the broker's owner switch. Neither
 * touches the operator's suspension of a tenant. A change that is already in place changes nothing
 * and appends nothing.
 */
export const setBlock = internalMutation({
  args: vBlockChange.fields,
  returns: object({ changed: boolean() }),
  handler: async (ctx, args) => {
    const row = await readBlock(ctx, args.kind, args.githubId);
    if (args.action === "block") {
      if (row !== null) {
        return { changed: false };
      }
      await ctx.db.insert("blocks", {
        kind: args.kind,
        githubId: args.githubId,
        reason: args.reason,
        adminEmail: args.adminEmail,
      });
    } else {
      if (row === null) {
        return { changed: false };
      }
      await ctx.db.delete("blocks", row._id);
    }

    if (args.kind === "repository") {
      await ctx.runMutation(components.identityBroker.registration.switchConnection, {
        tenantId: `gh-${args.githubId}`,
        connected: args.action === "unblock",
      });
    } else {
      await ctx.runMutation(components.identityBroker.registration.setOwnerBlocked, {
        ownerId: args.githubId,
        blocked: args.action === "block",
        now: Date.now(),
      });
    }
    await ctx.db.insert("audit_block_events", {
      action: args.action,
      kind: args.kind,
      githubId: args.githubId,
      reason: args.reason,
      adminEmail: args.adminEmail,
    });
    return { changed: true };
  },
});

/** The rows that one run of `rewriteRegistrationProofs` reads. */
const REWRITE_BATCH_SIZE = 100;

/**
 * Rewrites each `registrations` row from before `proof` into the current shape: `proof` from its
 * three GitHub fields, and the three fields gone. A row with `proof` stays as it is, so a second run
 * changes nothing. Run once by hand after the deploy of RFC 133 PR 1, from apps/identity-hub, and
 * again with the answer's `continueCursor` until `isDone`:
 *
 *   npx convex run --prod moderation:rewriteRegistrationProofs '{"cursor": null}'
 */
export const rewriteRegistrationProofs = internalMutation({
  args: { cursor: union(string(), v.null()) },
  returns: object({ rewritten: number(), continueCursor: string(), isDone: boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("registrations")
      .paginate({ cursor: args.cursor, numItems: REWRITE_BATCH_SIZE });
    let rewritten = 0;
    for (const row of page.page) {
      if (row.proof !== undefined) {
        continue;
      }
      await ctx.db.replace("registrations", row._id, {
        clientId: row.clientId,
        githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
        githubOwnerId: row.githubOwnerId,
        githubRepository: row.githubRepository,
        proof: readProof(row),
        stage: row.stage,
        app: row.app,
        redirectUri: row.redirectUri,
        registeredAt: row.registeredAt,
      });
      rewritten += 1;
    }
    return { rewritten, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const countRegistrations = moderationEndpoint(async (ctx) =>
  reply(200, await ctx.runQuery(internal.moderation.registrationCounts, { now: Date.now() })),
);

export const listBlocks = moderationEndpoint(async (ctx) =>
  reply(200, await ctx.runQuery(internal.moderation.blockList, {})),
);

/** Every client at the broker, newest first, up to `CLIENT_LIST_LIMIT`. */
export const listClients = moderationEndpoint(async (ctx) =>
  reply(200, await ctx.runQuery(internal.moderation.clientList, {})),
);

/** The change, if its ids are GitHub ids and its reason and admin are given. */
function readBlockChange(body: unknown): BlockChange | null {
  if (!validate(vBlockChange, body)) {
    return null;
  }
  const reason = body.reason.trim();
  const adminEmail = body.adminEmail.trim();
  return /^[1-9][0-9]*$/.test(body.githubId) &&
    reason !== "" &&
    reason.length <= MAX_REASON_LENGTH &&
    adminEmail !== "" &&
    adminEmail.length <= MAX_EMAIL_LENGTH
    ? {
        action: body.action,
        kind: body.kind,
        githubId: body.githubId,
        reason,
        adminEmail,
      }
    : null;
}

/** Blocks or unblocks one repository or owner. Answers `{ changed }`. */
export const changeBlock = moderationEndpoint(async (ctx, request) => {
  const change = readBlockChange(await request.json().catch(() => null));
  if (change === null) {
    return reply(400, { error: "invalid_request" });
  }
  return reply(
    200,
    await ctx.runMutation(internal.moderation.setBlock, {
      action: change.action,
      kind: change.kind,
      githubId: change.githubId,
      reason: change.reason,
      adminEmail: change.adminEmail,
    }),
  );
});
