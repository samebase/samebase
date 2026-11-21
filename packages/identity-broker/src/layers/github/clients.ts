// The cards that the GitHub layer writes: what a card's `connectors`, `gates`, `confirm`, `budget`
// and `ref` are from the layer's rows, the insert of a new card with its caps and eviction, the
// rewrite of a tenant's cards when its owner changes, the RFC 7592 read that renews a card, and
// the self-delete of a non-production client. Every one runs inside the command that writes.
import { Effect } from "effect";
import { LEASE_MS } from "../../rules/clients.ts";
import type { Step } from "../../rules/commands.ts";
import type { Doc, Tables } from "../../store/tables.ts";
import { allBelow, first, unique, type Row } from "../../store/Tx.ts";
import type { AllowList as AllowListSchema, RemoveArgs, RenewArgs } from "./schemas.ts";
import { GithubTx } from "./tables.ts";

/** The clients of one app in each of its two budgets: production, and previews with development servers. */
export const MAX_CLIENTS_PER_APP = 30;

/** The apps of one tenant: ten names. */
export const MAX_APPS_PER_TENANT = 10;

/** The connector grants of one owner on one repository stay below this: one per configured connector. */
export const MAX_GRANTS_PER_OWNER = 64;

/** Every card of a tenant: each app's two budgets at their cap. */
const MAX_CARDS_PER_TENANT = MAX_APPS_PER_TENANT * 2 * MAX_CLIENTS_PER_APP;

type GithubClient = NonNullable<Doc<"clients">["github"]>;

/** The tenant of a GitHub repository. */
export const tenantIdOf = (githubRepositoryDatabaseId: string) =>
  `gh-${githubRepositoryDatabaseId}`;

/** The GitHub repository id of a tenant `gh-<id>`. */
export const repositoryIdOf = (tenantId: string) => tenantId.slice("gh-".length);

/** A card's `ref` and `budget`: the tenant, so every client of a repository shares one budget. */
export const refOf = (tenantId: string) => `github:${tenantId}`;

/** The start of every gate of the layer's cards: a live gate namespace of it pauses them all. */
export const GATE_PREFIX = "github:";

/** The keys of `stops` that refuse a repository and an owner. */
export const repositoryStop = (githubRepositoryDatabaseId: string) =>
  `${GATE_PREFIX}repository:${githubRepositoryDatabaseId}`;
export const ownerStop = (githubOwnerId: string) => `${GATE_PREFIX}owner:${githubOwnerId}`;

export type AllowList = typeof AllowListSchema.Type;

/** Whether the allow-list gives every configured connector to the repository under `ownerId`. */
export const allowListed = (allowList: AllowList, repositoryId: string, ownerId: string) =>
  allowList === "any" ||
  allowList.some(
    (entry) =>
      entry.ownerId === ownerId &&
      (entry.repositoryId === undefined || entry.repositoryId === repositoryId),
  );

export const tenantRow = Effect.fnUntraced(function* (tenantId: string) {
  return yield* unique(yield* GithubTx, "tenants", "by_tenant_id", [tenantId]);
});

/** Whether a row of `stops` holds the repository's key or the owner's. */
export const isStopped = Effect.fnUntraced(function* (
  githubRepositoryDatabaseId: string,
  githubOwnerId: string,
) {
  const tx = yield* GithubTx;
  for (const key of [repositoryStop(githubRepositoryDatabaseId), ownerStop(githubOwnerId)]) {
    if ((yield* first(tx, "stops", "by_key", [key])) !== undefined) {
      return true;
    }
  }
  return false;
});

/**
 * The connectors that a client of the repository may use, of the hub's `configured` ones: every
 * one while the allow-list names the repository with its current owner, and those that a grant
 * row gives while the tenant's current owner is the owner that registered the client.
 */
export const allowedConnectors = Effect.fnUntraced(function* (args: {
  readonly tenantId: string;
  readonly currentOwnerId: string;
  readonly clientOwnerId: string;
  readonly allowList: AllowList;
  readonly configured: ReadonlyArray<string>;
}) {
  if (allowListed(args.allowList, repositoryIdOf(args.tenantId), args.currentOwnerId)) {
    return [...args.configured];
  }
  if (args.currentOwnerId !== args.clientOwnerId) {
    return [];
  }
  const grants = yield* allBelow(
    yield* GithubTx,
    "connectorGrants",
    "by_tenant_id_and_owner_id_and_connector",
    [args.tenantId, args.clientOwnerId],
    MAX_GRANTS_PER_OWNER + 1,
  );
  return args.configured.filter((name) => grants.some((grant) => grant.doc.connector === name));
});

/**
 * The fields of a card that the layer computes, from the rows of this step: `connectors` is the
 * enrollment of those allowed now (`allowedConnectors`); `connections` is none; the gates are the repository's key and
 * the current owner's; `confirm` is false only while an exemption covers the client (`exemptionOf`).
 */
export const computedFields = Effect.fnUntraced(function* (args: {
  readonly tenantId: string;
  readonly currentOwnerId: string;
  readonly client: GithubClient;
  readonly allowList: AllowList;
  readonly configured: ReadonlyArray<string>;
}) {
  const clientOwnerId = args.client.registeredBy.githubOwnerId;
  const allowed = yield* allowedConnectors({
    tenantId: args.tenantId,
    currentOwnerId: args.currentOwnerId,
    clientOwnerId,
    allowList: args.allowList,
    configured: args.configured,
  });
  const exemption = yield* exemptionOf({
    tenantId: args.tenantId,
    currentOwnerId: args.currentOwnerId,
    clientOwnerId,
  });
  return {
    connectors: args.client.enrollment.filter((name) => allowed.includes(name)),
    // The public hub offers no connection provider.
    connections: [],
    gates: [repositoryStop(repositoryIdOf(args.tenantId)), ownerStop(args.currentOwnerId)],
    confirm: exemption === "shown",
    budget: refOf(args.tenantId),
    ref: refOf(args.tenantId),
  };
});

/**
 * What decides the sign-in page of a client: the "every app" row, or else a row of the repository
 * while the tenant's current owner is the row's owner and registered the client.
 */
export const exemptionOf = Effect.fnUntraced(function* (args: {
  readonly tenantId: string;
  readonly currentOwnerId: string;
  readonly clientOwnerId: string;
}) {
  const tx = yield* GithubTx;
  if ((yield* unique(tx, "everyAppExemptions", "by_reason", [])) !== undefined) {
    return "every_app" as const;
  }
  return args.currentOwnerId === args.clientOwnerId &&
    (yield* unique(tx, "signInPageExemptions", "by_tenant_id_and_owner_id", [
      args.tenantId,
      args.clientOwnerId,
    ])) !== undefined
    ? ("repository" as const)
    : ("shown" as const);
});

/**
 * Rewrites every card of the tenant from the rows of this step, after its owner, a grant or an
 * exemption changed. The caps bound the count, so this is one step.
 */
export const rewriteCards = Effect.fnUntraced(function* (args: {
  readonly tenantId: string;
  readonly currentOwnerId: string;
  readonly allowList: AllowList;
  readonly configured: ReadonlyArray<string>;
}) {
  const tx = yield* GithubTx;
  const cards = yield* allBelow(
    tx,
    "clients",
    "by_ref",
    [refOf(args.tenantId)],
    MAX_CARDS_PER_TENANT + 1,
  );
  for (const card of cards) {
    const client = card.doc.github;
    if (client !== undefined) {
      yield* tx.replace("clients", card.id, {
        ...card.doc,
        ...(yield* computedFields({ ...args, client })),
      });
    }
  }
});

/**
 * The one card of the new client's budget that makes way for it at the cap: null below the cap,
 * and undefined when no card can go. For a preview or development client any card of that budget
 * can go. For a production client a production card goes only if it never signed anyone in. Equal
 * `renewedAt` keeps the first card in index order (a stable sort).
 */
const evicted = (
  rows: ReadonlyArray<Row<Tables, "clients">>,
  deploymentType: GithubClient["deploymentType"],
) => {
  if (rows.length < MAX_CLIENTS_PER_APP) {
    return null;
  }
  const candidates = rows.flatMap((row) =>
    row.doc.github === undefined ||
    (deploymentType === "production" && row.doc.lastSignInAt !== undefined)
      ? []
      : [{ id: row.id, renewedAt: row.doc.github.renewedAt }],
  );
  return candidates.sort((a, b) => a.renewedAt - b.renewedAt).at(0);
};

/** A list as stored: sorted and unique. An empty list is a host bug, never a client. */
const sortedSet = (values: ReadonlyArray<string>, what: string) => {
  const unique = [...new Set(values)].sort();
  return unique.length === 0
    ? Effect.die(new Error(`A client has at least one ${what}`))
    : Effect.succeed(unique);
};

export interface NewCard {
  readonly tenantId: string;
  /**
   * The tenant's owner as of this registration, recorded on the tenant with `proofIssuedAt`. A
   * change of owner rewrites the tenant's other cards in this step.
   */
  readonly ownerId: string;
  readonly proofIssuedAt: number;
  readonly appId: string;
  readonly app: string;
  readonly enrollment: ReadonlyArray<string>;
  readonly deploymentType: GithubClient["deploymentType"];
  readonly clientId: string;
  readonly secretHash: string;
  readonly registrationTokenHash: string;
  readonly tokenEndpointAuthMethod: Doc<"clients">["tokenEndpointAuthMethod"];
  readonly redirectUris: ReadonlyArray<string>;
  readonly clientName: string;
  readonly softwareVersion: string;
  readonly registeredBy: GithubClient["registeredBy"];
  readonly allowList: AllowList;
  readonly configured: ReadonlyArray<string>;
  readonly now: number;
}

/**
 * Registers one deployment as a client of an app, creating the app with its first client, and
 * writes its card. The caller's step checked the stops and the owner order and records the
 * registration, so none can be raced. A client is never replaced: a deployment that lost its
 * client gets a new one.
 */
export const insertCard = Effect.fnUntraced(function* (args: NewCard) {
  const tx = yield* GithubTx;
  const enrollment = yield* sortedSet(args.enrollment, "connector");
  const app = yield* unique(tx, "apps", "by_app_id", [args.appId]);
  if (app !== undefined && app.doc.tenantId !== args.tenantId) {
    return { ok: false as const, error: "app_taken" as const };
  }
  if (app === undefined) {
    const apps = yield* tx.query("apps", "by_tenant_id", {
      eq: [args.tenantId],
      order: "asc",
      limit: MAX_APPS_PER_TENANT,
    });
    if (apps.length >= MAX_APPS_PER_TENANT) {
      return { ok: false as const, error: "too_many_apps" as const };
    }
  }
  // The budget of the new client: `development` and `preview` sort before `production`.
  const rows =
    app === undefined
      ? []
      : yield* tx.query(
          "clients",
          "by_github_app_id_and_deployment_type",
          args.deploymentType === "production"
            ? { eq: [args.appId, "production"], order: "asc", limit: MAX_CLIENTS_PER_APP }
            : {
                eq: [args.appId],
                range: [{ op: "lt", value: "production" }],
                order: "asc",
                limit: MAX_CLIENTS_PER_APP,
              },
        );
  const evictedRow = evicted(rows, args.deploymentType);
  if (evictedRow === undefined) {
    return { ok: false as const, error: "too_many_clients" as const };
  }
  const redirectUris = yield* sortedSet(args.redirectUris, "redirect URI");
  // Every refusal is above this line: a refused registration writes nothing.
  if (app === undefined) {
    yield* tx.insert("apps", { appId: args.appId, tenantId: args.tenantId });
  }
  const tenant = yield* tenantRow(args.tenantId);
  const recorded = { tenantId: args.tenantId, ownerId: args.ownerId };
  if (tenant === undefined) {
    yield* tx.insert("tenants", { ...recorded, ownerProofIssuedAt: args.proofIssuedAt });
  } else {
    yield* tx.replace("tenants", tenant.id, {
      ...recorded,
      // The proof time only moves forward.
      ownerProofIssuedAt: Math.max(tenant.doc.ownerProofIssuedAt, args.proofIssuedAt),
    });
  }
  if (evictedRow !== null) {
    yield* tx.delete("clients", evictedRow.id);
  }
  // A transferred repository gets its new owner here: every card of the tenant follows it.
  if (tenant !== undefined && tenant.doc.ownerId !== args.ownerId) {
    yield* rewriteCards({
      tenantId: args.tenantId,
      currentOwnerId: args.ownerId,
      allowList: args.allowList,
      configured: args.configured,
    });
  }
  const client: GithubClient = {
    appId: args.appId,
    app: args.app,
    deploymentType: args.deploymentType,
    clientName: args.clientName,
    softwareVersion: args.softwareVersion,
    registrationTokenHash: args.registrationTokenHash,
    renewedAt: args.now,
    registeredBy: args.registeredBy,
    enrollment,
  };
  yield* tx.insert("clients", {
    clientId: args.clientId,
    redirectUris,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    secretHash: args.secretHash,
    ...(yield* computedFields({
      tenantId: args.tenantId,
      currentOwnerId: args.ownerId,
      client,
      allowList: args.allowList,
      configured: args.configured,
    })),
    ...(args.deploymentType === "production" ? {} : { removeAt: args.now + LEASE_MS }),
    createdAt: args.now,
    github: client,
  });
  return { ok: true as const };
});

/** The card of `clientId` with its `github` fields, when `registrationTokenHash` is its token's. */
const managedCard = Effect.fnUntraced(function* (clientId: string, registrationTokenHash: string) {
  const card = yield* unique(yield* GithubTx, "clients", "by_client_id", [clientId]);
  const client = card?.doc.github;
  return card !== undefined &&
    client !== undefined &&
    client.registrationTokenHash === registrationTokenHash
    ? { card, client }
    : undefined;
});

/**
 * A deploy of a client reads it (RFC 7592 section 2.1), which also renews it: the card is written
 * again from the rows of this step and the settings, so a change of the allow-list reaches it here.
 * A preview or development client gets a new removal date. A production client has none and never
 * gets one. A stopped repository or owner is refused.
 */
export const renew = Effect.fnUntraced(function* (args: typeof RenewArgs.Type, step: Step) {
  const tx = yield* GithubTx;
  const { now } = step;
  const managed = yield* managedCard(args.clientId, args.registrationTokenHash);
  if (managed === undefined) {
    return { ok: false as const, error: "invalid_token" as const };
  }
  const { card, client } = managed;
  const app = yield* unique(tx, "apps", "by_app_id", [client.appId]);
  const tenant = app === undefined ? undefined : yield* tenantRow(app.doc.tenantId);
  if (tenant === undefined) {
    return { ok: false as const, error: "invalid_token" as const };
  }
  if (yield* isStopped(repositoryIdOf(tenant.doc.tenantId), tenant.doc.ownerId)) {
    return { ok: false as const, error: "suspended" as const };
  }
  const renewed = { ...client, renewedAt: now };
  yield* tx.replace("clients", card.id, {
    ...card.doc,
    ...(yield* computedFields({
      tenantId: tenant.doc.tenantId,
      currentOwnerId: tenant.doc.ownerId,
      client: renewed,
      allowList: args.allowList,
      configured: args.configured,
    })),
    ...(card.doc.removeAt === undefined ? {} : { removeAt: now + LEASE_MS }),
    github: renewed,
  });
  return {
    ok: true as const,
    redirectUris: card.doc.redirectUris,
    clientName: client.clientName,
    softwareVersion: client.softwareVersion,
    tokenEndpointAuthMethod: card.doc.tokenEndpointAuthMethod,
    app: client.app,
    tenantId: tenant.doc.tenantId,
    createdAt: card.doc.createdAt,
    connectors: client.enrollment,
  };
});

/**
 * A preview or development client deletes itself (RFC 7592 section 2.3). A production client
 * cannot: a stack destroy can leave a production deployment running.
 */
export const remove = Effect.fnUntraced(function* (args: typeof RemoveArgs.Type) {
  const managed = yield* managedCard(args.clientId, args.registrationTokenHash);
  if (managed === undefined) {
    return { ok: false as const, error: "invalid_token" as const };
  }
  if (managed.client.deploymentType === "production") {
    return { ok: false as const, error: "production" as const };
  }
  yield* (yield* GithubTx).delete("clients", managed.card.id);
  return { ok: true as const };
});
