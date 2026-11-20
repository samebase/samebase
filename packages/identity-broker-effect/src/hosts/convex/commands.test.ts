/// <reference types="vite-plus/client" />
// The component's `run` under convex-test, called from the test app as on a real backend: a
// sign-in gives the memory host's results.
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import { api } from "../../../test/convex-app/convex/_generated/api.js";
import appSchema from "../../../test/convex-app/convex/schema.ts";
import componentSchema from "./component/schema.ts";
import {
  connectionCleanup,
  memoryConnection,
  memorySignIn,
  playConnection,
  playSignIn,
  signInCleanup,
} from "./testing.ts";

const appModules = import.meta.glob("../../../test/convex-app/convex/**/*.ts");
const componentModules = import.meta.glob("./component/**/*.ts");

const backend = () => {
  const t = convexTest(appSchema, appModules);
  t.registerComponent("identityBroker", componentSchema, componentModules);
  return (name: string, args: string, now: number) =>
    t.mutation(api.ops.command, { name, args, now });
};

test("a sign-in through the component's run gives the memory host's results", async () => {
  const fromConvex = await playSignIn(backend());
  expect(fromConvex).toEqual(memorySignIn());
  expect(fromConvex.at(-1)).toEqual(signInCleanup);
});

test("a connection through the component's run gives the memory host's results", async () => {
  const fromConvex = await playConnection(backend());
  expect(fromConvex).toEqual(memoryConnection());
  expect(fromConvex.at(-1)).toEqual(connectionCleanup);
});
