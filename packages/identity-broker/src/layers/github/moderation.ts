// The storage steps of the moderation API (src/moderation/): each request is one command. A block
// writes its row of `stops` with its own row, so it refuses the cards from its commit on. A change
// of a grant or an exemption rewrites the cards it covers in the same step.
import { Effect } from "effect";
import type { BlockChange, ClientList } from "../../moderation/api.ts";
import type { Step } from "../../rules/commands.ts";
import type { Doc, Tables } from "../../store/tables.ts";
import { allBelow, first, unique, type Row } from "../../store/Tx.ts";
import {
  allowedConnectors,
  allowListed,
  computedFields,
  exemptionOf,
  ownerStop,
  repositoryIdOf,
  repositoryStop,
  rewriteCards,
  tenantIdOf,
  tenantRow,
  type AllowList,
} from "./clients.ts";
import type {
  ChangeConnectorGrantArgs,
  ChangeSignInPageArgs,
  ClientsArgs,
  ConnectorGrantsArgs,
  DeleteClientArgs,
} from "./schemas.ts";
import { GithubTx } from "./tables.ts";

const DAY_MS = 24 * 60 * 60 * 1_000;
/** The most rows that one count reads. A count that reaches it is "at least". */
const COUNT_READ_LIMIT = 1_000;
const BLOCK_LIST_LIMIT = 200;
const BLOCK_EVENT_LIST_LIMIT = 100;
/** The newest clients that a list answers. */
const CLIENT_LIST_LIMIT = 500;
/**
 * The cards that one step reads across the broker: a list of clients, or the rewrite of every card
 * when the "every app" exemption changes. A list that reaches it says so; a rewrite fails.
 */
const MAX_BROKER_CARDS = 5_000;
/** The exemptions or grants that a list reads; more fail the request. */
const MAX_LISTED_ROWS = 5_000;

const unchanged = { ok: true as const, changed: false };
const changed = { ok: true as const, changed: true };
const ownerChanged = { ok: false as const, error: "owner_changed" as const };

/** Code-unit order, the same on every host. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Every card of the layer, in app order. */
const everyCard = Effect.fnUntraced(function* () {
  return yield* (yield* GithubTx).query("clients", "by_github_app_id_and_deployment_type", {
    eq: [],
    range: [{ op: "gt", value: undefined }],
    order: "asc",
    limit: MAX_BROKER_CARDS,
  });
});

/** The tenant of a card's app. Every card has its app row: nothing deletes one. */
const tenantOfApp = Effect.fnUntraced(function* (appId: string) {
  const app = yield* unique(yield* GithubTx, "apps", "by_app_id", [appId]);
  if (app === undefined) {
    return yield* Effect.die(new Error(`The app ${appId} of a card has no row`));
  }
  return { tenantId: app.doc.tenantId, tenant: yield* tenantRow(app.doc.tenantId) };
});

/** The registrations of the last day and of the last week. */
export const counts = Effect.fnUntraced(function* (_args: object, step: Step) {
  return {
    day: yield* registrationsSince(step.now - DAY_MS),
    week: yield* registrationsSince(step.now - 7 * DAY_MS),
  };
});

const registrationsSince = Effect.fnUntraced(function* (from: number) {
  const rows = yield* (yield* GithubTx).query("registrations", "by_at", {
    eq: [],
    range: [{ op: "gt", value: from }],
    order: "asc",
    limit: COUNT_READ_LIMIT,
  });
  return { count: rows.length, atLeast: rows.length === COUNT_READ_LIMIT };
});

/** The newest blocks and block events, newest first. */
export const blocks = Effect.fnUntraced(function* () {
  const tx = yield* GithubTx;
  const newest = { eq: [], order: "desc" as const };
  const rows = yield* tx.query("blocks", "by_at", { ...newest, limit: BLOCK_LIST_LIMIT });
  const events = yield* tx.query("blockEvents", "by_at", {
    ...newest,
    limit: BLOCK_EVENT_LIST_LIMIT,
  });
  const view = (doc: Doc<"blocks">) => ({
    kind: doc.kind,
    githubId: doc.githubId,
    reason: doc.reason,
    adminEmail: doc.adminEmail,
    createdAt: doc.at,
  });
  return {
    blocks: rows.map((row) => view(row.doc)),
    events: events.map((row) => ({ action: row.doc.action, ...view(row.doc) })),
  };
});

/**
 * Blocks or unblocks a repository or an owner, with its row of `stops`, and appends the event. A
 * change already in place changes nothing and appends nothing.
 */
export const changeBlock = Effect.fnUntraced(function* (args: typeof BlockChange.Type, step: Step) {
  const tx = yield* GithubTx;
  const key = args.kind === "repository" ? repositoryStop(args.githubId) : ownerStop(args.githubId);
  const block = yield* unique(tx, "blocks", "by_kind_and_github_id", [args.kind, args.githubId]);
  const stop = yield* first(tx, "stops", "by_key", [key]);
  const record = {
    kind: args.kind,
    githubId: args.githubId,
    reason: args.reason,
    adminEmail: args.adminEmail,
    at: step.now,
  };

  if (args.action === "block") {
    if (block !== undefined) {
      return { changed: false };
    }
    yield* tx.insert("blocks", record);
    if (stop === undefined) {
      yield* tx.insert("stops", { key, at: step.now });
    }
  } else {
    if (block === undefined) {
      return { changed: false };
    }
    yield* tx.delete("blocks", block.id);
    if (stop !== undefined) {
      yield* tx.delete("stops", stop.id);
    }
  }
  yield* tx.insert("blockEvents", { action: args.action, ...record });
  return { changed: true };
});

/** Whether a row bound to `ownerId` counts: the broker records no other owner of the repository. */
const activeFor = Effect.fnUntraced(function* (tenantId: string, ownerId: string) {
  const tenant = yield* tenantRow(tenantId);
  return tenant === undefined || tenant.doc.ownerId === ownerId;
});

/** The "every app" exemption, and every exemption of a repository, by repository and owner. */
export const signInPage = Effect.fnUntraced(function* () {
  const tx = yield* GithubTx;
  const everyApp = yield* unique(tx, "everyAppExemptions", "by_reason", []);
  const rows = yield* allBelow(
    tx,
    "signInPageExemptions",
    "by_tenant_id_and_owner_id",
    [],
    MAX_LISTED_ROWS,
  );
  const repositories = [];
  for (const { doc } of rows) {
    repositories.push({
      repositoryId: repositoryIdOf(doc.tenantId),
      ownerId: doc.ownerId,
      active: yield* activeFor(doc.tenantId, doc.ownerId),
      reason: doc.reason,
    });
  }
  return {
    everyApp: everyApp === undefined ? null : { reason: everyApp.doc.reason },
    repositories: repositories.sort(
      (a, b) => compare(a.repositoryId, b.repositoryId) || compare(a.ownerId, b.ownerId),
    ),
  };
});

/** Rewrites the cards of the repository, when the broker has a tenant for it. */
const rewriteTenant = Effect.fnUntraced(function* (
  tenantId: string,
  settings: { readonly allowList: AllowList; readonly configured: ReadonlyArray<string> },
) {
  const tenant = yield* tenantRow(tenantId);
  if (tenant !== undefined) {
    yield* rewriteCards({
      tenantId,
      currentOwnerId: tenant.doc.ownerId,
      allowList: settings.allowList,
      configured: settings.configured,
    });
  }
});

/** Rewrites every card of the layer. A broker with `MAX_BROKER_CARDS` cards or more fails the step. */
const rewriteEveryCard = Effect.fnUntraced(function* (settings: {
  readonly allowList: AllowList;
  readonly configured: ReadonlyArray<string>;
}) {
  const tx = yield* GithubTx;
  const cards = yield* everyCard();
  if (cards.length >= MAX_BROKER_CARDS) {
    return yield* Effect.die(new Error(`The broker holds ${MAX_BROKER_CARDS} cards or more`));
  }
  for (const card of cards) {
    const client = card.doc.github;
    if (client !== undefined) {
      const { tenantId, tenant } = yield* tenantOfApp(client.appId);
      if (tenant !== undefined) {
        yield* tx.replace("clients", card.id, {
          ...card.doc,
          ...(yield* computedFields({
            tenantId,
            currentOwnerId: tenant.doc.ownerId,
            client,
            allowList: settings.allowList,
            configured: settings.configured,
          })),
        });
      }
    }
  }
});

/**
 * Sets (`skip`) or removes one exemption from the sign-in page, and rewrites the cards it covers.
 * A change already in place changes nothing. A repository's row needs no tenant: it can come before
 * the repository's first registration. Setting one refuses while the broker records another owner;
 * removing one removes the row of `expectedOwnerId` only.
 */
export const changeSignInPage = Effect.fnUntraced(function* (
  args: typeof ChangeSignInPageArgs.Type,
) {
  const tx = yield* GithubTx;
  if (args.target.scope === "every_app") {
    const row = yield* unique(tx, "everyAppExemptions", "by_reason", []);
    if (args.skip === (row !== undefined)) {
      return unchanged;
    }
    if (row === undefined) {
      yield* tx.insert("everyAppExemptions", { reason: args.reason });
    } else {
      yield* tx.delete("everyAppExemptions", row.id);
    }
    yield* rewriteEveryCard(args);
    return changed;
  }

  const tenantId = tenantIdOf(args.target.repositoryId);
  const ownerId = args.target.expectedOwnerId;
  const row = yield* unique(tx, "signInPageExemptions", "by_tenant_id_and_owner_id", [
    tenantId,
    ownerId,
  ]);
  if (args.skip && !(yield* activeFor(tenantId, ownerId))) {
    return ownerChanged;
  }
  if (args.skip === (row !== undefined)) {
    return unchanged;
  }
  if (row === undefined) {
    yield* tx.insert("signInPageExemptions", { tenantId, ownerId, reason: args.reason });
  } else {
    yield* tx.delete("signInPageExemptions", row.id);
  }
  yield* rewriteTenant(tenantId, args);
  return changed;
});

/** The broker's connectors, which a grant may name, and every grant. */
export const connectorGrants = Effect.fnUntraced(function* (args: typeof ConnectorGrantsArgs.Type) {
  const rows = yield* allBelow(
    yield* GithubTx,
    "connectorGrants",
    "by_tenant_id_and_owner_id_and_connector",
    [],
    MAX_LISTED_ROWS,
  );
  const grants = [];
  for (const { doc } of rows) {
    grants.push({
      repositoryId: repositoryIdOf(doc.tenantId),
      ownerId: doc.ownerId,
      connector: doc.connector,
      active: yield* activeFor(doc.tenantId, doc.ownerId),
      reason: doc.reason,
    });
  }
  return {
    connectors: args.configured,
    grants: grants.sort(
      (a, b) =>
        compare(a.repositoryId, b.repositoryId) ||
        compare(a.ownerId, b.ownerId) ||
        compare(a.connector, b.connector),
    ),
  };
});

/**
 * Grants or revokes one connector of one repository for `expectedOwnerId`, and rewrites the
 * repository's cards. A change already in place changes nothing. A grant needs no tenant, and
 * refuses while the broker records another owner; a revoke removes that owner's row only. The handler
 * checks that a granted connector is one of the broker's.
 */
export const changeConnectorGrant = Effect.fnUntraced(function* (
  args: typeof ChangeConnectorGrantArgs.Type,
) {
  const tx = yield* GithubTx;
  const tenantId = tenantIdOf(args.repositoryId);
  const ownerId = args.expectedOwnerId;
  const row = yield* unique(tx, "connectorGrants", "by_tenant_id_and_owner_id_and_connector", [
    tenantId,
    ownerId,
    args.connector,
  ]);
  if (args.grant && !(yield* activeFor(tenantId, ownerId))) {
    return ownerChanged;
  }
  if (args.grant === (row !== undefined)) {
    return unchanged;
  }
  if (row === undefined) {
    yield* tx.insert("connectorGrants", {
      tenantId,
      ownerId,
      connector: args.connector,
      reason: args.reason,
    });
  } else {
    yield* tx.delete("connectorGrants", row.id);
  }
  yield* rewriteTenant(tenantId, args);
  return changed;
});

type ClientEntry = (typeof ClientList.Type)["clients"][number];

/**
 * A listed client, with what decides its sign-in page and its connectors now, by the rules that
 * write its card: the allow-list's connectors, the usable ones of its enrollment, and those of them
 * that only a grant allows.
 */
const clientEntry = Effect.fnUntraced(function* (
  card: Row<Tables, "clients">,
  client: NonNullable<Doc<"clients">["github"]>,
  tenantId: string,
  tenant: Row<Tables, "tenants"> | undefined,
  settings: { readonly allowList: AllowList; readonly configured: ReadonlyArray<string> },
) {
  const { registeredBy } = client;
  const repository = {
    githubRepository: registeredBy.githubRepository,
    githubRepositoryDatabaseId: repositoryIdOf(tenantId),
    githubOwnerId: registeredBy.githubOwnerId,
    app: client.app,
  };
  const listed: Omit<
    ClientEntry,
    "signInPage" | "policyConnectors" | "usableConnectors" | "grantedConnectors"
  > = {
    clientId: card.doc.clientId,
    appId: client.appId,
    clientName: client.clientName,
    deploymentType: client.deploymentType,
    redirectUris: card.doc.redirectUris,
    createdAt: card.doc.createdAt,
    renewedAt: client.renewedAt,
    lastSignInAt: card.doc.lastSignInAt ?? null,
    removeAt: card.doc.removeAt ?? null,
    registeredBy:
      registeredBy.kind === "github"
        ? { kind: "github", ...repository, githubActorLogin: registeredBy.githubActorLogin }
        : { kind: "initial_access_token", ...repository, issuedAt: registeredBy.issuedAt },
    connectors: client.enrollment,
    ownerId: tenant?.doc.ownerId ?? null,
  };
  if (tenant === undefined) {
    return {
      ...listed,
      signInPage: null,
      policyConnectors: null,
      usableConnectors: null,
      grantedConnectors: null,
    };
  }
  const owners = {
    tenantId,
    currentOwnerId: tenant.doc.ownerId,
    clientOwnerId: registeredBy.githubOwnerId,
  };
  const policyConnectors = allowListed(
    settings.allowList,
    repositoryIdOf(tenantId),
    tenant.doc.ownerId,
  )
    ? [...settings.configured]
    : [];
  const allowed = yield* allowedConnectors({ ...owners, ...settings });
  const usableConnectors = client.enrollment.filter((name) => allowed.includes(name));
  return {
    ...listed,
    signInPage: yield* exemptionOf(owners),
    policyConnectors,
    usableConnectors,
    grantedConnectors: usableConnectors.filter((name) => !policyConnectors.includes(name)),
  };
});

/**
 * The newest clients, or with `owner` those of the repositories whose recorded owner it is, such as
 * those of one organization. It reads at most `MAX_BROKER_CARDS` cards and says so when it reaches
 * them, or when more than `CLIENT_LIST_LIMIT` clients match.
 */
export const clients = Effect.fnUntraced(function* (args: typeof ClientsArgs.Type) {
  const cards = yield* everyCard();
  const byApp = new Map<string, Effect.Success<ReturnType<typeof tenantOfApp>>>();
  const matching = [];
  for (const card of cards) {
    const client = card.doc.github;
    if (client === undefined) {
      continue;
    }
    const found = byApp.get(client.appId) ?? (yield* tenantOfApp(client.appId));
    byApp.set(client.appId, found);
    if (args.owner === undefined || found.tenant?.doc.ownerId === args.owner) {
      matching.push({ card, client, ...found });
    }
  }
  const kept = matching
    .sort(
      (a, b) =>
        b.card.doc.createdAt - a.card.doc.createdAt ||
        compare(a.card.doc.clientId, b.card.doc.clientId),
    )
    .slice(0, CLIENT_LIST_LIMIT);
  const entries = [];
  for (const { card, client, tenantId, tenant } of kept) {
    entries.push(yield* clientEntry(card, client, tenantId, tenant, args));
  }
  return {
    ...(args.owner === undefined ? {} : { owner: args.owner }),
    clients: entries,
    limitReached: cards.length === MAX_BROKER_CARDS || matching.length > CLIENT_LIST_LIMIT,
  };
});

/**
 * Deletes one client. The deployment that held it gets a new client at its next deploy. With
 * `owner`, only while the client's repository is recorded under that owner.
 */
export const deleteClient = Effect.fnUntraced(function* (args: typeof DeleteClientArgs.Type) {
  const tx = yield* GithubTx;
  const card = yield* unique(tx, "clients", "by_client_id", [args.clientId]);
  const client = card?.doc.github;
  if (card === undefined || client === undefined) {
    return { changed: false };
  }
  if (args.owner !== undefined) {
    const { tenant } = yield* tenantOfApp(client.appId);
    if (tenant?.doc.ownerId !== args.owner) {
      return { changed: false };
    }
  }
  yield* tx.delete("clients", card.id);
  return { changed: true };
});
