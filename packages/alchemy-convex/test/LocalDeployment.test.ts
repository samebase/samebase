// Convex.LocalDeployment against the fake deployment API on 127.0.0.1, with the folder's
// `.convex/local/default/config.json` in the shape that `npx convex deployment create
// nicu:tmp-base-fork-no-team:local` wrote on 2026-11-06 (Convex CLI 1.48.0), its secrets replaced.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Test from "@alchemy.run/test/Vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Redacted from "effect/Redacted";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import * as Convex from "../src/index.ts";
import { FakeConvex } from "./fakeConvex.ts";

const NAME = "local-nicu-tmp_base_fork_no_team-1";
const ADMIN_KEY = "REDACTED-admin-key";

const withToken = Test.make({
  providers: Convex.providers(Convex.fromValues({ accessToken: Redacted.make("test-token") })),
});

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "alchemy-convex-local-"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const writeConfig = (config: Record<string, unknown>) => {
  mkdirSync(join(dir, ".convex", "local", "default"), { recursive: true });
  writeFileSync(join(dir, ".convex", "local", "default", "config.json"), JSON.stringify(config));
};

const loggedIn = {
  backendVersion: "precompiled-2026-11-04-0b1c2d3",
  ports: { cloud: 3214, site: 3215 },
  adminKey: ADMIN_KEY,
  instanceSecret: "REDACTED",
  cloudProjectId: 3373558,
  deploymentName: NAME,
};

const site = (env: Record<string, string>) =>
  Effect.gen(function* () {
    const local = yield* Convex.LocalDeployment("Site", { rootDir: dir, env });
    return { name: local.name, siteUrl: local.siteUrl, envNames: local.envNames };
  });

describe("Convex.LocalDeployment", () => {
  withToken.test.provider(
    "writes its variables with the admin key, removes a name that left env, and never pushes",
    (stack) =>
      Effect.gen(function* () {
        writeConfig(loggedIn);
        const fake = new FakeConvex().install();
        fake.localPorts.set(3214, NAME);
        fake.deploymentKeys.set(NAME, ADMIN_KEY);
        fake.variables.set(NAME, { HUB_CLIENT_ID: "no-hub", SET_BY_HAND: "kept" });

        expect(Convex.LocalDeployment.of(dir)).toEqual({
          name: NAME,
          url: "http://127.0.0.1:3214",
          siteUrl: "http://127.0.0.1:3215",
        });
        const first = yield* stack.deploy(
          site({ HUB_CLIENT_ID: "cl_1", HUB_ISSUER: "https://hub" }),
        );
        expect(first).toEqual({
          name: NAME,
          siteUrl: "http://127.0.0.1:3215",
          envNames: ["HUB_CLIENT_ID", "HUB_ISSUER"],
        });
        expect(fake.variables.get(NAME)).toEqual({
          HUB_CLIENT_ID: "cl_1",
          HUB_ISSUER: "https://hub",
          SET_BY_HAND: "kept",
        });

        yield* stack.deploy(site({ HUB_CLIENT_ID: "cl_2" }));
        expect(fake.variables.get(NAME)).toEqual({ HUB_CLIENT_ID: "cl_2", SET_BY_HAND: "kept" });
        // Only the deployment API of the local backend, with its admin key.
        const local = fake.sent.filter(({ path }) => path.startsWith("127.0.0.1:3214"));
        expect(local.length).toBeGreaterThan(0);
        expect(local.every(({ authorization }) => authorization === `Convex ${ADMIN_KEY}`)).toBe(
          true,
        );
        expect(fake.sent.some(({ path }) => path.includes("create_deploy_key"))).toBe(false);

        yield* stack.destroy();
        expect(fake.variables.get(NAME)).toEqual({ HUB_CLIENT_ID: "cl_2", SET_BY_HAND: "kept" });
      }),
  );

  withToken.test.provider(
    "fails in a folder with no local deployment, and in one with an anonymous one",
    (stack) =>
      Effect.gen(function* () {
        new FakeConvex().install();
        expect(() => Convex.LocalDeployment.of(dir)).toThrow("has no logged-in local deployment");
        expect(Exit.isFailure(yield* Effect.exit(stack.deploy(site({ A: "a" }))))).toBe(true);

        const { cloudProjectId: _, ...anonymous } = loggedIn;
        writeConfig({ ...anonymous, deploymentName: "anonymous-agent" });
        expect(() => Convex.LocalDeployment.of(dir)).toThrow("has no logged-in local deployment");
      }),
  );
});
