import { validate } from "convex-helpers/validators";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
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

/** One page of `GET /moderation/registrations`. */
const REGISTRATION_PAGE_SIZE = 50;
/** The most rows that one count reads. A count that reaches it is "at least". */
const COUNT_READ_LIMIT = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
/** The newest blocks and events that `GET /moderation/blocks` returns. */
const BLOCK_LIST_LIMIT = 200;
const EVENT_LIST_LIMIT = 100;
const MAX_REASON_LENGTH = 1_000;
const MAX_EMAIL_LENGTH = 320;

const vRegistration = object({
  clientId: string(),
  githubRepositoryDatabaseId: string(),
  githubOwnerId: string(),
  githubRepository: string(),
  githubActorId: string(),
  githubActorLogin: string(),
  commitSha: string(),
  stage: string(),
  app: string(),
  redirectUri: string(),
  registeredAt: number(),
});

const vCount = object({ count: number(), atLeast: boolean() });

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

export const registrationPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vRegistration),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("registrations")
      .withIndex("by_registered_at")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(({ _id, _creationTime, ...registration }) => registration),
    };
  },
});

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

/**
 * Copies samebase.com's `hubClientRegistrations` rows here with their original times, once, between
 * the two pull requests of RFC 130. A row whose client id is here already is skipped, so a second
 * run inserts nothing. The broker's tenants of those clients were registered without an owner, so
 * each gets the owner of its newest row, and an owner block covers them; a tenant with an owner
 * keeps it. From apps/samebase, following docs/convex-production-reads.md, then from
 * apps/identity-hub:
 *
 *   npx convex data hubClientRegistrations --prod --limit 100000 --format jsonArray > rows.json
 *   jq '{rows: [.[] | del(._id) | .registeredAt = ._creationTime | del(._creationTime)]}' rows.json > import.json
 *   npx convex run --prod moderation:importRegistrations "$(cat import.json)"
 */
export const importRegistrations = internalMutation({
  args: { rows: array(vRegistration) },
  returns: object({ inserted: number(), skipped: number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    const newestFirst = [...args.rows].sort((a, b) => b.registeredAt - a.registeredAt);
    for (const row of newestFirst) {
      await ctx.runMutation(components.identityBroker.registration.recordOwner, {
        tenantId: `gh-${row.githubRepositoryDatabaseId}`,
        ownerId: row.githubOwnerId,
      });
      const existing = await ctx.db
        .query("registrations")
        .withIndex("by_client_id", (q) => q.eq("clientId", row.clientId))
        .unique();
      if (existing !== null) {
        continue;
      }
      await ctx.db.insert("registrations", {
        clientId: row.clientId,
        githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
        githubOwnerId: row.githubOwnerId,
        githubRepository: row.githubRepository,
        githubActorId: row.githubActorId,
        githubActorLogin: row.githubActorLogin,
        commitSha: row.commitSha,
        stage: row.stage,
        app: row.app,
        redirectUri: row.redirectUri,
        registeredAt: row.registeredAt,
      });
      inserted += 1;
    }
    return { inserted, skipped: args.rows.length - inserted };
  },
});

/** Registrations newest first, `REGISTRATION_PAGE_SIZE` at a time. `?cursor=` reads the next page. */
export const listRegistrations = moderationEndpoint(async (ctx, request) => {
  const cursor = new URL(request.url).searchParams.get("cursor");
  return reply(
    200,
    await ctx.runQuery(internal.moderation.registrationPage, {
      paginationOpts: { numItems: REGISTRATION_PAGE_SIZE, cursor },
    }),
  );
});

export const countRegistrations = moderationEndpoint(async (ctx) =>
  reply(200, await ctx.runQuery(internal.moderation.registrationCounts, { now: Date.now() })),
);

export const listBlocks = moderationEndpoint(async (ctx) =>
  reply(200, await ctx.runQuery(internal.moderation.blockList, {})),
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
