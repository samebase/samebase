// The store app of src/store/convex in convex-test, with the alchemyState
// component of src/store/component mounted as the app's convex.config.ts does.
/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { vi } from "vitest";
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
