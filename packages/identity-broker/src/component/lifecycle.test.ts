/// <reference types="vite-plus/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api.js";
import { BATCH } from "./lifecycle.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const MAX_AGE = 30 * DAY;

type Fields = {
  deploymentType: "production" | "preview";
  createdAt: number;
  lastSignInAt?: number;
};

async function seed(t: ReturnType<typeof convexTest>, clients: (Fields & { clientId: string })[]) {
  await t.run(async (ctx) => {
    for (const client of clients) {
      await ctx.db.insert("clients", {
        appId: "app",
        secretHash: "hash",
        tokenEndpointAuthMethod: "client_secret_post",
        redirectUri: "https://app.test/callback",
        clientName: "test",
        softwareVersion: "test",
        ...client,
      });
    }
  });
}

const remaining = async (t: ReturnType<typeof convexTest>) =>
  await t.run(async (ctx) =>
    (await ctx.db.query("clients").collect()).map((client) => client.clientId).sort(),
  );

const cleanup = async (t: ReturnType<typeof convexTest>) =>
  await t.mutation(api.lifecycle.cleanup, {
    now: NOW,
    previewClientMaxAgeMs: MAX_AGE,
    signInRetentionMs: 90 * DAY,
  });

describe("preview client cleanup", () => {
  // A full batch schedules the next one. It stays queued, so it cannot run after the test ends.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("idle counts from the last sign-in, or from creation for a client never used", async () => {
    const t = convexTest(schema, modules);
    const old = NOW - MAX_AGE - DAY;
    const recent = NOW - DAY;
    await seed(t, [
      { clientId: "never-used-old", deploymentType: "preview", createdAt: old },
      { clientId: "never-used-recent", deploymentType: "preview", createdAt: recent },
      { clientId: "used-long-ago", deploymentType: "preview", createdAt: old, lastSignInAt: old },
      {
        clientId: "used-recently",
        deploymentType: "preview",
        createdAt: old,
        lastSignInAt: recent,
      },
      { clientId: "production", deploymentType: "production", createdAt: old },
    ]);

    expect(await cleanup(t)).toMatchObject({ previewClients: 2 });

    expect(await remaining(t)).toEqual(["never-used-recent", "production", "used-recently"]);
  });

  test("recent clients in front of the idle ones do not hide them", async () => {
    const t = convexTest(schema, modules);
    const old = NOW - MAX_AGE - DAY;
    await seed(t, [
      // More than a batch of live clients: a read that filtered after its limit would stop here.
      ...Array.from({ length: BATCH + 5 }, (_, index) => ({
        clientId: `live-${index}`,
        deploymentType: "preview" as const,
        createdAt: NOW - DAY,
      })),
      { clientId: "idle", deploymentType: "preview", createdAt: old, lastSignInAt: old },
    ]);

    expect(await cleanup(t)).toMatchObject({ previewClients: 1 });

    expect(await remaining(t)).not.toContain("idle");
  });

  test("a full batch takes the rest from the next one", async () => {
    const t = convexTest(schema, modules);
    const old = NOW - MAX_AGE - DAY;
    await seed(t, [
      ...Array.from({ length: BATCH - 1 }, (_, index) => ({
        clientId: `never-${index}`,
        deploymentType: "preview" as const,
        createdAt: old,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        clientId: `used-${index}`,
        deploymentType: "preview" as const,
        createdAt: old,
        lastSignInAt: old,
      })),
    ]);

    expect(await cleanup(t)).toMatchObject({ previewClients: BATCH });

    expect(await remaining(t)).toHaveLength(1);
  });
});
