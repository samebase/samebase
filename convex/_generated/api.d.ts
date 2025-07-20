/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as fileStaging from "../fileStaging.js";
import type * as fileStagingMutations from "../fileStagingMutations.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as users from "../users.js";
import type * as vault from "../vault.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  fileStaging: typeof fileStaging;
  fileStagingMutations: typeof fileStagingMutations;
  github: typeof github;
  http: typeof http;
  messages: typeof messages;
  users: typeof users;
  vault: typeof vault;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
