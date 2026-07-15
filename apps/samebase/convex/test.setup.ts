/// <reference types="vite/client" />

import agentTest from "@convex-dev/agent/test";
import workflowTest from "@convex-dev/workflow/test";
import workpoolTest from "@convex-dev/workpool/test";
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
  agentTest.register(t);
  workflowTest.register(t);
  workpoolTest.register(t, "repositoryInventoryWorkpool");
  return t;
}
