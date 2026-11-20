// The one table catalog of a hub: the core's tables (src/rules/tables.ts) and each layer's, with
// each layer's fields and indexes added to the card. The adapters, the hosts and the Convex schema
// read this declaration; the core's rules read only their own part through their `Tx`.
import { Schema } from "effect";
import * as github from "../layers/github/tables.ts";
import * as stack from "../layers/stack/tables.ts";
import { cardFields, cardIndexes, coreTables } from "../rules/tables.ts";
import type { DocOf, IndexOf } from "./Tx.ts";

export const tables = {
  ...coreTables,
  clients: {
    schema: Schema.Struct({ ...cardFields, ...github.cardFields, ...stack.cardFields }),
    indexes: { ...cardIndexes, ...github.cardIndexes },
  },
  ...github.githubTables,
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
] as const satisfies ReadonlyArray<TableName>;

/** Fails to compile when a table is missing from `tableNames`. */
export const everyTableListed: Exclude<TableName, (typeof tableNames)[number]> extends never
  ? true
  : false = true;
