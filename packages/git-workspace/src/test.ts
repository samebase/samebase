import type { GenericDataModel } from "convex/server";
import type { TestConvexForDataModelAndIdentity } from "convex-test";
import schema from "./component/schema.js";

const modules = import.meta.glob([
  "./component/**/*.ts",
  "!./component/**/*.test.ts",
  "!./component/**/*.convex.test.ts",
]);

export function register(
  t: Pick<TestConvexForDataModelAndIdentity<GenericDataModel>, "registerComponent">,
  name = "gitWorkspace",
) {
  t.registerComponent(name, schema, modules);
}
