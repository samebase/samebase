import { v, type Infer } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readBlock, tenantIdOf, tenantRow } from "./apps";
import { registrationOf, vRegistration } from "./policy";
import { vBlockKind, vDeploymentType } from "./schema";
import { exemptionOf, vExemption } from "./signInPage";

// The database half of `/moderation/*` (src/client/moderation.ts). The answers keep the names that
// samebase.com's admin page reads (apps/samebase/convex/hubClients/moderation.ts).

const { array, boolean, literal, number, object, string, union } = v;

/** The most rows that one count reads. A count that reaches it is "at least". */
const COUNT_READ_LIMIT = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
/** The newest blocks and events that `blockList` returns. */
const BLOCK_LIST_LIMIT = 200;
const EVENT_LIST_LIMIT = 100;
/** The newest clients that `clientList` returns. A list that reaches it says so. */
const CLIENT_LIST_LIMIT = 500;

const vCount = object({ count: number(), atLeast: boolean() });

/** Who made a client, from `clients.registeredBy`, with the repository id of the client's tenant. */
const vRegisteredByView = union(
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
);

/** One client of any app, with no secret, hash, or token. */
const vClientView = object({
  clientId: string(),
  appId: string(),
  clientName: string(),
  deploymentType: vDeploymentType,
  /** The one address where the broker sends people back with a code. */
  redirectUri: string(),
  createdAt: number(),
  /** The registration, or the last renewal. */
  renewedAt: number(),
  lastSignInAt: union(number(), v.null()),
  /** When `cleanup` deletes the client. Null: never. */
  removeAt: union(number(), v.null()),
  registeredBy: vRegisteredByView,
  /** The enrollment: the connectors the client's sign-ins may use. */
  connectors: array(string()),
});

const vBlockView = object({
  kind: vBlockKind,
  githubId: string(),
  reason: string(),
  adminEmail: string(),
  createdAt: number(),
});

const vBlockEventView = object({
  action: union(literal("block"), literal("unblock")),
  kind: vBlockKind,
  githubId: string(),
  reason: string(),
  adminEmail: string(),
  createdAt: number(),
});

async function countSince(ctx: QueryCtx, since: number) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_kind_and_at", (q) => q.eq("kind", "registration").gt("at", since))
    .take(COUNT_READ_LIMIT);
  return { count: rows.length, atLeast: rows.length === COUNT_READ_LIMIT };
}

/** The registrations of the last day and of the last week, each read up to `COUNT_READ_LIMIT`. */
export const counts = query({
  args: { now: number() },
  returns: object({ day: vCount, week: vCount }),
  handler: async (ctx, args) => ({
    day: await countSince(ctx, args.now - DAY_MS),
    week: await countSince(ctx, args.now - 7 * DAY_MS),
  }),
});

/** The newest blocks and the newest block events, newest first. */
export const blockList = query({
  args: {},
  returns: object({ blocks: array(vBlockView), events: array(vBlockEventView) }),
  handler: async (ctx) => {
    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_at")
      .order("desc")
      .take(BLOCK_LIST_LIMIT);
    const events = await ctx.db
      .query("events")
      .withIndex("by_kind_and_at", (q) => q.eq("kind", "block_change"))
      .order("desc")
      .take(EVENT_LIST_LIMIT);
    return {
      blocks: blocks.map((block) => ({
        kind: block.kind,
        githubId: block.githubId,
        reason: block.reason,
        adminEmail: block.adminEmail,
        createdAt: block.at,
      })),
      events: events.flatMap((event) =>
        event.kind === "block_change"
          ? [
              {
                action: event.action,
                kind: event.scope,
                githubId: event.githubId,
                reason: event.reason,
                adminEmail: event.adminEmail,
                createdAt: event.at,
              },
            ]
          : [],
      ),
    };
  },
});

/**
 * A client with who made it, without its secret, hash, or token. A client of an app whose tenant is
 * not a repository's (`registration.register` with another tenant) fails: a hub has none.
 */
function clientView(
  client: Doc<"clients">,
  repositoryId: string | undefined,
): Infer<typeof vClientView> {
  if (repositoryId === undefined) {
    throw new Error(`The client ${client.clientId} is not of a repository's app`);
  }
  const { registeredBy } = client;
  const repository = {
    githubRepository: registeredBy.githubRepository,
    githubRepositoryDatabaseId: repositoryId,
    githubOwnerId: registeredBy.githubOwnerId,
    app: client.app,
  };
  return {
    clientId: client.clientId,
    appId: client.appId,
    clientName: client.clientName,
    deploymentType: client.deploymentType,
    redirectUri: client.redirectUri,
    createdAt: client.createdAt,
    renewedAt: client.renewedAt,
    lastSignInAt: client.lastSignInAt ?? null,
    removeAt: client.removeAt ?? null,
    registeredBy:
      registeredBy.kind === "github"
        ? { kind: "github", ...repository, githubActorLogin: registeredBy.githubActorLogin }
        : { kind: "initial_access_token", ...repository, issuedAt: registeredBy.issuedAt },
    connectors: client.connectors,
  };
}

/** The repository id of a tenant `gh-<id>`, or undefined for any other tenant. */
function repositoryIdOf(tenantId: string | undefined) {
  return /^gh-([1-9][0-9]*)$/.exec(tenantId ?? "")?.[1];
}

/**
 * A client of the lists, with what the HTTP endpoint needs to say what decides its sign-in page:
 * the tenant's recorded owner, the client's policy facts, and the exemptions that cover it.
 */
const vClientEntry = object({
  client: vClientView,
  ownerId: union(string(), v.null()),
  registration: union(vRegistration, v.null()),
  exemption: vExemption,
});

async function clientEntry(
  ctx: QueryCtx,
  client: Doc<"clients">,
  app: Doc<"apps"> | null,
): Promise<Infer<typeof vClientEntry>> {
  const tenant = app === null ? null : await tenantRow(ctx, app.tenantId);
  return {
    client: clientView(client, repositoryIdOf(app?.tenantId)),
    ownerId: tenant?.ownerId ?? null,
    registration: app === null ? null : await registrationOf(ctx, client, app),
    exemption: await exemptionOf(ctx, {
      appId: client.appId,
      tenantOwnerId: tenant?.ownerId,
      clientOwnerId: client.registeredBy.githubOwnerId,
    }),
  };
}

/** The newest clients of every app, each with who made it. */
export const clientList = query({
  args: {},
  returns: object({ clients: array(vClientEntry), limitReached: boolean() }),
  handler: async (ctx) => {
    const clients = await ctx.db.query("clients").order("desc").take(CLIENT_LIST_LIMIT);
    const entries = [];
    for (const client of clients) {
      const app = await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
        .unique();
      entries.push(await clientEntry(ctx, client, app));
    }
    return { clients: entries, limitReached: clients.length === CLIENT_LIST_LIMIT };
  },
});

/**
 * Every client of the given repositories, newest first. Each repository has at most
 * `MAX_APPS_PER_TENANT` apps of `MAX_CLIENTS_PER_APP` clients, and the HTTP endpoint caps the
 * repositories of one request, so the list needs no limit.
 */
export const repositoryClients = query({
  args: { githubRepositoryDatabaseIds: array(string()) },
  returns: array(vClientEntry),
  handler: async (ctx, args) => {
    const entries = [];
    for (const repositoryId of args.githubRepositoryDatabaseIds) {
      const apps = await ctx.db
        .query("apps")
        .withIndex("by_tenant_id", (q) => q.eq("tenantId", tenantIdOf(repositoryId)))
        .collect();
      for (const app of apps) {
        for (const client of await ctx.db
          .query("clients")
          .withIndex("by_app_id", (q) => q.eq("appId", app.appId))
          .collect()) {
          entries.push(await clientEntry(ctx, client, app));
        }
      }
    }
    return entries.sort(
      (a, b) =>
        b.client.createdAt - a.client.createdAt ||
        a.client.clientId.localeCompare(b.client.clientId),
    );
  },
});

/**
 * Blocks or unblocks a repository or an owner, and appends the event, in one transaction. A block
 * stops every client of the repository, or of every repository whose recorded owner it is, at once:
 * `isStopped` reads this table. A change that is already in place changes nothing and appends
 * nothing.
 */
export const setBlock = mutation({
  args: {
    action: union(literal("block"), literal("unblock")),
    kind: vBlockKind,
    githubId: string(),
    reason: string(),
    adminEmail: string(),
  },
  returns: object({ changed: boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
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
        at: now,
      });
    } else {
      if (row === null) {
        return { changed: false };
      }
      await ctx.db.delete("blocks", row._id);
    }
    await ctx.db.insert("events", {
      kind: "block_change",
      action: args.action,
      scope: args.kind,
      githubId: args.githubId,
      reason: args.reason,
      adminEmail: args.adminEmail,
      at: now,
    });
    return { changed: true };
  },
});
