import {
  checkDocument,
  fetchDocument,
  parseClientId,
  refusalDescriptions,
} from "@samebase/identity-broker/cimd";
import {
  Client,
  ModerationApi,
  ModerationKey,
  OwnerChanged,
  UnknownConnector,
} from "@samebase/identity-broker/moderation-api";
import { validate } from "convex-helpers/validators";
import { v, type Infer } from "convex/values";
import { Effect } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, internalQuery, type ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { requireOrganizationMembership } from "../organizationAccess";

const { array, boolean, id, literal, number, object, string, union } = v;

/** A hung broker must not hold the admin page. */
const REQUEST_TIMEOUT_MS = 10_000;

const vBlockKind = union(literal("repository"), literal("owner"));
const vBlockAction = union(literal("block"), literal("unblock"));

// The broker's answers as `ModerationApi` of @samebase/identity-broker/moderation-api declares them.
// The typed client decodes them; each action's return type checks them against these validators.

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
  /** The return addresses the client may name, sorted. */
  redirectUris: array(string()),
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
  /** The repository's owner that the broker recorded last, which a repository's exemption binds to. */
  ownerId: union(string(), v.null()),
  /**
  Whether the broker shows its sign-in page to this client's users: `shown`, or the exemption that
  skips it. Null when the client cannot sign in at all.
  */
  signInPage: union(literal("shown"), literal("every_app"), literal("repository"), v.null()),
  /**
  The broker's connectors that its policy gives the client, the enrolled ones it may use now, and those
  of them that only an admin's grant to its repository allows. Null when the client cannot sign in.
  */
  policyConnectors: union(array(string()), v.null()),
  usableConnectors: union(array(string()), v.null()),
  grantedConnectors: union(array(string()), v.null()),
});

const vClientList = object({ clients: array(vClient), limitReached: boolean() });

/** The exemptions from the broker's sign-in page. */
const vSignInPageList = object({
  everyApp: union(object({ reason: string() }), v.null()),
  repositories: array(
    object({
      repositoryId: string(),
      ownerId: string(),
      /** False while the broker has recorded another owner: the row then covers no client. */
      active: boolean(),
      reason: string(),
    }),
  ),
});

/** The broker's connectors, which a grant may name, and every connector grant. */
const vConnectorGrantList = object({
  connectors: array(string()),
  grants: array(
    object({
      repositoryId: string(),
      ownerId: string(),
      connector: string(),
      /** False while the broker has recorded another owner: the row then grants nothing. */
      active: boolean(),
      reason: string(),
    }),
  ),
});

/** A site's metadata file as it is now: what it says about the site, or why the broker refuses it. */
const vSiteFile = union(
  object({
    status: literal("ok"),
    clientName: union(string(), v.null()),
    clientUri: union(string(), v.null()),
    logoUri: union(string(), v.null()),
    redirectUris: array(string()),
    /** The whole file, formatted. */
    json: string(),
  }),
  /** `json` is null when no JSON object was read. */
  object({ status: literal("refused"), reason: string(), json: union(string(), v.null()) }),
);

/** The sites of a broker's CIMD layer: each `clientId` is the address of a metadata file on `host`. */
const vSiteList = object({
  clients: array(
    object({
      clientId: string(),
      host: string(),
      createdAt: number(),
      lastSignInAt: union(number(), v.null()),
      /** Null past the newest `SITE_FILES_READ` sites. */
      file: union(vSiteFile, v.null()),
    }),
  ),
  limitReached: boolean(),
});

/** The files that one read of the page fetches, so the page stays fast. */
const SITE_FILES_READ = 50;

/**
Reads one site's file now with the broker's own reader (`@samebase/identity-broker/cimd`): no
redirect, no private or special-use address, at most 5 KB, 5 seconds. A stranger writes the file, so
nothing of it is followed or loaded, only shown as text.
*/
const readSiteFile = (clientId: string) =>
  Effect.gen(function* () {
    const parsed = parseClientId(clientId);
    if (parsed._tag !== "ClientId") {
      return { status: "refused" as const, reason: refusalDescriptions[parsed.code], json: null };
    }
    const fetched = yield* fetchDocument(parsed, (request) => fetch(request));
    if (fetched._tag !== "Document") {
      return { status: "refused" as const, reason: refusalDescriptions[fetched.code], json: null };
    }
    const json = JSON.stringify(fetched.json, null, 2);
    const checked = checkDocument(parsed.id, fetched.json);
    if (checked._tag !== "Checked") {
      return { status: "refused" as const, reason: refusalDescriptions[checked.code], json };
    }
    return {
      json,
      status: "ok" as const,
      clientName: checked.selfAsserted.clientName ?? null,
      clientUri: checked.selfAsserted.clientUri ?? null,
      logoUri: checked.selfAsserted.logoUri ?? null,
      redirectUris: checked.redirectUris.map(({ uri }) => uri),
    };
  });

/** The blocked hosts of a broker's CIMD layer, newest first. */
const vHostBlockList = object({
  blocks: array(object({ host: string(), createdAt: number() })),
  limitReached: boolean(),
});

const vSignInPageTarget = union(
  object({ scope: literal("every_app") }),
  object({ scope: literal("repository"), repositoryId: string(), expectedOwnerId: string() }),
);

/** The fields of GitHub's repository answer that the broker's levers need. */
const vGitHubRepository = object({
  id: number(),
  full_name: string(),
  owner: object({ id: number() }),
});

/** `owner/name` as GitHub allows them; `.` and `..` are not repository names. */
const GITHUB_FULL_NAME = /^([A-Za-z0-9-]+)\/(?!\.\.?$)([A-Za-z0-9._-]+)$/;

const vOff = object({ status: literal("off") });

type Moderation = { issuer: string; key: string };

/**
The moderation endpoints of the public identity broker, where apps made from the starter sign in
(PUBLIC_IDENTITY_HUB_ISSUER, deployed from samebase/identity-hub), or null while its key is unset:
the admin page then says that moderation is off. The key can only read registration counts,
clients, blocks, exemptions from the sign-in page, and connector grants, set blocks, exemptions, and
grants, and delete clients at the broker. samebase.com decides who may use it: an admin for every app,
an organization's owner for every repository of its GitHub owner, another member for the
organization's connected repositories. The broker comes from the deployment's env, never from a
caller's URL, so no request can send a key to another host.
*/
function readModeration(): Moderation | null {
  const issuer = env.PUBLIC_IDENTITY_HUB_ISSUER;
  const key = env.PUBLIC_IDENTITY_HUB_MODERATION_KEY?.trim();
  return issuer && key ? { issuer, key } : null;
}

const LOGIN_BROKER_ISSUER = "https://login.samebase.com";

/**
The moderation endpoints of login.samebase.com (samebase/public-identity-broker), whose only clients
are sites of its CIMD layer, or null while LOGIN_BROKER_MODERATION_KEY is unset. Only an admin uses
them: a site belongs to no organization.
*/
function readLoginModeration(): Moderation | null {
  const key = env.LOGIN_BROKER_MODERATION_KEY?.trim();
  return key ? { issuer: LOGIN_BROKER_ISSUER, key } : null;
}

type BrokerClient = HttpApiClient.ForApi<typeof ModerationApi>["moderation"];

/** The decoded answer of `request` through the typed client. A refusal or a bad answer throws. */
async function askBroker<A, E>(
  moderation: Moderation,
  request: (broker: BrokerClient) => Effect.Effect<A, E>,
): Promise<A> {
  return await Effect.runPromise(
    HttpApiClient.make(ModerationApi, { baseUrl: moderation.issuer }).pipe(
      Effect.flatMap((client) => request(client.moderation)),
      Effect.timeout(REQUEST_TIMEOUT_MS),
      Effect.provide(
        HttpApiMiddleware.layerClient(ModerationKey, ({ next, request }) =>
          next(HttpClientRequest.bearerToken(request, moderation.key)),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    ),
  );
}

// A Convex return value has no readonly array, so each array of an answer is copied.
const ownClient = (client: typeof Client.Type) => ({
  ...client,
  redirectUris: [...client.redirectUris],
  connectors: [...client.connectors],
  policyConnectors: client.policyConnectors && [...client.policyConnectors],
  usableConnectors: client.usableConnectors && [...client.usableConnectors],
  grantedConnectors: client.grantedConnectors && [...client.grantedConnectors],
});

/**
The registration counts of the last day and week, the blocks, the newest block events, the
newest clients of every app at one broker, each with who made it, the exemptions from the broker's
sign-in page, and the connector grants.
*/
export const readOverview = action({
  access: "access_admin",
  args: {},
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
  handler: async () => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const [counts, blockList, clientList, signInPage, connectorGrants] = await askBroker(
      moderation,
      (broker) =>
        Effect.all(
          [
            broker.counts(),
            broker.blocks(),
            broker.clients({ query: {} }),
            broker.signInPage(),
            broker.connectorGrants(),
          ],
          { concurrency: "unbounded" },
        ),
    );
    return {
      status: "on" as const,
      issuer: moderation.issuer,
      counts,
      blockList: { blocks: [...blockList.blocks], events: [...blockList.events] },
      clientList: {
        clients: clientList.clients.map(ownClient),
        limitReached: clientList.limitReached,
      },
      signInPage: { everyApp: signInPage.everyApp, repositories: [...signInPage.repositories] },
      connectorGrants: {
        connectors: [...connectorGrants.connectors],
        grants: [...connectorGrants.grants],
      },
    };
  },
});

/**
The GitHub ids of a repository by `owner/name`, for a grant or an exemption. A repository that the
broker has clients of gives its tenant's id and recorded owner; another one, GitHub's answer to a
request without a token. `not_found` when neither knows it, such as a private repository that never
registered.
*/
export const lookupRepository = action({
  access: "access_admin",
  args: { fullName: string() },
  returns: union(
    vOff,
    object({ status: literal("not_found") }),
    object({ status: literal("found"), repositoryId: string(), ownerId: string(), name: string() }),
  ),
  handler: async (_ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }
    const fullName = args.fullName.trim();
    const match = GITHUB_FULL_NAME.exec(fullName);
    if (match === null) {
      return { status: "not_found" as const };
    }

    const { clients } = await askBroker(moderation, (broker) => broker.clients({ query: {} }));
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
Grants (`grant: true`) or revokes one of the broker's connectors for one repository and owner. A grant
names the owner that the admin saw: the broker answers
`owner_changed` when it recorded another owner, and `unknown_connector` for a connector it does not
have. A revoke removes the row of the owner it names.
*/
export const changeConnectorGrant = action({
  access: "access_admin",
  args: {
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
  handler: async (_ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const result = await askBroker(moderation, (broker) =>
      broker
        .changeConnectorGrant({
          payload: {
            repositoryId: args.repositoryId,
            connector: args.connector,
            expectedOwnerId: args.expectedOwnerId,
            grant: args.grant,
            reason: args.reason,
          },
        })
        .pipe(
          Effect.map(({ changed }) => (changed ? ("changed" as const) : ("unchanged" as const))),
          Effect.catchIf(
            (error) => error instanceof OwnerChanged || error instanceof UnknownConnector,
            (refusal) => Effect.succeed(refusal.error),
          ),
        ),
    );
    return { status: "on" as const, result };
  },
});

/**
Skips (`skip: true`) or shows again the broker's sign-in page for every app or for one repository and
owner. A skip names the owner that the admin saw: the broker answers
`owner_changed` when it recorded another owner. A show removes the row of the owner it names.
*/
export const changeSignInPage = action({
  access: "access_admin",
  args: { target: vSignInPageTarget, skip: boolean(), reason: string() },
  returns: union(
    vOff,
    object({
      status: literal("on"),
      result: union(literal("changed"), literal("unchanged"), literal("owner_changed")),
    }),
  ),
  handler: async (_ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const result = await askBroker(moderation, (broker) =>
      broker
        .changeSignInPage({
          payload: {
            target: args.target,
            skip: args.skip,
            reason: args.reason,
          },
        })
        .pipe(
          Effect.map(({ changed }) => (changed ? ("changed" as const) : ("unchanged" as const))),
          Effect.catchIf(
            (error) => error instanceof OwnerChanged,
            (refusal) => Effect.succeed(refusal.error),
          ),
        ),
    );
    return { status: "on" as const, result };
  },
});

/**
Blocks or unblocks a repository or an owner at the broker, in the name of the signed-in admin. The broker
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

    const { changed } = await askBroker(moderation, (broker) =>
      broker.changeBlock({
        payload: {
          action: args.action,
          kind: args.kind,
          githubId: args.githubId,
          reason: args.reason,
          adminEmail: ctx.viewer.user.email,
        },
      }),
    );
    return { status: "on" as const, changed };
  },
});

/** The newest sites that sign in at login.samebase.com, and its newest blocked hosts. */
export const readLoginBroker = action({
  access: "access_admin",
  args: {},
  returns: union(
    vOff,
    object({ status: literal("on"), siteList: vSiteList, hostBlockList: vHostBlockList }),
  ),
  handler: async () => {
    const moderation = readLoginModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const [clientList, hostBlockList] = await askBroker(moderation, (broker) =>
      Effect.all([broker.clients({ query: {} }), broker.hostBlocks()], {
        concurrency: "unbounded",
      }),
    );
    if (clientList.cimd === undefined) {
      throw new Error("login.samebase.com answered without its CIMD layer.");
    }
    const sites = clientList.cimd.clients;
    const clients = await Effect.runPromise(
      Effect.forEach(
        sites,
        (site, index) =>
          Effect.gen(function* () {
            const file = index < SITE_FILES_READ ? yield* readSiteFile(site.clientId) : null;
            return { ...site, file };
          }),
        { concurrency: 8 },
      ),
    );
    return {
      status: "on" as const,
      siteList: {
        clients,
        limitReached: clientList.cimd.limitReached,
      },
      hostBlockList: {
        blocks: [...hostBlockList.blocks],
        limitReached: hostBlockList.limitReached,
      },
    };
  },
});

/**
Blocks or unblocks sign-in at login.samebase.com for every site on one host. The broker takes a DNS
name in lower case; the typed client refuses another one before it sends the request.
*/
export const changeLoginHostBlock = action({
  access: "access_admin",
  args: { action: vBlockAction, host: string() },
  returns: union(vOff, object({ status: literal("on"), changed: boolean() })),
  handler: async (_ctx, args) => {
    const moderation = readLoginModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }

    const { changed } = await askBroker(moderation, (broker) =>
      broker.changeHostBlock({
        payload: { action: args.action, host: args.host.trim().toLowerCase() },
      }),
    );
    return { status: "on" as const, changed };
  },
});

/**
What a member of an organization may see at the broker. `ownerId` is the numeric GitHub id of the
organization's owner account, which the broker records as each repository's owner. An organization owner
installed Samebase on that GitHub account and sees every repository of it, connected in Samebase or
not (`repositoryIds` null). Another member may not have GitHub access to all of them, so they see
only the organization's connected repositories.
*/
export const readOrganizationScope = internalQuery({
  args: { userId: id("users"), organizationId: id("organizations") },
  returns: object({ ownerId: string(), repositoryIds: union(array(string()), v.null()) }),
  handler: async (ctx, args) => {
    const membership = await requireOrganizationMembership(ctx.db, {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    if (membership.role === "owner") {
      return { ownerId: organization.githubOwnerId, repositoryIds: null };
    }
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_organization_and_state_and_deletion_state", (q) =>
        q.eq("organizationId", args.organizationId).eq("state", "connected"),
      )
      .collect();
    return {
      ownerId: organization.githubOwnerId,
      repositoryIds: repositories.flatMap((repository) =>
        repository.state === "connected" ? [repository.githubRepositoryDatabaseId] : [],
      ),
    };
  },
});

/**
The clients that a member may see at the broker (`readOrganizationScope`), newest first, the GitHub
owner whose clients they are, and whether the broker stopped at its limit.
*/
async function readOrganizationClients(
  ctx: Pick<ActionCtx, "runQuery">,
  moderation: Moderation,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<{ ownerId: string; clients: Infer<typeof vClient>[]; limitReached: boolean }> {
  const scope = await ctx.runQuery(internal.brokerClients.moderation.readOrganizationScope, {
    userId: args.userId,
    organizationId: args.organizationId,
  });
  const answer = await askBroker(moderation, (broker) =>
    broker.clients({ query: { owner: scope.ownerId } }),
  );
  // An answer that does not name this owner may list every owner's clients: show none of it.
  if (answer.owner !== scope.ownerId) {
    throw new Error("The identity broker answered for another owner.");
  }
  const clients = answer.clients
    .filter(
      (client) =>
        scope.repositoryIds === null ||
        scope.repositoryIds.includes(client.registeredBy.githubRepositoryDatabaseId),
    )
    .map(ownClient);
  return {
    ownerId: scope.ownerId,
    clients: clients.sort(
      (a, b) => b.createdAt - a.createdAt || a.clientId.localeCompare(b.clientId),
    ),
    limitReached: answer.limitReached,
  };
}

/**
The clients of an organization at the broker, newest first, each with who made it: for an owner,
every repository of the GitHub owner, connected in Samebase or not; for another member, the
connected repositories. The list is a read of the broker and connects nothing.
*/
export const readClientsOfOrganization = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: union(
    vOff,
    object({
      status: literal("on"),
      clients: array(vClient),
      limitReached: boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const moderation = readModeration();
    if (moderation === null) {
      return { status: "off" as const };
    }
    const { clients, limitReached } = await readOrganizationClients(ctx, moderation, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return { status: "on" as const, clients, limitReached };
  },
});

/**
Deletes one client of an organization's repositories at the broker. The client must be in the
organization's list, so a member can delete only the clients of repositories they may see.
The broker deletes it only while its repository is still recorded under the organization's GitHub
owner, so a transfer after the list cannot let this organization delete another owner's client. The
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
    const { ownerId, clients } = await readOrganizationClients(ctx, moderation, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    if (!clients.some((client) => client.clientId === args.clientId)) {
      return { status: "on" as const, changed: false };
    }
    const { changed } = await askBroker(moderation, (broker) =>
      broker.deleteClient({ params: { clientId: args.clientId }, query: { owner: ownerId } }),
    );
    return { status: "on" as const, changed };
  },
});
