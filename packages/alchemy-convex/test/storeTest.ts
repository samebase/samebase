// The store app of src/store/convex in convex-test, with the alchemyState
// component of src/store/component mounted as the app's convex.config.ts does.
/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { vi } from "vitest";
import schema from "../src/store/component/schema.ts";
import { newKeyRing } from "../src/store/sealedSecret.ts";

const app = import.meta.glob("../src/store/convex/**/*.ts");
const component = import.meta.glob("../src/store/component/**/*.ts");

export const storeTest = () => {
  // The store deployment holds its key ring in this variable; convex-test runs in this process.
  vi.stubEnv("STATE_KEYS", newKeyRing());
  const t = convexTest({ modules: app });
  t.registerComponent("alchemyState", schema, component);
  return t;
};
