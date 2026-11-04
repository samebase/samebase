/// <reference types="vite-plus/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";

const modules = import.meta.glob(["./component/**/*.ts", "!./component/**/*.test.ts"]);

/**
 * Registers the component in a host's convex-test backend, under the name of the host's
 * `app.use(identityBroker)`, with the rate limiter that it uses.
 */
export function register<Schema extends SchemaDefinition<GenericSchema, boolean>>(
  t: TestConvex<Schema>,
  name = "identityBroker",
) {
  t.registerComponent(name, schema, modules);
  rateLimiterTest.register(t, `${name}/rateLimiter`);
}
