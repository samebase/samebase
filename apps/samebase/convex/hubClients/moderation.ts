import { notEmpty } from "@samebase/dependent/main";
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
  /** The repository's owner that the hub recorded last, which a repository's exemption binds to. */
  ownerId: union(string(), v.null()),
  /**
  Whether the hub shows its sign-in page to this client's users: `shown`, or the exemption that
  skips it. Null when the client cannot sign in at all.
  */
  signInPage: union(literal("shown"), literal("every_app"), literal("repository"), v.null()),
  /**
  The hub's connectors that its policy gives the client, the enrolled ones it may use now, and those
  of them that only an admin's grant to its repository allows. Null when the client cannot sign in.
  */
  policyConnectors: union(array(string()), v.null()),
  usableConnectors: union(array(string()), v.null()),
  grantedConnectors: union(array(string()), v.null()),
});

const vClientList = object({ clients: array(vClient), limitReached: boolean() });

/** The exemptions from the hub's sign-in page. */
const vSignInPageList = object({
  everyApp: union(object({ reason: string() }), v.null()),
  repositories: array(
    object({
      repositoryId: string(),
      ownerId: string(),
      /** False while the hub has recorded another owner: the row then covers no client. */
      active: boolean(),
      reason: string(),
    }),
  ),
});

/** The hub's connectors, which a grant may name, and every connector grant. */
const vConnectorGrantList = object({
  connectors: array(string()),
  grants: array(
    object({
      repositoryId: string(),
      ownerId: string(),
      connector: string(),
      /** False while the hub has recorded another owner: the row then grants nothing. */
      active: boolean(),
      reason: string(),
    }),
  ),
});

const vSignInPageTarget = union(
  object({ scope: literal("every_app") }),
  object({ scope: literal("repository"), repositoryId: string(), expectedOwnerId: string() }),
);

/** The fields of GitHub's repository answer that the hub's levers need. */
const vGitHubRepository = object({
  id: number(),
  full_name: string(),
  owner: object({ id: number() }),
});

/** `owner/name` as GitHub allows them; `.` and `..` are not repository names. */
const GITHUB_FULL_NAME = /^([A-Za-z0-9-]+)\/(?!\.\.?$)([A-Za-z0-9._-]+)$/;

const vRepositoryClients = object({ clients: array(vClient) });

const vChangeResult = object({ changed: boolean() });

const vOff = object({ status: literal("off") });

/**
The two identity hubs: `samebase`, samebase.com's own (IDENTITY_HUB_ISSUER, which also signs
samebase.com in, with its connections and the connector grants), and `public`, where apps made from
the starter sign in (PUBLIC_IDENTITY_HUB_ISSUER, deployed from samebase/identity-hub).
*/
const vHub = union(literal("samebase"), literal("public"));
type Hub = Infer<typeof vHub>;
const HUBS: readonly Hub[] = ["samebase", "public"];

type Moderation = { hub: Hub; issuer: string; key: string };

/**
A hub's moderation endpoints, or null while its key is unset: the admin page then says that
moderation of that hub is off. The key can only read registration counts, clients, blocks,
exemptions from the sign-in page, and connector grants, set blocks, exemptions, and grants, and
delete clients at the hub. samebase.com decides who may use it: an admin for every app, a member of
an organization for the clients of its connected repositories. The hub comes from this fixed pair,
never from a caller's URL, so no request can send a key to another host.
*/
function readModeration(hub: Hub): Moderation | null {
  const [issuer, key] =
    hub === "samebase"
      ? [env.IDENTITY_HUB_ISSUER, env.IDENTITY_HUB_MODERATION_KEY]
      : [env.PUBLIC_IDENTITY_HUB_ISSUER, env.PUBLIC_IDENTITY_HUB_MODERATION_KEY];
  const trimmed = key?.trim();
  return issuer && trimmed ? { hub, issuer, key: trimmed } : null;
}

/** One request to a moderation endpoint, with the key. */
async function fetchHub(
  moderation: Moderation,
  request: { method: "GET" | "POST" | "DELETE"; path: string; body?: unknown },
): Promise<Response> {
  return await fetch(`${moderation.issuer}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${moderation.key}`,
      "Content-Type": "application/json",
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** The validated answer of one moderation endpoint. A refusal or a bad answer throws. */
async function callHub<T>(
  moderation: Moderation,
  request: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    validator: Validator<T, "required", string>;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetchHub(moderation, request);
  const body: unknown = response.ok ? await response.json() : null;
  if (!validate(request.validator, body)) {
    throw new Error(`The identity hub answered ${response.status} without a usable answer.`);
  }
  return body;
}

/**
The registration counts of the last day and week, the blocks, the newest block events, the
newest clients of every app at one hub, each with who made it, the exemptions from the hub's
sign-in page, and the connector grants.
*/
export const readOverview = action({
  access: "access_admin",
  args: { hub: vHub },
  returns: union(
    vOff,
    object({
      status: literal("on"),
      issuer: string(),
      counts: vCounts,
      blockList: vBlockList,
      clientList: vClientList,
      signInPage: vSignInPageList,
      connectorGrants: vConnectorGrantList,
    }),
  ),
  handler: async (_ctx, args) => {
    const moderation = readModeration(args.hub);
    if (moderation === null) {
      return { status: "off" as const };
    }

    const [counts, blockList, clientList, signInPage, connectorGrants] = await Promise.all([
      callHub(moderation, { method: "GET", path: "/moderation/counts", validator: vCounts }),
      callHub(moderation, { method: "GET", path: "/moderation/blocks", validator: vBlockList }),
      callHub(moderation, { method: "GET", path: "/moderation/clients", validator: vClientList }),
      callHub(moderation, {
        method: "GET",
        path: "/moderation/sign-in-page",
        validator: vSignInPageList,
      }),
      callHub(moderation, {
        method: "GET",
        path: "/moderation/connector-grants",
        validator: vConnectorGrantList,
      }),
    ]);
    return {
      status: "on" as const,
      issuer: moderation.issuer,
      counts,
      blockList,
      clientList,
      signInPage,
      connectorGrants,
    };
  },
});

/**
The GitHub ids of a repository by `owner/name`, for a grant or an exemption. A repository that the
hub has clients of gives its tenant's id and recorded owner; another one, GitHub's answer to a
request without a token. `not_found` when neither knows it, such as a private repository that never
registered.
*/
export const lookupRepository = action({
  access: "access_admin",
  args: { hub: vHub, fullName: string() },
  returns: union(
    vOff,
    object({ status: literal("not_found") }),
    object({ status: literal("found"), repositoryId: string(), ownerId: string(), name: string() }),
  ),
  handler: async (_ctx, args) => {
    const moderation = readModeration(args.hub);
    if (moderation === null) {
      return { status: "off" as const };
    }
    const fullName = args.fullName.trim();
    const match = GITHUB_FULL_NAME.exec(fullName);
    if (match === null) {
      return { status: "not_found" as const };
    }

    const { clients } = await callHub(moderation, {
      method: "GET",
      path: "/moderation/clients",
      validator: vClientList,
    });
    // Only the newest client of each repository (the list is newest first) names it: an older name
    // can belong to another repository now, or to none, so it goes to GitHub.
    const client = clients.find(
      (candidate, index) =>
        candidate.registeredBy.githubRepository.toLowerCase() === fullName.toLowerCase() &&
        clients.findIndex(
          (other) =>
            other.registeredBy.githubRepositoryDatabaseId ===
            candidate.registeredBy.githubRepositoryDatabaseId,
        ) === index,
    );
    if (client !== undefined && client.ownerId !== null) {
      return {
        status: "found" as const,
        repositoryId: client.registeredBy.githubRepositoryDatabaseId,
        ownerId: client.ownerId,
        name: client.registeredBy.githubRepository,
      };
    }
    const response = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "samebase-app",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
      return { status: "not_found" as const };
    }
    const body: unknown = response.ok ? await response.json() : null;
    if (!validate(vGitHubRepository, body, { allowUnknownFields: true })) {
      throw new Error(`GitHub answered ${response.status} without a usable answer.`);
    }
    return {
      status: "found" as const,
      repositoryId: String(body.id),
      ownerId: String(body.owner.id),
      name: body.full_name,
    };
  },
});

/**
Grants (`grant: true`) or revokes one of the hub's connectors for one repository and owner, in the
name of the signed-in admin. A grant names the owner that the admin saw: the hub answers
`owner_changed` when it recorded another owner, and `unknown_connector` for a connector it does not
have. A revoke removes the row of the owner it names.
*/
export const changeConnectorGrant = action({
  access: "access_admin",
  args: {
    hub: vHub,
    repositoryId: string(),
    connector: string(),
    expectedOwnerId: string(),
    grant: boolean(),
    reason: string(),
  },
  returns: union(
    vOff,
    object({
      status: literal("on"),
      result: union(
        literal("changed"),
        literal("unchanged"),
        literal("owner_changed"),
        literal("unknown_connector"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const moderation = readModeration(args.hub);
    if (moderation === null) {
      return { status: "off" as const };
    }

    const response = await fetchHub(moderation, {
      method: "POST",
      path: "/moderation/connector-grants",
      body: {
        repositoryId: args.repositoryId,
        connector: args.connector,
        expectedOwnerId: args.expectedOwnerId,
        grant: args.grant,
        reason: args.reason,
        adminEmail: ctx.viewer.user.email,
      },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && validate(vChangeResult, body)) {
      return {
        status: "on" as const,
        result: body.changed ? ("changed" as const) : ("unchanged" as const),
      };
    }
    if (
      (response.status === 409 || response.status === 400) &&
      validate(
        object({ error: union(literal("owner_changed"), literal("unknown_connector")) }),
        body,
      )
    ) {
      return { status: "on" as const, result: body.error };
    }
    throw new Error(`The identity hub answered ${response.status} without a usable answer.`);
  },
});

/**
Skips (`skip: true`) or shows again the hub's sign-in page for every app or for one repository and
owner, in the name of the signed-in admin. A skip names the owner that the admin saw: the hub answers
`owner_changed` when it recorded another owner. A show removes the row of the owner it names.
*/
export const changeSignInPage = action({
  access: "access_admin",
  args: { hub: vHub, target: vSignInPageTarget, skip: boolean(), reason: string() },
  returns: union(
    vOff,
    object({
      status: literal("on"),
      result: union(literal("changed"), literal("unchanged"), literal("owner_changed")),
    }),
  ),
  handler: async (ctx, args) => {
    const moderation = readModeration(args.hub);
    if (moderation === null) {
      return { status: "off" as const };
    }

    const response = await fetchHub(moderation, {
      method: "POST",
      path: "/moderation/sign-in-page",
      body: {
        target: args.target,
        skip: args.skip,
        reason: args.reason,
        adminEmail: ctx.viewer.user.email,
      },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && validate(vChangeResult, body)) {
      return {
        status: "on" as const,
        result: body.changed ? ("changed" as const) : ("unchanged" as const),
      };
    }
    if (response.status === 409 && validate(object({ error: literal("owner_changed") }), body)) {
      return { status: "on" as const, result: body.error };
    }
    throw new Error(`The identity hub answered ${response.status} without a usable answer.`);
  },
});

/**
Blocks or unblocks a repository or an owner at the hub, in the name of the signed-in admin. The hub
refuses a change without a reason or with an id that is not a GitHub id.
*/
export const changeBlock = action({
  access: "access_admin",
  args: { hub: vHub, action: vBlockAction, kind: vBlockKind, githubId: string(), reason: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (ctx, args) => {
    const moderation = readModeration(args.hub);
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

/** A client of an organization's repository, with the hub that holds it. */
const vOrganizationClient = object({ ...vClient.fields, hub: vHub });

/** The hubs whose moderation key is set. */
const readModerations = () => HUBS.map(readModeration).filter(notEmpty);

/** The clients of an organization's connected repositories at every hub of `moderations`. */
async function readOrganizationClients(
  ctx: Pick<ActionCtx, "runQuery">,
  moderations: readonly Moderation[],
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<Infer<typeof vOrganizationClient>[]> {
  const repositoryIds = await ctx.runQuery(
    internal.hubClients.moderation.readOrganizationRepositoryIds,
    { userId: args.userId, organizationId: args.organizationId },
  );
  const clients = [];
  for (const moderation of moderations) {
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
      clients.push(...answer.clients.map((client) => ({ ...client, hub: moderation.hub })));
    }
  }
  return clients.sort((a, b) => b.createdAt - a.createdAt || a.clientId.localeCompare(b.clientId));
}

/**
The clients of an organization's connected repositories at both hubs, for a member, newest first,
each with who made it: an app that moved to the public hub keeps showing its old clients until they
are deleted.
*/
export const readClientsOfOrganization = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: union(vOff, object({ status: literal("on"), clients: array(vOrganizationClient) })),
  handler: async (ctx, args) => {
    const moderations = readModerations();
    if (moderations.length === 0) {
      return { status: "off" as const };
    }
    const clients = await readOrganizationClients(ctx, moderations, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return { status: "on" as const, clients };
  },
});

/**
Deletes one client of an organization's repositories, at the hub that holds it. The client must be
in the organization's list, so a member can delete only the clients of repositories they may see.
The deployment that held it gets a new client at its next deploy.
*/
export const deleteClientOfOrganization = action({
  access: "access_app_create",
  args: { organizationId: id("organizations"), clientId: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (ctx, args) => {
    const moderations = readModerations();
    if (moderations.length === 0) {
      return { status: "off" as const };
    }
    const clients = await readOrganizationClients(ctx, moderations, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const client = clients.find((candidate) => candidate.clientId === args.clientId);
    const moderation = moderations.find((candidate) => candidate.hub === client?.hub);
    if (moderation === undefined) {
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
