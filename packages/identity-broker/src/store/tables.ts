// The one table catalog of a broker: the core's tables (src/rules/tables.ts), each layer's, with
// each layer's fields and indexes added to the card, and the integrations part's
// (src/integrations/tables.ts). The adapters, the hosts and the Convex schema
// read this declaration; the core's rules read only their own part through their `Tx`.
import { Schema } from "effect";
import { connectionTables } from "../integrations/tables.ts";
import * as cimd from "../layers/cimd/tables.ts";
import * as github from "../layers/github/tables.ts";
import * as stack from "../layers/stack/tables.ts";
import { cardIndexes, coreTables, publicCardFields, secretCardFields } from "../rules/tables.ts";
import type { DocOf, IndexOf } from "./Tx.ts";

/** A field that a card of this shape never holds: its layer writes cards of the other shape only. */
const never = Schema.optionalKey(Schema.Never);

export const tables = {
  ...coreTables,
  clients: {
    schema: Schema.Union([
      Schema.Struct({
        ...secretCardFields,
        ...github.cardFields,
        ...stack.cardFields,
        cimd: never,
      }),
      Schema.Struct({ ...publicCardFields, ...cimd.cardFields, github: never, stack: never }),
    ]),
    indexes: { ...cardIndexes, ...github.cardIndexes },
  },
  ...github.githubTables,
  ...connectionTables,
} as const;

export type Tables = typeof tables;
export type TableName = keyof Tables;
export type Doc<T extends TableName> = DocOf<Tables, T>;
export type IndexName<T extends TableName> = IndexOf<Tables, T>;

export const tableNames = [
  "clients",
  "stops",
  "authRequests",
  "authorizationCodes",
  "signIns",
  "signInBudgets",
  "apps",
  "tenants",
  "signInPageExemptions",
  "connectorGrants",
  "events",
  "initialAccessTokens",
  "rateLimits",
  "connectionRequests",
  "connectionCodes",
  "registrations",
  "blocks",
  "blockEvents",
  "everyAppExemptions",
] as const satisfies ReadonlyArray<TableName>;

/** Fails to compile when a table is missing from `tableNames`. */
export const everyTableListed: Exclude<TableName, (typeof tableNames)[number]> extends never
  ? true
  : false = true;
