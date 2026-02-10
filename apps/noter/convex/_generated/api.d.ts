/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_graph from "../agent/graph.js";
import type * as agent_systemPrompt from "../agent/systemPrompt.js";
import type * as agent_toolCatalog from "../agent/toolCatalog.js";
import type * as agent_tools from "../agent/tools.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as collaborative from "../collaborative.js";
import type * as common from "../common.js";
import type * as fileStaging from "../fileStaging.js";
import type * as fileStagingActions from "../fileStagingActions.js";
import type * as folderExpansion from "../folderExpansion.js";
import type * as gitOperations from "../gitOperations.js";
import type * as gitOperationsActions from "../gitOperationsActions.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as users from "../users.js";
import type * as vault from "../vault.js";
import type * as vaultActions from "../vaultActions.js";
import type * as waitlist from "../waitlist.js";
import type * as waitlistActions from "../waitlistActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/graph": typeof agent_graph;
  "agent/systemPrompt": typeof agent_systemPrompt;
  "agent/toolCatalog": typeof agent_toolCatalog;
  "agent/tools": typeof agent_tools;
  auth: typeof auth;
  chat: typeof chat;
  chatActions: typeof chatActions;
  collaborative: typeof collaborative;
  common: typeof common;
  fileStaging: typeof fileStaging;
  fileStagingActions: typeof fileStagingActions;
  folderExpansion: typeof folderExpansion;
  gitOperations: typeof gitOperations;
  gitOperationsActions: typeof gitOperationsActions;
  github: typeof github;
  http: typeof http;
  users: typeof users;
  vault: typeof vault;
  vaultActions: typeof vaultActions;
  waitlist: typeof waitlist;
  waitlistActions: typeof waitlistActions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
