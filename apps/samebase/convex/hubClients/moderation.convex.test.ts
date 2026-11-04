import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const HUB_ISSUER = "https://hub.example.test";
const MODERATION_KEY = "moderation-key";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const registration = {
  clientId: "cl_test",
  githubRepositoryDatabaseId: "74",
  githubOwnerId: "65",
  githubRepository: "octo-org/octo-repo",
  githubActorId: "12",
  githubActorLogin: "octocat",
  commitSha: "example-sha",
  stage: "prod",
  app: "my-app",
  redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
  registeredAt: 1_800_000_000_000,
};

const counts = { day: { count: 1, atLeast: false }, week: { count: 1_000, atLeast: true } };

const blockList = {
  blocks: [
    {
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
  events: [
    {
      action: "block",
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
};

/** The hub's moderation endpoints, as apps/identity-hub/convex/moderation.ts answers them. */
function stubHub(answer?: () => Response) {
  const requests: { url: string; method: string; authorization: string | null; body: unknown }[] =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const text = await request.text();
      requests.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get("Authorization"),
        body: text === "" ? undefined : JSON.parse(text),
      });
      if (answer !== undefined) {
        return answer();
      }
      const { pathname } = new URL(request.url);
      switch (pathname) {
        case "/moderation/registrations":
          return jsonResponse({ page: [registration], isDone: true, continueCursor: "next" });
        case "/moderation/counts":
          return jsonResponse(counts);
        case "/moderation/blocks":
          return jsonResponse(request.method === "GET" ? blockList : { changed: true });
        default:
          return new Response("Not Found", { status: 404 });
      }
    }),
  );
  return requests;
}

async function viewerWith(t: ConvexTest, email: string) {
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        state: "active",
        email,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      }),
  );
  return t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
}

function turnModerationOn() {
  vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
  vi.stubEnv("HUB_MODERATION_KEY", MODERATION_KEY);
}

describe("hub client moderation", () => {
  it.each(["anonymous", "member"] as const)(
    "refuses %s for every function, and calls no hub",
    async (role) => {
      const t = makeConvexTest();
      turnModerationOn();
      const requests = stubHub();
      const viewer = role === "anonymous" ? t : await viewerWith(t, "member@example.test");

      await expect(viewer.action(api.hubClients.moderation.readOverview, {})).rejects.toThrow(
        "Access denied",
      );
      await expect(
        viewer.action(api.hubClients.moderation.listRegistrations, { cursor: null }),
      ).rejects.toThrow("Access denied");
      await expect(
        viewer.action(api.hubClients.moderation.changeBlock, {
          action: "block",
          kind: "owner",
          githubId: "65",
          reason: "Phishing page",
        }),
      ).rejects.toThrow("Access denied");
      expect(requests).toEqual([]);
    },
  );

  it("says that moderation is off without the key, and calls no hub", async () => {
    const t = makeConvexTest();
    vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
    vi.stubEnv("HUB_MODERATION_KEY", " ");
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    expect(await admin.action(api.hubClients.moderation.readOverview, {})).toEqual({
      status: "off",
    });
    expect(
      await admin.action(api.hubClients.moderation.listRegistrations, { cursor: null }),
    ).toEqual({ status: "off" });
    expect(
      await admin.action(api.hubClients.moderation.changeBlock, {
        action: "block",
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
      }),
    ).toEqual({ status: "off" });
    expect(requests).toEqual([]);
  });

  it("reads the counts and the blocks at the hub with the key", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const overview = await admin.action(api.hubClients.moderation.readOverview, {});

    expect(overview).toEqual({ status: "on", counts, blockList });
    expect(requests).toEqual([
      {
        url: `${HUB_ISSUER}/moderation/counts`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${HUB_ISSUER}/moderation/blocks`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
    ]);
  });

  it("lists the registrations a page at a time", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const first = await admin.action(api.hubClients.moderation.listRegistrations, {
      cursor: null,
    });
    await admin.action(api.hubClients.moderation.listRegistrations, { cursor: "a b" });

    expect(first).toEqual({
      status: "on",
      registrations: { page: [registration], isDone: true, continueCursor: "next" },
    });
    expect(requests.map((request) => request.url)).toEqual([
      `${HUB_ISSUER}/moderation/registrations`,
      `${HUB_ISSUER}/moderation/registrations?cursor=a%20b`,
    ]);
  });

  it("sets a block in the name of the signed-in admin", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const result = await admin.action(api.hubClients.moderation.changeBlock, {
      action: "unblock",
      kind: "repository",
      githubId: "74",
      reason: "Fixed",
    });

    expect(result).toEqual({ status: "on", changed: true });
    expect(requests).toEqual([
      {
        url: `${HUB_ISSUER}/moderation/blocks`,
        method: "POST",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: {
          action: "unblock",
          kind: "repository",
          githubId: "74",
          reason: "Fixed",
          adminEmail: "nicu@samebase.com",
        },
      },
    ]);
  });

  it.each([
    ["a refusal", () => jsonResponse({ error: "invalid_request" }, 400)],
    ["a wrong key", () => jsonResponse({ error: "invalid_token" }, 401)],
    ["an answer of another shape", () => jsonResponse({ day: 1 })],
  ])("fails on %s from the hub", async (_, answer) => {
    const t = makeConvexTest();
    turnModerationOn();
    stubHub(answer);
    const admin = await viewerWith(t, "nicu@samebase.com");

    await expect(admin.action(api.hubClients.moderation.readOverview, {})).rejects.toThrow(
      "The identity hub answered",
    );
  });
});
