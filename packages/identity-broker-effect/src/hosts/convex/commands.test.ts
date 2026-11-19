/// <reference types="vite-plus/client" />
// The component's `run` under convex-test, called from the test app as on a real backend: a
// sign-in gives the memory host's results.
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import { api } from "../../../test/convex-app/convex/_generated/api.js";
import appSchema from "../../../test/convex-app/convex/schema.ts";
import componentSchema from "./component/schema.ts";
import { memorySignIn, playSignIn, signInCleanup } from "./testing.ts";

const appModules = import.meta.glob("../../../test/convex-app/convex/**/*.ts");
const componentModules = import.meta.glob("./component/**/*.ts");

test("a sign-in through the component's run gives the memory host's results", async () => {
  const t = convexTest(appSchema, appModules);
  t.registerComponent("identityBroker", componentSchema, componentModules);
  const fromConvex = await playSignIn((name, args, now) =>
    t.mutation(api.ops.command, { name, args, now }),
  );
  expect(fromConvex).toEqual(memorySignIn());
  expect(fromConvex.at(-1)).toEqual(signInCleanup);
});
