import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { components } from "./_generated/api";
import {
  makeConvexTest,
  MODERATION_KEY,
  postHubClient,
  signToken,
  stubProviders,
} from "./test.setup";

// The hub's own wiring: `convex/broker.ts` passes the registration config from the env, and
// `convex/http.ts` mounts its routes. The rules themselves are tested in @samebase/identity-broker.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the hub", () => {
  it("answers a production registration with the terms and the app's initial access token", async () => {
    const t = makeConvexTest();
    stubProviders();

    const response = await postHubClient(t, await signToken());

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      terms: "https://samebase.com/terms",
      initial_access_token: expect.any(String),
    });
  });

  it("makes the apps of a repository in OWN_REPOSITORY_IDS first-party", async () => {
    const t = makeConvexTest();
    vi.stubEnv("OWN_REPOSITORY_IDS", "81");
    stubProviders("81");

    const response = await postHubClient(t, await signToken({ repository_id: "81" }));

    expect(response.status).toBe(201);
    expect(await t.query(components.identityBroker.apps.list, {})).toEqual([
      expect.objectContaining({ tenantId: "gh-81", firstParty: true }),
    ]);
  });

  it("answers /moderation/counts only with HUB_MODERATION_KEY", async () => {
    const t = makeConvexTest();

    const without = await t.fetch("/moderation/counts");
    const withKey = await t.fetch("/moderation/counts", {
      headers: { Authorization: `Bearer ${MODERATION_KEY}` },
    });

    expect(without.status).toBe(401);
    expect(withKey.status).toBe(200);
  });
});
