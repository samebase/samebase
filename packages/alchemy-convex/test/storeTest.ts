// The store app of src/store/convex in convex-test, with the alchemyState
// component of src/store/component mounted as the app's convex.config.ts does.
/// <reference types="vite-plus/client" />
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import * as Effect from "effect/Effect";
import { vi } from "vitest";
import type { FunctionApi } from "../src/State.ts";
import schema from "../src/store/component/schema.ts";
import { internal } from "../src/store/convex/_generated/api.js";
import { stateKeyName } from "../src/store/convex/sealing.ts";
import { newKey, newKeyId } from "../src/store/sealedSecret.ts";

const app = import.meta.glob("../src/store/convex/**/*.ts");
const component = import.meta.glob("../src/store/component/**/*.ts");

export const storeTest = () => {
  const t = convexTest({ modules: app });
  t.registerComponent("alchemyState", schema, component);
  return t;
};

/** Adds a key variable to the deployment, as a client does. convex-test runs in this process. */
export const addKey = (keyId = newKeyId()) => {
  vi.stubEnv(stateKeyName(keyId), newKey());
  return keyId;
};

/** A store with a key, as a run leaves it. */
export const withKey = async (t: ReturnType<typeof storeTest>) => {
  const keyId = addKey();
  await t.mutation(internal.state.chooseKey, { keyId });
  return keyId;
};

/** The store functions that a client calls as queries and as actions. The others are mutations. */
const QUERIES = [
  "version",
  "stacks",
  "stages",
  "list",
  "get",
  "replaced",
  "getOutput",
  "sealing",
  "openDataKey",
];
const ACTIONS = ["newDataKey"];

/**
 * The function API of a client on the store in convex-test, as `POST /api/function` answers it:
 * a function error is an error reply. `calls` records the arguments of each call.
 */
export const functionApiOf = (t: ReturnType<typeof storeTest>) => {
  const calls: { path: string; args: Record<string, unknown> }[] = [];
  const api: FunctionApi = {
    call: (path, args) =>
      Effect.promise(async () => {
        // JSON leaves an absent argument out.
        const sent = Object.fromEntries(
          Object.entries(args).filter(([, value]) => value !== undefined),
        );
        calls.push({ path, args: sent });
        const name = path.replace(/^state:/, "");
        try {
          const value: unknown = ACTIONS.includes(name)
            ? await t.action(makeFunctionReference<"action">(path), sent)
            : QUERIES.includes(name)
              ? await t.query(makeFunctionReference<"query">(path), sent)
              : await t.mutation(makeFunctionReference<"mutation">(path), sent);
          return { status: "success" as const, value };
        } catch (error) {
          return { status: "error" as const, errorMessage: String(error) };
        }
      }),
  };
  return { api, calls };
};
