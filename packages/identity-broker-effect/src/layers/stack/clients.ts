// The cards that the stack layer writes, each in the command that writes it: a new client of a
// key, the RFC 7592 read that renews it, and the self-delete of a temporary client. The key's name
// is the one fact a card is computed from: its `ref`, `budget` and `gates`.
import { Effect, Schema } from "effect";
import { removeClientGrants } from "../../connections/rules.ts";
import { LEASE_MS } from "../../rules/clients.ts";
import type { Step } from "../../rules/commands.ts";
import { TokenEndpointAuthMethod } from "../../rules/tables.ts";
import { first, unique } from "../../store/Tx.ts";
import { StackClient, StackTx } from "./tables.ts";

const Str = Schema.String;
const Strs = Schema.Array(Str);

/** The key's own budget, and its gate: a row of `stops` with it refuses every client of the key. */
export const keyRef = (key: string) => `stack:${key}`;

export const CreateArgs = Schema.Struct({
  clientId: Str,
  secretHash: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  redirectUris: Strs,
  /** No removal date: the request asked for production, and the key may make permanent clients. */
  permanent: Schema.Boolean,
  client: StackClient,
  /** The hub's configured connector names. */
  configured: Strs,
  /** The connection providers of the client's key, as the hub's settings name them. */
  connections: Strs,
});
export const CreateResult = Schema.Struct({ createdAt: Schema.Finite });

const ManageArgs = { clientId: Str, registrationTokenHash: Str };
export const RenewArgs = Schema.Struct({
  ...ManageArgs,
  /** The keys that the hub has now, by name, each with its connection providers. */
  keys: Schema.Array(Schema.Struct({ name: Str, connections: Strs })),
  configured: Strs,
});
export const RenewResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    redirectUris: Strs,
    tokenEndpointAuthMethod: TokenEndpointAuthMethod,
    createdAt: Schema.Finite,
    client: StackClient,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "suspended", "withdrawn"]),
  }),
]);
export const RemoveArgs = Schema.Struct(ManageArgs);
export const RemoveResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_token", "permanent"]),
  }),
]);

/** The card of a new client. The handler checked the key, its rule, and the enrollment. */
export const create = Effect.fnUntraced(function* (args: typeof CreateArgs.Type, step: Step) {
  yield* (yield* StackTx).insert("clients", {
    clientId: args.clientId,
    redirectUris: args.redirectUris,
    tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
    secretHash: args.secretHash,
    connectors: args.client.enrollment.filter((name) => args.configured.includes(name)),
    connections: args.connections,
    gates: [keyRef(args.client.key)],
    confirm: false,
    budget: keyRef(args.client.key),
    ref: `${keyRef(args.client.key)}:${args.client.name}`,
    ...(args.permanent ? {} : { removeAt: step.now + LEASE_MS }),
    createdAt: step.now,
    stack: args.client,
  });
  return { createdAt: step.now };
});

/** The card of `clientId`, when `registrationTokenHash` is its own token's. */
const managedCard = Effect.fnUntraced(function* (clientId: string, registrationTokenHash: string) {
  const card = yield* unique(yield* StackTx, "clients", "by_client_id", [clientId]);
  const client = card?.doc.stack;
  return card !== undefined &&
    client !== undefined &&
    client.registrationTokenHash === registrationTokenHash
    ? { card, client }
    : undefined;
});

/**
 * A deploy of a client reads it (RFC 7592 section 2.1), which also renews it: a temporary card gets
 * a new removal date, its connectors are its enrollment of those configured now, and its
 * connections are its key's now. A key that the hub no longer has renews nothing, and a stopped
 * card is not renewed.
 */
export const renew = Effect.fnUntraced(function* (args: typeof RenewArgs.Type, step: Step) {
  const tx = yield* StackTx;
  const managed = yield* managedCard(args.clientId, args.registrationTokenHash);
  if (managed === undefined) {
    return { ok: false as const, error: "invalid_token" as const };
  }
  const { card, client } = managed;
  const key = args.keys.find((candidate) => candidate.name === client.key);
  if (key === undefined) {
    return { ok: false as const, error: "withdrawn" as const };
  }
  for (const gate of card.doc.gates) {
    if ((yield* first(tx, "stops", "by_key", [gate])) !== undefined) {
      return { ok: false as const, error: "suspended" as const };
    }
  }
  yield* tx.replace("clients", card.id, {
    ...card.doc,
    connectors: client.enrollment.filter((name) => args.configured.includes(name)),
    connections: key.connections,
    ...(card.doc.removeAt === undefined ? {} : { removeAt: step.now + LEASE_MS }),
  });
  return {
    ok: true as const,
    redirectUris: card.doc.redirectUris,
    tokenEndpointAuthMethod: card.doc.tokenEndpointAuthMethod,
    createdAt: card.doc.createdAt,
    client,
  };
});

/**
 * A temporary client deletes itself (RFC 7592 section 2.3). A permanent one cannot: a stack
 * destroy can leave a production deployment running. The card's connection grants go in the same
 * step, so no provider refresh token outlives its client.
 */
export const remove = Effect.fnUntraced(function* (args: typeof RemoveArgs.Type) {
  const managed = yield* managedCard(args.clientId, args.registrationTokenHash);
  if (managed === undefined) {
    return { ok: false as const, error: "invalid_token" as const };
  }
  if (managed.card.doc.removeAt === undefined) {
    return { ok: false as const, error: "permanent" as const };
  }
  yield* (yield* StackTx).delete("clients", managed.card.id);
  yield* removeClientGrants(args.clientId);
  return { ok: true as const };
});
