/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { appIdOf, moderationIdOf, tenantIdOf } from "./apps.js";
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
        redirectUri: "https://app.test/cb",
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

  test("an unknown app deletes nothing", async () => {
    const t = convexTest(schema, modules);
    await appWith(t, { appId: "other", clients: 1 });
    await t.mutation(api.apps.remove, { appId: "my-app" });
    expect(await t.query(api.apps.list, {})).toHaveLength(1);
    expect(await t.query(api.clients.listByApp, { appId: "other" })).toHaveLength(1);
  });
});

describe("moderationIdOf", () => {
  test("gives both storage groups of a repository's app the production group's id", async () => {
    const production = await appIdOf(tenantIdOf("74"), "my-app", true);
    const preview = await appIdOf(tenantIdOf("74"), "my-app", false);

    expect(preview).toBe(`${production}-preview`);
    expect(moderationIdOf(production)).toBe(production);
    expect(moderationIdOf(preview)).toBe(production);
  });

  test("keeps apart a name that ends in -preview, another name, and another repository", async () => {
    const app = await appIdOf(tenantIdOf("74"), "my-app", true);
    const named = await appIdOf(tenantIdOf("74"), "my-app-preview", true);
    const namedPreview = await appIdOf(tenantIdOf("74"), "my-app-preview", false);
    const otherCase = await appIdOf(tenantIdOf("74"), "My-App", false);
    const otherRepository = await appIdOf(tenantIdOf("75"), "my-app", false);

    expect(moderationIdOf(named)).toBe(named);
    expect(moderationIdOf(namedPreview)).toBe(named);
    expect(
      new Set([app, named, moderationIdOf(otherCase), moderationIdOf(otherRepository)]).size,
    ).toBe(4);
  });

  test("maps no id of another format", () => {
    for (const appId of [
      "my-app-preview",
      "gh-74-app-preview",
      "team-1-4c9a75cca717efb68c856f26ba825073-preview",
      "gh-074-4c9a75cca717efb68c856f26ba825073-preview",
      "gh-74-4C9A75CCA717EFB68C856F26BA825073-preview",
      "gh-74-4c9a75cca717efb68c856f26ba825073-preview-preview",
    ]) {
      expect(moderationIdOf(appId)).toBe(appId);
    }
  });
});
