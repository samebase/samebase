/// <reference types="vite/client" />

import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";

import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.convex.test.ts",
  "!./**/*.generated.ts",
  "!./test.setup.ts",
]);

/**
 * Create an isolated Convex test backend with the same components installed as
 * the app so contract tests exercise registered functions through real refs.
 */
export function makeConvexTest() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  return t;
}
