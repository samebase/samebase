import { validate } from "convex-helpers/validators";
import { v, type Infer, type Validator } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, internalQuery, type ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { requireOrganizationAccessContext } from "../organizationAccess";

const { array, boolean, id, literal, number, object, string, union } = v;

/** A hung hub must not hold the admin page. */
const REQUEST_TIMEOUT_MS = 10_000;

const vBlockKind = union(literal("repository"), literal("owner"));
const vBlockAction = union(literal("block"), literal("unblock"));

// The answers of the hub's `/moderation/*` endpoints in
// packages/identity-broker/src/component/moderation.ts.

const vCount = object({ count: number(), atLeast: boolean() });
const vCounts = object({ day: vCount, week: vCount });

const vBlockList = object({
  blocks: array(
    object({
      kind: vBlockKind,
      githubId: string(),
      reason: string(),
      adminEmail: string(),
      createdAt: number(),
    }),
  ),
  events: array(
    object({
      action: vBlockAction,
      kind: vBlockKind,
      githubId: string(),
      reason: string(),
      adminEmail: string(),
      createdAt: number(),
    }),
  ),
});

const vClient = object({
  clientId: string(),
  appId: string(),
  clientName: string(),
  deploymentType: union(literal("production"), literal("development"), literal("preview")),
  redirectUri: string(),
  createdAt: number(),
  renewedAt: number(),
  lastSignInAt: union(number(), v.null()),
  removeAt: union(number(), v.null()),
  registeredBy: union(
    object({
      kind: literal("github"),
      githubRepository: string(),
      githubRepositoryDatabaseId: string(),
      githubOwnerId: string(),
      githubActorLogin: string(),
      app: string(),
    }),
    object({
      kind: literal("initial_access_token"),
      githubRepository: string(),
      githubRepositoryDatabaseId: string(),
      githubOwnerId: string(),
      app: string(),
      issuedAt: number(),
    }),
  ),
  /** The connectors the client's sign-ins may use. */
  connectors: array(string()),
});

const vClientList = object({ clients: array(vClient), limitReached: boolean() });

const vRepositoryClients = object({ clients: array(vClient) });

const vChangeResult = object({ changed: boolean() });

const vOff = object({ status: literal("off") });

/**
The hub's moderation endpoints, or null while `HUB_MODERATION_KEY` is unset: the admin page then
says that moderation is off. The key can only read registration counts, clients, and blocks, set
blocks, and delete clients at the hub. samebase.com decides who may use it: an admin for every app,
a member of an organization for the clients of its connected repositories.
*/
function readModeration() {
  const key = env.HUB_MODERATION_KEY?.trim();
  return key ? { issuer: env.HUB_ISSUER, key } : null;
}

/** The validated answer of one moderation endpoint. A refusal or a bad answer throws. */
async function callHub<T>(
  moderation: { issuer: string; key: string },
  request: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    validator: Validator<T, "required", string>;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(`${moderation.issuer}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${moderation.key}`,
      "Content-Type": "application/json",
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = response.ok ? await response.json() : null;
  if (!validate(request.validator, body)) {
    throw new Error(`The identity hub answered ${response.status} without a usable answer.`);
  }
  return body;
}

/**
The registration counts of the last day and week, the blocks, the newest block events, and the
newest clients of every app at the hub, each with who made it.
*/
export const readOverview = action({
  access: "access_admin",
  args: {},
  returns: union(
    vOff,
    object({
      status: literal("on"),
      counts: vCounts,
      blockList: vBlockList,
      clientList: vClientList,
    }),
  ),
  handler: async () => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const [counts, blockList, clientList] = await Promise.all([
      callHub(moderation, { method: "GET", path: "/moderation/counts", validator: vCounts }),
      callHub(moderation, { method: "GET", path: "/moderation/blocks", validator: vBlockList }),
      callHub(moderation, { method: "GET", path: "/moderation/clients", validator: vClientList }),
    ]);
    return { status: "on" as const, counts, blockList, clientList };
  },
});

/**
Blocks or unblocks a repository or an owner at the hub, in the name of the signed-in admin. The hub
refuses a change without a reason or with an id that is not a GitHub id.
*/
export const changeBlock = action({
  access: "access_admin",
  args: { action: vBlockAction, kind: vBlockKind, githubId: string(), reason: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const { changed } = await callHub(moderation, {
      method: "POST",
      path: "/moderation/blocks",
      validator: vChangeResult,
      body: {
        action: args.action,
        kind: args.kind,
        githubId: args.githubId,
        reason: args.reason,
        adminEmail: ctx.viewer.user.email,
      },
    });
    return { status: "on" as const, changed };
  },
});

/** The repositories of one hub request: the hub's own limit. */
const REPOSITORIES_PER_REQUEST = 100;

/**
The GitHub ids of an organization's connected repositories, for a member of the organization. Only
connected repositories: a member may not have GitHub access to every repository of the owner, so the
owner's other repositories are not this organization's to see.
*/
export const readOrganizationRepositoryIds = internalQuery({
  args: { userId: id("users"), organizationId: id("organizations") },
  returns: array(string()),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_organization_and_state_and_deletion_state", (q) =>
        q.eq("organizationId", args.organizationId).eq("state", "connected"),
      )
      .collect();
    return repositories.flatMap((repository) =>
      repository.state === "connected" ? [repository.githubRepositoryDatabaseId] : [],
    );
  },
});

async function readOrganizationClients(
  ctx: Pick<ActionCtx, "runQuery">,
  moderation: { issuer: string; key: string },
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<Infer<typeof vClient>[]> {
  const repositoryIds = await ctx.runQuery(
    internal.hubClients.moderation.readOrganizationRepositoryIds,
    { userId: args.userId, organizationId: args.organizationId },
  );
  const clients = [];
  for (let start = 0; start < repositoryIds.length; start += REPOSITORIES_PER_REQUEST) {
    const query = repositoryIds
      .slice(start, start + REPOSITORIES_PER_REQUEST)
      .map((repositoryId) => `repository=${repositoryId}`)
      .join("&");
    const answer = await callHub(moderation, {
      method: "GET",
      path: `/moderation/clients?${query}`,
      validator: vRepositoryClients,
    });
    clients.push(...answer.clients);
  }
  return clients.sort((a, b) => b.createdAt - a.createdAt || a.clientId.localeCompare(b.clientId));
}

/**
The hub's clients of an organization's connected repositories, for a member, newest first, each
with who made it.
*/
export const readClientsOfOrganization = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: union(vOff, object({ status: literal("on"), clients: array(vClient) })),
  handler: async (ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }
    const clients = await readOrganizationClients(ctx, moderation, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return { status: "on" as const, clients };
  },
});

/**
Deletes one client of an organization's repositories at the hub. The client must be in the
organization's list, so a member can delete only the clients of repositories they may see. The
deployment that held it gets a new client at its next deploy.
*/
export const deleteClientOfOrganization = action({
  access: "access_app_create",
  args: { organizationId: id("organizations"), clientId: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }
    const clients = await readOrganizationClients(ctx, moderation, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    if (!clients.some((client) => client.clientId === args.clientId)) {
      return { status: "on" as const, changed: false };
    }
    const { changed } = await callHub(moderation, {
      method: "DELETE",
      path: `/moderation/clients/${args.clientId}`,
      validator: vChangeResult,
    });
    return { status: "on" as const, changed };
  },
});
