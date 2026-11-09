/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { appIdOf } from "./apps.js";
import { testClientRecord } from "../client/registeredBy.test.helper.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const now = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

async function appWith(t: ReturnType<typeof convexTest>, args: { appId: string; clients: number }) {
  await t.run(async (ctx) => {
    await ctx.db.insert("apps", {
      appId: args.appId,
      name: args.appId,
      tenantId: `${args.appId}-tenant`,
      createdAt: now,
    });
    for (let row = 0; row < args.clients; row++) {
      await ctx.db.insert("clients", {
        clientId: `${args.appId}-client-${row}`,
        appId: args.appId,
        secretHash: "h",
        tokenEndpointAuthMethod: "client_secret_post",
        redirectUris: ["https://app.test/cb"],
        deploymentType: "preview",
        clientName: "c",
        softwareVersion: "v",
        registrationTokenHash: "r",
        createdAt: now,
        renewedAt: now,
        ...testClientRecord,
      });
    }
  });
}

describe("remove", () => {
  test("deletes the app row at once and its clients in batches of 200", async () => {
    // None, under a batch, exactly a batch, more than two batches.
    for (const clients of [0, 199, 200, 450]) {
      vi.useFakeTimers();
      const t = convexTest(schema, modules);
      await appWith(t, { appId: "my-app", clients });
      await appWith(t, { appId: "other", clients: 1 });

      await t.mutation(api.apps.remove, { appId: "my-app" });
      expect(await t.query(api.apps.get, { appId: "my-app" })).toBeNull();
      const clientsLeft = (await t.query(api.clients.listByApp, { appId: "my-app" })).length;
      expect(clientsLeft).toBe(Math.max(clients - 200, 0));

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(api.clients.listByApp, { appId: "my-app" })).toEqual([]);
      expect(await t.query(api.apps.get, { appId: "other" })).not.toBeNull();
      expect(await t.query(api.clients.listByApp, { appId: "other" })).toHaveLength(1);
      vi.useRealTimers();
    }
  });

  test("deletes the app's initial access tokens, and keeps another app's", async () => {
    const t = convexTest(schema, modules);
    const tenantId = "gh-74";
    const appId = await t.run(async (ctx) => {
      const ids = { gone: await appIdOf(tenantId, "gone"), kept: await appIdOf(tenantId, "kept") };
      for (const name of ["gone", "kept"] as const) {
        await ctx.db.insert("apps", { appId: ids[name], name, tenantId, createdAt: now });
        await ctx.db.insert("initialAccessTokens", {
          tokenHash: `hash-of-${name}`,
          githubRepositoryDatabaseId: "74",
          githubOwnerId: "65",
          githubRepository: "octo-org/octo-repo",
          app: name,
          issuedAt: now,
        });
      }
      return ids;
    });

    await t.mutation(api.apps.remove, { appId: appId.gone });

    const tokens = await t.run(async (ctx) => await ctx.db.query("initialAccessTokens").collect());
    expect(tokens.map((token) => token.app)).toEqual(["kept"]);
    expect(await t.query(api.apps.get, { appId: appId.kept })).not.toBeNull();
  });

  test("an unknown app deletes nothing", async () => {
    const t = convexTest(schema, modules);
    await appWith(t, { appId: "other", clients: 1 });
    await t.mutation(api.apps.remove, { appId: "my-app" });
    expect(await t.query(api.apps.list, {})).toHaveLength(1);
    expect(await t.query(api.clients.listByApp, { appId: "other" })).toHaveLength(1);
  });
});
