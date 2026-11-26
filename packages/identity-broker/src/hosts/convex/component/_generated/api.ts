/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authRequests from "../authRequests.js";
import type * as clients from "../clients.js";
import type * as connections from "../connections.js";
import type * as github from "../github.js";
import type * as lifecycle from "../lifecycle.js";
import type * as metadata from "../metadata.js";
import type * as signIns from "../signIns.js";
import type * as stack from "../stack.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  authRequests: typeof authRequests;
  clients: typeof clients;
  connections: typeof connections;
  github: typeof github;
  lifecycle: typeof lifecycle;
  metadata: typeof metadata;
  signIns: typeof signIns;
  stack: typeof stack;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
